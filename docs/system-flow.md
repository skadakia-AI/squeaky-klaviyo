# Squeaky — System Flow
**Last updated: April 2026**

This document explains how Squeaky works at runtime — what actually happens when a user submits a message, where state lives, how data moves between steps, and how the browser and server stay in sync. It is a companion to `architecture.md`, which covers the static layer structure. This document covers the dynamic behavior.

---

## The Two Worlds

Squeaky has a hard boundary down the middle.

**The browser** is the user's tab, running on their machine. It renders the UI, manages what's displayed in the chat, and decides which checkpoint buttons to show. It has no access to secrets, no direct Supabase connection, and no ability to call Claude. Everything it knows about backend state was told to it through the server.

**The server** is Vercel's infrastructure. It holds the Anthropic API key, the Supabase service role key, and all the logic that touches external systems. It never renders anything. It only responds to HTTP requests.

These two worlds communicate through one channel: **SSE (Server-Sent Events) over HTTP POST**. The browser sends a single POST request containing the user's message. The server opens a streaming response that stays open — sometimes for 30+ seconds during a Claude call — and pushes typed JSON events as things happen. When the stream closes, the exchange is complete.

There is no WebSocket. There is no polling. There is no shared in-memory state. The only way the browser knows anything changed is because the server told it through the stream.

---

## The Two Memory Systems

State in Squeaky lives in two completely separate places. Understanding the difference is essential to understanding why the system is designed the way it is.

### Memory 1: Browser In-Memory State (`ClientState`)

Defined in `app/lib/types.ts`, managed by the `useSession` hook in `app/lib/session.ts`.

This is a JavaScript object in RAM in the user's browser tab. It contains:

| Field | What it holds |
|---|---|
| `messages` | Every message in the chat — user and assistant, including type and any attached data |
| `currentStep` | What step the UI believes the session is at |
| `checkpoint` | Which checkpoint buttons are currently showing (or null) |
| `isStreaming` | Whether a Claude call is in progress |
| `showDiffView` | Whether the diff panel is open |
| `targetingData` | The structured targeting output (rewrites, removals) for the diff view |
| `resumeData` | The structured resume for the diff view |
| `bulletReviews` | Accept/reject decisions the user has made |
| `bulletEdits` | Manual edits the user has made to bullets |
| `error` | The current error state, if any |

This state is **ephemeral**. Closing the tab resets it to zero. It is never written to a database. When the user returns to the app, `getActiveSession()` fetches the session record and message history from Supabase and reconstructs a version of this state from that data.

### Memory 2: Supabase (Persistent)

Three distinct stores within Supabase:

**Sessions table (Postgres)**
The authoritative record of where each session is. Stores `current_step`, `verdict`, `arc_alignment`, `company`, `role`, `status`, and review decisions. This is what gets loaded when the user returns after closing the tab.

**Messages table (Postgres)**
Every user and assistant message, tagged with `session_id` and `step`. This is how multi-turn skill conversations work. When `jd-match` runs Turn 2, it fetches all messages stored under `step: 'resume_loaded'` to reconstruct the conversation history it sends to Claude. Without this table, multi-turn skills would have no memory of what Turn 1 said.

**Storage bucket (`squeaky`)**
Binary file storage. Large text files that are too big for Postgres rows. All paths follow the pattern `users/{user_id}/{session_id}/{filename}`. Files are written by utilities and skill runners; read by skill runners at the start of each call to get their context.

```
users/
  {user_id}/
    {session_id}/
      raw_jd.md              ← written by loadJD, read by jd-decoder
      decoded_jd.md          ← written by jd-decoder, read by jd-match + resume-targeting
      resume_main.md         ← written by loadResume
      resume_structured.json ← written by loadResume, read by jd-match + resume-targeting
      fit_assessment.md      ← written by jd-match Turn 2
      targeted_resume.json   ← written by resume-targeting Turn 2
      export.docx            ← written by exportResume
```

---

## A Full Request Trace

Tracing "user pastes a job description URL and hits enter" from keystroke to rendered output.

### 1. Input captured in `ChatPane.tsx`

`ChatPane` is the UI shell — text input, send button, file upload. When the user submits, `handleSend()` runs and calls `sendMessage({ type: 'text', content: 'https://jobs.acme.com/...' })` from the `useSession` hook.

### 2. `useSession` opens the SSE stream

`sendMessage()` does two things immediately — it does not wait for the server:
- Adds the user's message to the local `messages` array so it appears in the chat now
- Sets `isStreaming: true`, which disables the input
- Calls `openStream()` from `sse.ts`, which fires the HTTP POST to `/api/chat`

### 3. `route.ts` receives the request

The route has three responsibilities only:
- Verifies authentication via Clerk (`auth()`)
- Creates a new session in Supabase if no `session_id` was in the request body, or loads the existing session
- Calls `runOrchestrator()` and wraps its emit calls in an SSE response

The route does not know what step the session is on. It does not make any routing decisions. It delegates entirely.

### 4. `orchestrator.ts` decides what to do

The orchestrator reads `current_step` from the session record. It's `'created'`. It calls `handleCreated()`.

`handleCreated()`:
1. Emits a progress message: `{ type: 'message', content: 'Fetching job description...', progress: true }`
2. Detects input type (URL in this case, since content starts with "http")
3. Calls `loadJD({ type: 'url', content, sessionId, userId })`

### 5. `loadJD()` does the I/O work

`loadJD` lives in `app/lib/utils/load-jd.ts`. It:
1. Validates the URL
2. Fetches it via Jina's reader API (which converts web pages to clean text)
3. Checks if the result looks like a real JD (word count, keyword signals)
4. Writes `raw_jd.md` to Supabase Storage
5. Logs entries in the `files` and `events` Postgres tables
6. Returns `{ success: true, rawText: '...', sparse: false }`

If any step fails, it returns `{ success: false, error: '...', message: '...' }` immediately. No retry — that's the orchestrator's job.

### 6. Orchestrator resumes after `loadJD`

Back in `handleCreated()`:
- Checks the result. If failed, emits `{ type: 'error', ... }` and returns. Session does not advance.
- If succeeded: calls `updateSession()` to write `current_step: 'jd_loaded'` to Postgres, then immediately calls `handleDecodeJD()` — no confirmation step, no pause for user input.

`handleDecodeJD()` emits a progress message, calls `runJDDecoder()`, and on success writes `current_step: 'decoded'` and emits `step_complete: decoded`. The stream then closes.

There is no separate `jd_loaded` interaction phase. The JD is loaded and decoded in a single shot.

### 7. `sse.ts` receives events in the browser

`openStream()` is sitting in a `while(true)` loop reading bytes off the HTTP response body. As chunks arrive:
1. Bytes are appended to a string buffer
2. The buffer is split on `\n\n` (the SSE wire delimiter)
3. Each complete segment is parsed: strip the `data: ` prefix, `JSON.parse` the rest
4. The parsed event is handed to `onEvent()` — the `handleEvent` callback from `useSession`

A single server response may produce many events. They arrive in order over the same connection. The buffer handles the case where a chunk boundary falls in the middle of an event.

### 8. `handleEvent` updates browser state

`handleEvent` in `session.ts` is a switch statement over event types:

- **`session_created`** → stores the new session ID in state
- **`token`** → appends the token text to the last assistant message bubble (or creates a new bubble if none exists)
- **`message`** → adds a complete message bubble to the messages array; if `progress: true`, renders as a muted progress indicator
- **`step_complete`** → calls `applyStepComplete(state, step, data)` to update UI state (see next section)
- **`error`** → removes any incomplete streaming bubble, adds an error message, sets `isStreaming: false`
- **`done`** → sets `isStreaming: false`, re-enables input

React re-renders after each `setState` call. The user sees:
1. The progress bubble ("Fetching job description...") appears
2. The progress bubble ("Decoding job description...") appears
3. The decoded JD card renders (triggered by `step_complete: decoded`, which promotes the streamed text bubble to a `JDDecodeCard`)

---

## What `applyStepComplete` Does and Why It Exists

`applyStepComplete` is a pure function in `session.ts` (input state + step → new state, no side effects). It is the single place where server-driven step transitions update client-side UI state.

It exists because some step completions require non-trivial UI changes that go beyond just updating `currentStep`. The two most important cases:

**`decoded`** — The JD decoder streams its output as a series of `token` events, which the browser assembles into a plain text message bubble in real time. Once the stream is complete and `step_complete: decoded` arrives, that plain text bubble needs to be converted into a `JDDecodeCard` (structured, with sections, rendered as a card component). `applyStepComplete` finds the last assistant text message in the array and changes its `type` from `'text'` to `'jd_decode_card'`. React re-renders. The same content now renders through the card component. The data doesn't change — only the render type does.

**`assessed`** — Identical pattern. The fit assessment streams as plain text. On `step_complete: assessed`, it gets upgraded to `'fit_assessment_card'` with the verdict data attached. The pursue/pass checkpoint buttons appear because `checkpoint` is set to `'pursue_or_pass'`.

Other cases are simpler: set `currentStep`, set or clear `checkpoint`, set `showDiffView`, store `targetingData`.

The reason this is a pure function rather than inline in `handleEvent` is testability — every state transition can be tested by calling the function with a synthetic state and asserting the output. No network, no database, no React rendering required.

---

## How Data Flows Across Steps

Each step produces artifacts in Supabase Storage that the next step reads. This is the "memory" that persists across the full session.

```
User pastes JD
  └─► loadJD()
        writes: raw_jd.md
        ↓
  └─► runJDDecoder()
        reads:  raw_jd.md
        writes: decoded_jd.md
        ↓
User uploads resume
  └─► loadResume()
        calls Haiku to extract structure
        writes: resume_main.md, resume_structured.json
        ↓
  └─► runJDMatchTurn1()
        reads:  decoded_jd.md, resume_structured.json
        writes: Turn 1 messages to messages table
        ↓
User responds to arc snapshot
  └─► runJDMatchTurn2()
        reads:  messages table (resume_loaded step)
        writes: fit_assessment.md
               Turn 2 messages to messages table
        ↓
User confirms targeting scope
  └─► runResumeTargetingTurn1()
        reads:  decoded_jd.md, resume_structured.json
        writes: Turn 1 messages to messages table (assessed step)
        ↓
  └─► runResumeTargetingTurn2()
        reads:  messages table (assessed step)
        writes: targeted_resume.json
               Turn 2 messages to messages table
        ↓
User downloads resume
  └─► exportResume()
        reads:  targeted_resume.json, resume_structured.json
               bullet_reviews and bullet_edits from session
        writes: export.docx
```

If any file is missing when a skill tries to read it, the skill returns `STORAGE_ERROR` immediately. The orchestrator emits an error and does not advance the session.

---

## How Multi-Turn Skills Use Message History

The `jd-match` and `resume-targeting` skills each involve two Claude turns. The conversation history between turns is stored in the messages table, tagged by step.

**Example — jd-match:**

Turn 1 runs when the resume is first uploaded. The skill calls Claude with the decoded JD + structured resume as context. Claude responds with an arc snapshot and a confirmation question. Both the user prompt and the Claude response are written to the messages table under `step: 'resume_loaded'`.

When the user responds to the arc snapshot, two paths are possible:

- **Confirm** (`checkpoint` button, `content: 'confirm'`): Turn 2 runs. The skill fetches all messages for `step: 'resume_loaded'`, appends 'Confirmed, looks right.', and sends the full conversation to Claude for the full fit assessment.
- **Correct** (any other message, including `checkpoint` corrections): `runJDMatchTurn1Continue` runs. It loads the conversation history — which already includes the user's stored correction — and re-runs the LLM with the Turn 1 system prompt. The LLM revises the arc snapshot and asks again. Turn 2 does not run until the user explicitly confirms.

This is what makes multi-turn coherent across the stateless HTTP boundary. Each request to the server is independent — the server has no in-memory session state. The messages table is the conversation memory.

Turn detection in the orchestrator works by counting stored messages: zero assistant messages for the current step means Turn 1 hasn't run yet. If a confirm arrives with no stored history (interrupted session, data loss), the orchestrator detects this and silently restarts Turn 1 rather than attempting Turn 2 on empty context.

---

## How Skills Connect to the Orchestrator

Skills are not standalone. They are called by the orchestrator and receive the orchestrator's `emit` function as an argument. This means tokens stream directly from Claude through the skill to the SSE stream without the orchestrator needing to buffer anything.

```
Orchestrator
  │
  ├─► emits progress message to browser
  │
  └─► calls runJDDecoder(sessionId, userId, emit)
            │
            ├─► reads raw_jd.md from storage
            ├─► calls anthropic.messages.stream()
            │     for each token:
            │       emit({ type: 'token', content: chunk })
            │       ← token goes directly to browser in real time
            │
            ├─► writes decoded_jd.md to storage
            └─► returns { success: true, roleTitle, company, slug }
  │
  └─► on success: updateSession(), emit step_complete
      on failure: emit error, return (session not advanced)
```

The skill does not decide what happens next. It does its specific job and returns a result. The orchestrator owns what happens after.

---

## Intent Classification Gate

Before the orchestrator dispatches to a step handler, it runs a lightweight intent classification step. This is what allows users to ask questions mid-flow without accidentally triggering a state transition.

**What it does:**

The orchestrator calls `classifyIntent(context, userMessage)` in `app/lib/intent-decoder.ts`. This makes a fast Haiku call (max 80 tokens) that returns a typed result:

```typescript
{ action: StepAction, confidence: 'high' | 'low' }
// StepAction: 'confirm' | 'reject' | 'pass' | 'scope_confirm' | 'scope_add'
//           | 'numbers_response' | 'resume_submit' | 'chat' | 'unclear'
```

If `action` is `'chat'` or `'unclear'`, the orchestrator loads session context via `resolveSessionContext()`, then calls `handleChat()` and returns — the state machine never runs. No step advances. No session state changes.

If `action` is a task action (`confirm`, `reject`, `pass`, etc.), the orchestrator stores it as `resolvedAction` and passes it into the step handler. The step handler uses `resolvedAction` instead of string-matching the raw user message.

**Checkpoint buttons bypass classification entirely:**

When a user clicks a checkpoint button (e.g., "This is the right JD — continue"), the UI sends `{ type: 'checkpoint', content: 'confirm' }`. The orchestrator detects `type === 'checkpoint'` and sets `resolvedAction` directly from the content — no Haiku call, no ambiguity. Button clicks have known intent.

**Which steps use classification:**

| Step | Context | Valid actions |
|---|---|---|
| `decoded` | `'decoded'` | resume_submit, chat, unclear |
| `resume_loaded` | `'resume_loaded'` | confirm, chat, unclear |
| `assessed` (pursue/pass) | `'assessed_pursue_or_pass'` | confirm, pass, chat, unclear |
| `assessed` (scope) | `'assessed_scope'` | scope_confirm, scope_add, chat, unclear |
| `assessed` (numbers) | `'assessed_numbers'` | numbers_response, chat, unclear |

**Which steps skip classification:**

`created`, `jd_loaded`, `targeted`, `exported`, `not_pursuing`, `abandoned`. Terminal states, auto-advancing steps, or steps with unambiguous input. File uploads always skip classification regardless of step.

**`handleChat` and session context:**

When the orchestrator routes to `handleChat`, it first calls `resolveSessionContext(userId, sessionId)` from `app/lib/utils/session-context.ts`. This reads every artifact that exists so far for the session — `decoded_jd.md`, `resume_main.md`, `fit_assessment.md` — and returns them as a formatted string. Missing files are silently skipped. `raw_jd.md` is intentionally excluded: the decoded version supersedes it once available, and before decode it is too large and unstructured to be useful in a chat context.

That string is passed into `handleChat` as `artifactContext` and injected into the Claude system prompt, so answers are grounded in actual session content rather than generic knowledge. At the `decoded` step, only the decoded JD exists, so Claude can answer questions about what was just decoded. At `assessed`, Claude has the JD, resume, and fit assessment — the full picture.

`handleChat` uses a per-context system prompt (`CHAT_CONFIGS`) that scopes the response to what is relevant at each step — preventing Claude from jumping ahead or behind in the workflow. After streaming the response, it stores the message under `step: 'chat'` (isolated from skill conversation history).

**Why this design:**

Before this gate, the orchestrator used regex and string matching to distinguish "yes" from "no" from "pass". That broke when users phrased things unexpectedly. The classifier handles natural language. The state machine handles routing. Session context gives `handleChat` the material to answer intelligently. Each component does one job.

---

## The State Machine

The orchestrator routes based on `current_step` read from the Supabase sessions table at the start of each request. Steps advance only on success.

```
created
  └─► (JD submitted) → jd_loaded → decoded  [automatic, no user confirmation]
                                      └─► (resume uploaded) → resume_loaded
                                            └─► (user confirms arc) → assessed
                                                  ├─► (user passes) → not_pursuing  [terminal]
                                                  └─► (user pursues) → targeted
                                                        └─► (user downloads) → exported  [terminal]
```

`jd_loaded` is a transient state — the orchestrator advances through it immediately to `decoded` without waiting for user input. It exists in the DB as a recovery checkpoint: if a session is interrupted between JD load and decode, the next request resumes the decode automatically.

The `resume_loaded` step involves an arc snapshot confirmation loop. The user may make corrections (returning to Turn 1) any number of times before confirming. Only the "Looks right — assess fit" checkpoint button triggers Turn 2 and advances to `assessed`.

The `assessed` step has internal sub-states that are not tracked in the database — they're inferred from message history. The orchestrator detects which sub-state it's in by counting stored messages for the `assessed` step.

---

## What the Utilities Do

Utilities are the I/O layer. They have no routing logic, no Claude calls, no state machine knowledge. They do one thing: talk to an external system.

| Utility | Responsibility |
|---|---|
| `storage.ts` | Read and write files in the Supabase Storage bucket. The only place in the codebase that touches Storage. |
| `messages.ts` | Read and write message history in the Supabase messages table. |
| `update-session.ts` | Write session metadata (current_step, verdict, etc.) to the Supabase sessions table. |
| `load-jd.ts` | Extract JD text from URL/PDF/plain text, validate it, write `raw_jd.md`, log events. |
| `load-resume.ts` | Parse resume file (PDF/DOCX/text), call Haiku for structured extraction, write resume files, log events. |
| `export-resume.ts` | Apply bullet reviews and edits, generate DOCX, write to storage, return signed download URL. |

All utilities return `{ success: true, ...data }` or `{ success: false, error: string, message: string }`. They never throw. They never retry. The orchestrator decides what to do with failures.

---

## The SSE Connection Lifecycle

One SSE connection exists per user message. It is opened when `sendMessage()` is called and closed when the server emits `done`. If the user sends another message while streaming, `sendMessage()` returns early (guarded by `isStreaming`). If the stream is interrupted (network loss, tab close), the server-side work continues — Vercel runs the request to completion even if the client disconnects. The user can refresh and resume from the last persisted step.

The connection uses `fetch` + `ReadableStream`, not `EventSource`. This is required because the endpoint is POST (EventSource only supports GET). There is no automatic reconnect. If the connection drops mid-stream, the user must retry.

---

## Session Recovery

When the app loads, `useSession` calls `getActiveSession()` which hits `/api/session/active`. This endpoint looks up the authenticated user's most recent in-progress session and returns the session record plus its full message history.

If an in-progress session is found, the UI shows a recovery prompt: "You were working on [role] at [company]. Continue where you left off?" If the user confirms, `continueSession()` is called, which populates `ClientState` from the returned data — messages are reconstructed as `type: 'text'` (card types are not persisted; the recovery path renders plain text). The session can then resume from the last persisted step.
