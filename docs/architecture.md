# Squeaky — System Architecture
**Last updated: April 2026**

---

## Overview

Squeaky is a chat-driven web app with a deterministic, checkpoint-based workflow. The architecture is built in four layers with clean separation of responsibilities. Each layer can change independently, and both current and future interaction modes share the same lower layers.

---

## The Four Layers

```
┌──────────────────────────────────────────────────────────────┐
│                           ROUTE                              │
│                   app/api/chat/route.ts                      │
│                                                              │
│        Auth  ·  SSE setup  ·  Body parsing  ·  Delegate      │
└───────────────────────────────┬──────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────┐
│                        ORCHESTRATOR                          │
│                    app/lib/orchestrator.ts                   │
│                                                              │
│   ┌──────────────────────────┐  ┌───────────────────────┐   │
│   │     WORKFLOW MODE        │  │   CONVERSATION MODE   │   │
│   │       (current)          │  │      (future)         │   │
│   │                          │  │                       │   │
│   │  Deterministic steps     │  │  Open-ended loop      │   │
│   │  State machine routing   │  │  Claude drives next   │   │
│   │  Checkpoint management   │  │  action               │   │
│   │  Turn detection          │  │  No fixed sequence    │   │
│   │  History fetching        │  │                       │   │
│   └──────────────────────────┘  └───────────────────────┘   │
└──────────────────┬───────────────────────┬───────────────────┘
                   │                       │
                   └───────────┬───────────┘
                               │ both modes call the same layers
┌──────────────────────────────▼───────────────────────────────┐
│                       SKILL RUNNERS                          │
│                      app/lib/skills/                         │
│                                                              │
│    jd-decoder.ts      jd-match.ts      resume-targeting.ts  │
│                                                              │
│    Each owns:                                                │
│      · Typed context interface (what files it needs)         │
│      · fetchContext() — reads its own files via storage util │
│      · Message assembly — formats context + history for LLM  │
│      · Claude call — anthropic.messages.create               │
│      · Output parsing — extracts structured data             │
│      · Returns { success, output } or { success, code, msg } │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                         UTILITIES                            │
│                       app/lib/utils/                         │
│                                                              │
│   load-jd.ts        load-resume.ts      update-session.ts   │
│   export-resume.ts  storage.ts          messages.ts          │
│                                                              │
│   storage.ts  — read/write files in Supabase Storage         │
│   messages.ts — read/write conversation history              │
└──────────────────────────────────────────────────────────────┘
```

---

## Request Flow — Workflow Mode

A single request end to end, using the resume upload step as an example.

```
 User: uploads resume
        │
        ▼
 ┌─────────────┐
 │    ROUTE    │── verify auth ──── open SSE stream
 └──────┬──────┘
        │ delegate
        ▼
 ┌─────────────────────────────────────────────────┐
 │              ORCHESTRATOR                        │
 │                                                  │
 │  read current_step from session                  │
 │          │                                       │
 │          ▼                                       │
 │  ┌───────────────────────────────────────┐       │
 │  │           STATE MACHINE               │       │
 │  │                                       │       │
 │  │  created                              │       │
 │  │    │                                  │       │
 │  │  jd_loaded                            │       │
 │  │    │                                  │       │
 │  │  decoded  ◀── current step            │       │
 │  │    │                                  │       │
 │  │  resume_loaded                        │       │
 │  │    │                                  │       │
 │  │  assessed                             │       │
 │  │    │                                  │       │
 │  │  targeted                             │       │
 │  │    │                                  │       │
 │  │  exported                             │       │
 │  └───────────────┬───────────────────────┘       │
 │                  │ dispatch to step handler       │
 │                  ▼                               │
 │  detect turn: Turn 1 (no prior assistant msgs)   │
 │  fetch history: [] (empty, Turn 1)               │
 │  emit SSE: "Reading your resume..."              │
 └──────────────────┬──────────────────────────────┘
                    │ skill.run(sessionId, userId, { turn: 1, history: [] })
                    ▼
 ┌──────────────────────────────────────────────────┐
 │              jd-match SKILL RUNNER               │
 │                                                  │
 │  fetchContext()                                  │
 │    · reads decoded_jd.md      → storage utility  │
 │    · reads resume_structured.json → storage util │
 │                                                  │
 │  assembleMessages()                              │
 │    · formats context + history into LLM input    │
 │    · injects Turn 1 instruction into system      │
 │                                                  │
 │  callClaude()                                    │
 │    · anthropic.messages.create                   │
 │    · on 429 → return { success: false,           │
 │                code: 'RATE_LIMIT' }              │
 │    · on 5xx → retry once after 2s, then error    │
 │                                                  │
 │  parseOutput()                                   │
 │    · extract arc snapshot text                   │
 │                                                  │
 │  return { success: true, output: arcText }       │
 └──────────────────┬───────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────┐
 │         ORCHESTRATOR (resumes)                   │
 │                                                  │
 │  store message via messages utility              │
 │  emit SSE: { type: 'message', content: arcText } │
 │  update session via update-session utility       │
 │  emit SSE: { type: 'step_complete' }             │
 └──────────────────────────────────────────────────┘
```

---

## Adding Conversation Mode Without Breaking Anything

Future conversational features (e.g. "tell me about a project, let's add it to your resume") require an open-ended interaction model the deterministic state machine doesn't suit. This is handled by adding a new mode inside the orchestrator — nothing below it changes.

```
                      ORCHESTRATOR
                           │
              ┌────────────┴─────────────┐
              │                         │
              ▼                         ▼
    WORKFLOW MODE                CONVERSATION MODE
    (exists now)                 (added later)
              │                         │
              │   Deterministic.        │   No fixed steps.
              │   Code drives next      │   Claude decides when
              │   step based on         │   enough context exists
              │   current_step.         │   to call a skill.
              │                         │
              └────────────┬────────────┘
                           │
                           │ both call the exact same layers
                           ▼
              ┌────────────────────────┐
              │     SKILL RUNNERS      │  ← unchanged
              │  jd-match              │
              │  resume-targeting      │
              │  jd-decoder            │
              └────────────────────────┘
                           │
              ┌────────────────────────┐
              │      UTILITIES         │  ← unchanged
              │  storage · messages    │
              │  load-resume · export  │
              └────────────────────────┘

When conversation mode is added:
  ✓ Route          — no change
  ✓ Skill runners  — no change
  ✓ Utilities      — no change
  △ Orchestrator   — one new handler added alongside existing ones
```

---

## Stability by Layer

The lower the layer, the more stable it should be. Changes at one layer should not require changes below it.

| Layer | Changes when | Frequency |
|---|---|---|
| Route | SSE contract changes, new auth provider | Rare |
| Orchestrator | New workflows, new modes, new steps | Occasional |
| Skill runners | Prompt changes, new skills, parsing changes | Regular |
| Utilities | New storage operations, schema changes | Rare |

---

## Error Contract

| Layer | Responsibility |
|---|---|
| Utilities | Return `{ success, error, message }` — no retry |
| Skill runners | Return `{ success, output, code, message }` — no retry |
| Orchestrator | Owns retry logic, session state on failure, user-facing SSE error |
| Route | Safety net — catches anything unhandled, emits generic INTERNAL_ERROR |

**Retry policy:**
- Transient 5xx / network error → retry once after 2s
- Rate limit (429) → fail immediately: *"The AI service is busy — wait a moment and try again."*
- Malformed output → fail immediately, no retry
- Session state never advances on failure

---

## SSE Event Contract

Server-Sent Events (SSE) are used both for progress updates and token-by-token streaming of Claude text output. The route opens one SSE stream per request. The orchestrator emits events down it throughout execution.

**Streaming vs. non-streaming by call:**

| Skill call | Claude API method | Token streaming |
|---|---|---|
| jd-decoder | `messages.stream()` | Yes |
| jd-match Turn 1 | `messages.stream()` | Yes |
| jd-match Turn 2 | `messages.stream()` | Yes |
| resume-targeting Turn 1 | `messages.stream()` | Yes |
| resume-targeting Turn 2 | `messages.create()` | No — JSON output, buffered and processed |

**Mid-stream error:** if Claude errors during a streaming call, the orchestrator emits an `error` event. The client clears the incomplete bubble and renders the error. Session state is not advanced.

| Event | UI action |
|---|---|
| `session_created` | Store sessionId in client state |
| `token` | Append token to current assistant bubble (streaming calls) |
| `message` (assistant) | Render complete text into assistant bubble (non-streaming + short orchestrator messages) |
| `step_complete: decoded` | Render JDDecodeCard. Show resume input prompt. Re-enable input. |
| `step_complete: resume_loaded` | Progress update |
| `step_complete: assessed` | Render FitAssessmentCard with pursue/pass buttons |
| `step_complete: not_pursuing` | Show session saved message, new session CTA |
| `step_complete: targeted` | Open DiffViewPanel |
| `step_complete: exported` | Close DiffViewPanel, show download link |
| `error` | Clear incomplete bubble. Render error message. Re-enable input. |
| `done` | Close SSE connection |
