# Squeaky MVP Build Spec
**Last updated: April 2026**

---

## The Product

A chat-driven web app that takes a job description and a resume, decodes what the hiring manager actually wants, assesses the candidate's fit, and rewrites their resume bullets to make the case. The user walks away with a downloaded .docx ready to send.

The interface is a persistent chat window. The orchestrator drives all transitions. Structured outputs (JD decode, fit assessment) render as cards inline in the chat. Resume targeting opens a dedicated full-screen panel.

---

## The Workflow

**Three skills** — analysis, run via Claude API with skill `.md` files as system prompts:
1. **jd-decoder** — reverse-engineers a JD into 11 structured sections
2. **jd-match** — assesses the resume against the decoded JD, delivers a verdict
3. **resume-targeting** — rewrites resume bullets calibrated to the decoded JD

**Four utilities** — I/O and data operations, implemented as TypeScript functions called directly by the orchestrator. Which utility runs and when is governed by session state — pre-skill utilities run before the relevant Claude call, post-skill utilities run after each skill completes. Utility results are handled in code and never surfaced as raw output to the user:
1. **load-jd** — accepts URL, PDF, or pasted text. Fetches/parses content. Validates it looks like a JD. Writes raw text to Supabase Storage. Logs `jd_uploaded` event.
2. **load-resume** — accepts PDF, docx, txt, or pasted text. Two steps: (1) extract raw text (file parsing library for uploads, direct for paste), (2) call Claude (Haiku) to extract structured JSON matching the Resume schema. Writes raw text and structured JSON to Supabase Storage. Logs `resume_uploaded` event.
3. **update-session** — upserts the current session row in Supabase Postgres with verdict, alignment, key factors, current_step, status. Called after each skill completes.
4. **export-resume** — takes structured resume + accepted/rejected bullet decisions, writes clean formatted .docx using standard template. Writes to Supabase Storage. Logs `docx_downloaded` event.

**Two additional utilities** — data access, used by the orchestrator and skill runners:

5. **storage.ts** — read/write files in Supabase Storage. The only place in the codebase that touches Supabase Storage directly. Skill runners use this to fetch their own context (decoded JD, structured resume, etc.).
6. **messages.ts** — read/write conversation history to the messages table. Used by the orchestrator to fetch turn history for multi-turn skill calls.

**One orchestrator** — single entry point at `app/api/chat/route.ts`, discrete Claude API call per skill, multi-turn within checkpoints:
- Reads `current_step` from session and routes to the correct step handler
- Detects which turn a multi-turn skill is on by checking stored message history
- Fetches conversation history for Turn 2 calls via the messages utility
- Calls skill runners with session ID, user ID, turn, and history — skill runners fetch their own context
- Emits SSE events to the client throughout execution
- Calls update-session after each skill completes
- Owns retry logic and error handling — session state never advances on failure

---

## User Experience

### Chat Interface

The primary UI is a persistent chat window. The orchestrator speaks in a direct, conversational tone — not clinical status updates.

Structured outputs render as cards inline in the chat stream. Each card has an embedded CTA to advance the workflow.

**Chat header:** persistent "New role" button. Clicking it mid-workflow shows a confirmation: "This will discard your current session. Continue?" On confirm, creates a new session and resets chat.

**Opening state:** on first load, the chat shows:
> "Drop in a job description — paste a URL, upload a PDF, or paste the text directly. I'll decode what the hiring manager actually wants."
> [file upload component embedded in input]

### Resume Targeting Panel

The diff view cannot live in a chat bubble. When resume-targeting completes, the orchestrator opens a full-screen panel:
- Left column: original bullet
- Right column: rewritten bullet
- Accept / reject toggle per bullet
- Bullets from roles not in scope (not rewritten) appear greyed out, non-editable, included in export unchanged
- "Download .docx" CTA triggers export-resume on click

After download, panel closes and chat shows:
> "Done. Want to try another role? Drop in a new JD."

### Checkpoints

Four defined points where the orchestrator pauses for user input before proceeding:

| # | Name | Trigger | What happens |
|---|---|---|---|
| 0 | JD preview | After load-jd | Show first ~20 lines of parsed content. "Does this look like the right JD?" — y to proceed, n to re-upload |
| 1 | Resume narrative | Inside jd-match, after arc summary | Orchestrator presents how it's reading the career arc. User confirms or corrects (max 2 rounds). Orchestrator incorporates correction and proceeds. |
| 2 | Scope confirmation | Before resume-targeting runs | "I'll rewrite bullets for [Role A] and [Role B] — these map most directly to this role. Want to include others?" User can add roles by name. |
| 3 | Bullet accept/reject | After resume-targeting, before export | Full-screen targeting panel. User accepts/rejects per bullet. Clicks download to finalize. |

### "Not Pursuing" Exit Path

When user clicks "Pass on this role" after fit assessment:
- Session `status` set to `not_pursuing` in sessions table
- `verdict_delivered` event still fires (required for funnel completeness)
- Chat shows: "Got it. This session is saved to your pipeline. Start a new session to work on a different role."
- Orchestrator offers CTA to start new session

### "Not a Fit" + Rewrite Anyway

Verdict does not hard-block resume targeting. If verdict is "not a fit," the "Rewrite my resume" CTA is present with a warning:
> "The assessment found gaps that rewriting alone won't close. You can still target these bullets — just know the gaps identified above will need to be addressed in your application."
User decides.

### Starting a New Session

- "New role" button in chat header — always visible
- After docx download — orchestrator offers new session CTA in chat
- Mid-workflow confirmation before discarding current session
- New session: orchestrator asks "Want to use the same resume or upload a new one?" Options: re-use last uploaded resume for this user (if exists) or upload fresh

### Session Recovery

On page load, the client calls `GET /api/session/active`. Three cases:

- **No active session** — show fresh starting state
- **Active session under 7 days old** — show continuation prompt: *"You were working on [Role] at [Company]. Continue where you left off?"* with Continue / Start fresh. On continue: restore chat from messages, re-show the last checkpoint question so the user can respond. On start fresh: mark old session `abandoned`, show empty state.
- **Active session older than 7 days** — auto-abandon silently, show fresh state

### No Going Back

Only one rollback point exists: **Checkpoint 0** (JD preview). If the user signals the JD looks wrong, the orchestrator resets `current_step` to `created` and asks them to re-enter.

After Checkpoint 0 confirmation, no rolling back within a session. Wrong resume, wrong scope, wrong role — use the "New role" button to start fresh.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Language | TypeScript | Default for all new code |
| Frontend framework | Next.js (App Router) | App Router required for SSE streaming support |
| Deployment | Vercel Pro | Pro plan required — Claude API calls take 15–40s; free tier has a hard 10s limit |
| Auth | Clerk | Email + Google login only |
| Database | Supabase Postgres | |
| File storage | Supabase Storage | |
| AI engine — skills | Claude Sonnet 4.6 | Analysis calls: jd-decoder, jd-match, resume-targeting |
| AI engine — parsing | Claude Haiku 4.5 | Parsing call: load-resume structured extraction only |
| Version control | GitHub (private repo) | Vercel deploys from push to main |

**API routes:** all routes use standard Node.js serverless functions. Routes that call the Anthropic API must set `export const maxDuration = 300` to allow up to 300 seconds execution time. Do not use Vercel Edge Functions — they are incompatible with the file parsing libraries (pdf-parse, mammoth, docx) used in the utilities.

---

## Data Model

### Postgres Tables

**`sessions`**
One row per workflow run.
```
id                uuid          primary key
user_id           string        from Clerk
slug              string        display only — never used as a key or file path anchor
company           string
role              string
created_at        timestamp
updated_at        timestamp
current_step      string        created / jd_loaded / decoded / resume_loaded / assessed / targeted / exported / not_pursuing / abandoned
                                note: jd_confirmed is an SSE signal only — never written to this column
status            string        in_progress / completed / not_pursuing / abandoned
verdict           string        no-brainer / stretch but doable / not a fit
hard_req_status   string
arc_alignment     string        strong / partial / weak
key_factors       string
bullets_total     integer       count of bullets in scope for rewriting
bullets_accepted  integer       count accepted by user in diff view
bullet_reviews    jsonb         { bullet_id: boolean } — accept/reject state per bullet
bullet_edits      jsonb         { bullet_id: edited_text } — user-edited rewritten text (inline edits in diff view)
docx_downloaded   boolean
downloaded_at     timestamp
```

**`messages`**
One row per chat message. Enables session recovery on page refresh and multi-turn skill replay.
```
id            uuid        primary key
session_id    uuid        references sessions
role          string      user / assistant
content       text
step          string      CurrentStep value at time of storage — used to replay skill conversations
created_at    timestamp
```

**`events`**
One row per tracked funnel event.
```
id            uuid        primary key
session_id    uuid        references sessions
user_id       string
event         string      see Analytics section
created_at    timestamp
```

**`files`**
Metadata pointers to files in Supabase Storage.
```
id            uuid        primary key
session_id    uuid        references sessions
user_id       string
file_type     string      raw_jd / resume_source / resume_structured / resume_main / decoded_jd / fit_assessment / targeted_resume / docx_export
storage_path  string
created_at    timestamp
```

### Supabase Storage

One bucket. All files scoped by user and session:
```
/users/{user_id}/{session_id}/raw_jd.md              — raw job description text
/users/{user_id}/{session_id}/resume_source.pdf      — original uploaded file
/users/{user_id}/{session_id}/resume_structured.json — Claude-parsed Resume JSON
/users/{user_id}/{session_id}/resume_main.md         — normalized text
/users/{user_id}/{session_id}/decoded_jd.md          — full 11-section analysis
/users/{user_id}/{session_id}/fit_assessment.md      — verdict and reasoning
/users/{user_id}/{session_id}/targeted_resume.json   — rewritten bullets keyed to bullet IDs (pre accept/reject)
/users/{user_id}/{session_id}/export.docx            — final targeted resume
```

**Rule:** session_id is the organizing key for all file paths. Slug is for display only.

---

## Resume Structured Schema

The structured resume JSON produced by load-resume. Stored at `resume_structured.json`. Used by jd-match, resume-targeting, and export-resume.

```typescript
interface Resume {
  name: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  website?: string
  summary?: string
  experience: Role[]
  education: Education[]
  skills?: string[]
  other?: Section[]
}

interface Role {
  id: string             // unique ID for tracking across diff view and export
  company: string
  title: string
  location?: string
  start_date?: string
  end_date?: string      // date string or "Present"
  description?: string   // descriptive text before bullets, if present
  bullets: Bullet[]
}

interface Bullet {
  id: string             // unique ID for accept/reject tracking
  text: string           // original text
}

interface Education {
  institution: string
  degree?: string
  field?: string
  location?: string
  dates?: string
  notes?: string[]
}

interface Section {
  title: string
  content: string
}
```

---

## Client State Types

Defined in `lib/types.ts`. Used by all components and the session hook.

```typescript
type ClientState = {
  sessionId: string | null
  currentStep: CurrentStep | null
  isStreaming: boolean
  messages: ChatMessage[]
  checkpoint: CheckpointType | null
  showDiffView: boolean
  targetingData: TargetingOutput | null
  resumeData: Resume | null
  bulletReviews: Record<string, boolean>    // bullet_id: accepted
  bulletEdits: Record<string, string>       // bullet_id: edited text
  unreviewedCount: number
  error: { code: string; message: string } | null
}

type CheckpointType =
  | "jd_preview"        // binary buttons: continue | re-enter
  | "arc_confirmation"  // text input: y | correction
  | "scope_selection"   // text input: confirm or adjust roles
  | "pursue_or_pass"    // binary buttons inside FitAssessmentCard
  | "numbers_request"   // text input: provide numbers or skip

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  type: "text" | "jd_decode_card" | "fit_assessment_card" | "error" | "checkpoint_buttons"
  data?: JDDecodeData | FitAssessmentData
  timestamp: number
}
```

---

## Docx Export Approach

Standard template. Does not attempt to mirror the original resume formatting.

**Rationale:** the value delivered is the rewritten content. A clean, consistently formatted .docx is more professional than a PDF-converted resume with broken formatting. The user can apply their own styling in Word.

**Implementation:** `docx` npm library. One template: header (name, contact, location), experience sections (company, title, dates, location, description, bullets), education, skills, other sections.

**Export logic (resolution order per bullet):**
1. `bullet_edits[bullet_id]` exists → use edited text (inline edit treated as accepted)
2. `bullet_reviews[bullet_id] === true` → use accepted rewrite
3. Otherwise → use original text

- Bullets in `flagged_for_removal` where `bullet_reviews[bullet_id] === true` → omitted from export
- Roles not in rewriting scope → all bullets appear with original text
- Full resume exported (all roles with remaining bullets, all sections) — not just the rewritten portions

---

## Claude API Usage

**Streaming analysis calls** — text output skills use `anthropic.messages.stream()`. Tokens are emitted to the client as they arrive via SSE `token` events:
- jd-decoder (full 11-section analysis)
- jd-match Turn 1 (arc snapshot)
- jd-match Turn 2 (full assessment)
- resume-targeting Turn 1 (numbers request, if triggered)

**Non-streaming call** — structured JSON output cannot be streamed meaningfully. Resume-targeting Turn 2 uses `anthropic.messages.create()` and emits the processed result as a single `step_complete: targeted` event once the JSON is parsed:
- resume-targeting Turn 2 (targeting JSON → diff view)

**Parsing call** — resume structured extraction:
- Model: `claude-haiku-4-5-20251001`
- Uses `anthropic.messages.create()` — non-streaming, short response
- Called inside: load-resume only

All analysis skills use model `claude-sonnet-4-6`.

---

## Loading State & Progress

Text-heavy Claude outputs stream token-by-token to the client. The user sees content appearing as Claude generates it — no waiting for full responses. Structured JSON outputs (resume-targeting Turn 2) are buffered server-side and emitted as a single event once parsed.

Progress is communicated via Server-Sent Events (SSE). The orchestrator emits progress update messages and step events throughout execution. The client renders progress strings as ephemeral, centered italic text.

**Mid-stream error handling:** if Claude errors mid-stream, the orchestrator emits an `error` SSE event. The client clears the incomplete assistant bubble and renders the error message. Session state is not advanced.

### SSE Event Contract

| Event | UI action |
|---|---|
| Connection opens | Show first progress update |
| `session_created` | Store `sessionId` in client state |
| `token` | Append token text to current assistant bubble (streaming calls only) |
| `message` (assistant) | Render complete text into assistant bubble (non-streaming calls and short orchestrator messages) |
| `step_complete: jd_loaded` | Show JD preview. Show Checkpoint 0 buttons (Looks right / Re-enter). Hide input. |
| `step_complete: jd_confirmed` | Hide Checkpoint 0 buttons. Show progress: *"Decoding the role..."* SSE-only — not persisted to `current_step`. |
| `step_complete: decoded` | Render JDDecodeCard. Show resume input prompt. Re-enable input. |
| `step_complete: resume_loaded` | Progress update: *"Resume loaded"* |
| `step_complete: assessed` | Render FitAssessmentCard with pursue/pass buttons. Hide input. |
| `step_complete: not_pursuing` | Show *"Session saved"* message. Show new session CTA. Disable input permanently. |
| `step_complete: targeted` | Open DiffViewPanel. Hide input area. |
| `step_complete: exported` | Close DiffViewPanel. Show download link in chat. Show new session CTA. |
| `error` | Clear any incomplete assistant bubble. Render error message. Re-enable input. |
| `done` | Close SSE. Re-enable input if step requires text response. |

---

## Frontend Infrastructure

Three lib files power the client-side of the app. They are layered — `api.ts` is the lowest, `sse.ts` builds on fetch, `session.ts` coordinates both.

---

### `lib/api.ts` — typed fetch wrappers

Handles the two non-streaming API endpoints. No retry logic — errors are returned as typed results and handled by the caller.

```typescript
getActiveSession(): Promise<{ session: ActiveSession | null; messages: StoredMessage[] }>

postReviews(
  sessionId: string,
  bulletReviews: Record<string, boolean>,
  bulletEdits: Record<string, string>
): Promise<{ success: boolean }>
```

The streaming chat endpoint (`/api/chat`) is not in `api.ts` — it is handled by `sse.ts` because it requires stream reading, not a standard JSON response. Auth headers are provided automatically by Clerk's Next.js integration.

---

### `lib/sse.ts` — SSE connection manager

Opens and manages the streaming connection to `/api/chat`. Because the chat endpoint is a POST request, the browser's native `EventSource` API cannot be used — `EventSource` only supports GET. `sse.ts` uses `fetch` with a streaming response body reader and manually parses the SSE wire format (`data: {...}\n\n`).

**Responsibilities:**
- POST to `/api/chat` with the user message and optional session ID
- Read the response body as a `ReadableStream`
- Parse SSE events as they arrive and call the provided event handler
- Emit a local error event if the fetch fails or the stream closes unexpectedly
- Clean up the stream reader on connection close

**Reconnection policy:** no automatic reconnection. If the connection drops mid-stream, `sse.ts` emits an error event. Session state is always preserved server-side — the user retries the same step without re-uploading. Automatic reconnection risks re-triggering Claude calls and adds complexity for negligible benefit.

**Interface:**

```typescript
openStream(
  message: OutboundMessage,
  sessionId: string | null,
  onEvent: (event: OrchestratorEvent) => void
): () => void   // returns a cleanup function to abort the stream
```

`sse.ts` is stateless — it opens a connection, delivers events, and closes. All state lives in `session.ts`.

---

### `lib/session.ts` — useSession hook

The single source of truth for all client state. Owns the SSE connection lifetime — the connection persists independently of component renders, tied to the hook rather than any individual component.

**Why the hook owns the connection:** `ChatPane` is remounted when the user starts a new role (via a `key` prop reset). If `ChatPane` owned the SSE connection, any in-flight Claude call would be cut off on remount. The hook owns the connection so it survives component lifecycle changes.

**State exposed to components** (read-only):

```typescript
sessionId: string | null
currentStep: CurrentStep | null
isStreaming: boolean
messages: ChatMessage[]
checkpoint: CheckpointType | null
showDiffView: boolean
targetingData: TargetingOutput | null
resumeData: Resume | null
bulletReviews: Record<string, boolean>
bulletEdits: Record<string, string>
unreviewedCount: number
error: { code: string; message: string } | null
```

**Actions exposed to components:**

```typescript
sendMessage(message: OutboundMessage): void        // opens SSE connection, streams response
continueSession(sessionId: string, messages: StoredMessage[]): void  // session recovery
abandonSession(): void                             // session recovery — start fresh
acceptBullet(bulletId: string): void
rejectBullet(bulletId: string): void
editBullet(bulletId: string, text: string): void
downloadResume(): Promise<void>                    // submits reviews, triggers export
startNewSession(): void                            // resets all state
```

**SSE event handling inside the hook:**

| Event | State update |
|---|---|
| `session_created` | Set `sessionId` |
| `token` | Append token to last message in `messages` |
| `message` | Append complete message to `messages` |
| `step_complete` | Update `currentStep`, set `checkpoint` or `showDiffView` as appropriate |
| `error` | Set `error`, clear any incomplete streaming message, set `isStreaming: false` |
| `done` | Set `isStreaming: false` |

**Session recovery on mount:**
On first render, the hook calls `getActiveSession()`. Three outcomes:
- No session → render empty state, ready for input
- Active session (< 7 days) → restore `sessionId` and `messages`, set `currentStep`, surface continuation UI
- Session auto-abandoned by server → render empty state

---

## Error Contract

Each layer has a defined return shape. Errors do not bubble silently — every failure produces a typed result that the orchestrator translates into a user-facing SSE error event.

| Layer | Return shape |
|---|---|
| Utilities | `{ success: true, ...data }` or `{ success: false, error: string, message: string }` |
| Skill runners | `{ success: true, output: string }` or `{ success: false, code: string, message: string }` |
| Orchestrator | Owns retry logic and emits `{ type: 'error', code, message }` SSE event |
| Route | Safety net — catches unhandled exceptions, emits generic INTERNAL_ERROR |

**Retry policy:**
- Transient 5xx / network error → retry once after 2s delay
- Rate limit (429) → fail immediately: *"The AI service is busy — wait a moment and try again."* Do not retry.
- Malformed output → fail immediately, no retry
- Session state never advances on failure — user can always retry the same step

---

## File Abstraction Rule

**The web app frontend and skill prompts never touch storage. All storage operations go through the storage utility.**

- Skill runners read their context via `storage.ts`
- The orchestrator writes skill outputs (decoded JD, fit assessment) via `storage.ts`
- load-jd, load-resume, and export-resume handle their own storage operations via `storage.ts`
- Next.js components and client-side code never call Supabase Storage directly

---

## Orchestrator Guardrails

These checks are enforced in code by the orchestrator route — not by a separate hook system.

### Pre-step checks

| Check | What it does |
|---|---|
| Auth | Clerk session token is valid |
| Ownership | session_id belongs to authenticated user_id |
| State machine | Session is in correct current_step for the requested operation |
| File size | Uploaded file is under 5MB |
| URL validation | URL input is http/https and resolves to a public IP (not private range, not localhost) |

### Post-step actions

| Action | What it does |
|---|---|
| Event logging | Logs appropriate event to events table |
| Session update | Updates `sessions.current_step` and `sessions.updated_at` |
| Error handling | On failure: logs error, returns user-facing message, does not advance session state |

### Session state machine

```
created → jd_loaded → decoded → resume_loaded → assessed → targeted → exported
                                                          ↘ not_pursuing
```

### Multi-turn retry UX

For skills with checkpoints (jd-match, resume-targeting), if Turn 2 fails:
- Show in chat: *"Something went wrong — try again."*
- On retry: orchestrator re-fetches stored messages and re-calls Claude — user does not re-type
- After 2 consecutive failures: *"I'm having trouble completing this. Try refreshing — your session will be saved."*

### Missing messages fallback

If Turn 2 finds zero assistant messages for the current step (storage gap from a prior failure):
- Do not attempt Turn 2 with incomplete history
- Restart Turn 1 silently — re-run first Claude call, re-show checkpoint question
- Log the inconsistency server-side, surface nothing to the user

---

## Security

### SSRF protection (load-jd)

Before fetching any user-supplied URL server-side:
1. URL scheme must be `http` or `https`
2. Parse hostname and resolve to IP
3. Reject if IP falls in any private range: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`
4. Reject if hostname is `localhost` or any non-public hostname

### Auth approach

Supabase service role key used server-side only. All API routes filter queries by the authenticated Clerk `user_id`. The service role key bypasses Supabase RLS — the code is responsible for scoping every query. Never expose the service role key client-side.

**Before broader launch:** migrate to full RLS — configure Supabase to verify Clerk JWTs and enforce row-level security at the database level.

### General

- Anthropic API key: server-side only, never in client code or public env vars
- File paths for storage: constructed server-side from `user_id` + `session_id`, never trusted from client input
- Resume content: never logged to the events table — only metadata (file_type, line count)

---

## Analytics

6 events logged to Supabase. No dashboard. No third-party tools.

| # | Event | Fires when |
|---|---|---|
| 1 | `jd_uploaded` | load-jd completes successfully |
| 2 | `decode_completed` | jd-decoder output saved to Supabase Storage |
| 3 | `resume_uploaded` | load-resume completes (both raw text and structured JSON saved) |
| 4 | `verdict_delivered` | jd-match output saved and verdict rendered in chat |
| 5 | `resume_targeted` | User completes bullet accept/reject in targeting panel |
| 6 | `docx_downloaded` | export-resume completes and download initiates |

Note: `verdict_delivered` fires even for "not a fit" verdicts and "pass on this role" sessions.

**The one metric that matters for validation:** docx download rate per completed workflow (events 1–6 all firing in sequence).

---

## Skill Files

Three skill files in `/skills`. Each is a system prompt passed directly to `anthropic.messages.create`.

Current locations: `skills/jd-decoder.md`, `skills/jd-match.md`, `skills/resume-targeting.md`

Input context provided by the orchestrator to each skill:
- **jd-decoder:** `jd_text`, `session_id`, `user_id`
- **jd-match:** `decoded_jd`, `resume`, `session_id`, `user_id`
- **resume-targeting:** `decoded_jd`, `resume`, `scope`, `session_id`, `user_id`

---

## Environment Variables

```
# Anthropic
ANTHROPIC_API_KEY=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=       — used client-side for Storage reads only
SUPABASE_SERVICE_ROLE_KEY=           — server-side only, never expose client-side
```

---

## Repository Structure

```
squeaky-app/
  /skills
    jd-decoder.md                    — system prompt for decode calls
    jd-match.md                      — system prompt for assessment calls
    resume-targeting.md              — system prompt for rewriting calls
  /docs
    architecture.md                  — system architecture and layer diagrams
    mvp_build_spec.md                — this document
    frontend_spec.md                 — UI/UX spec
  /app
    /api
      /chat/route.ts                 — route handler: auth, SSE setup, delegates to orchestrator
      /session
        /active/route.ts             — fetch active session + messages for recovery (GET)
        /reviews/route.ts            — submit bullet reviews after diff view (POST)
    /components
      /layout
        AppLayout.tsx
        Header.tsx
      /chat
        ChatPane.tsx
        MessageList.tsx
        UserMessage.tsx
        AssistantMessage.tsx
        ProgressUpdate.tsx
        ErrorMessage.tsx
        CheckpointButtons.tsx
        InputArea.tsx
      /cards
        JDDecodeCard.tsx
        FitAssessmentCard.tsx
      /diff
        DiffViewPanel.tsx
        DiffHeader.tsx
        DiffBody.tsx
        RoleSection.tsx
        BulletRow.tsx
        OutOfScopeBullet.tsx
        AcceptRejectToggle.tsx
        ObjectiveTag.tsx
        UnquantifiedBadge.tsx
    /lib
      orchestrator.ts                — state machine, step handlers, turn detection
      supabase.ts                    — Supabase client (anon + service role)
      anthropic.ts                   — Anthropic client + model constants
      types.ts                       — Resume, ClientState, CheckpointType, ChatMessage, shared types
      /skills
        jd-decoder.ts                — skill runner: context fetch, message assembly, Claude call, output parse
        jd-match.ts                  — skill runner (multi-turn)
        resume-targeting.ts          — skill runner (multi-turn)
      /utils
        load-jd.ts
        load-resume.ts
        update-session.ts
        export-resume.ts
        storage.ts                   — all Supabase Storage reads/writes
        messages.ts                  — conversation history reads/writes
      session.ts                     — useSession hook, ClientState management
      sse.ts                         — SSE connection, event parsing, reconnect logic
      api.ts                         — typed fetch wrappers for /api/chat, /api/session/*
  .env.local
  .gitignore
  README.md
```
