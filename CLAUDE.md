@AGENTS.md

## Security Rules for Claude

**Never read `.env.local`, `.env`, or any `.env*` file.** These contain production secrets.
**Never run `git push` without explicit user instruction and confirmation.**

---

## Test Rule

Any change to `app/lib/orchestrator.ts`, `app/lib/session.ts`, `app/lib/sse.ts`, any file in `app/lib/skills/`, or any file in `app/lib/utils/` that adds or changes behavior **must** include a corresponding test addition or update in the same session.

- New step handler → new orchestrator integration test covering the happy path and at least one error path
- New branch or condition in existing logic → test that exercises the new branch
- Bug fix → test that would have caught the bug before the fix
- Intentional behavior change → update the existing test to reflect the new expected behavior

Do not mark a coding task complete without verifying the test suite covers the new behavior. Run `npm run test` before finishing.

# Squeaky — Project Guide for Claude

## What This Is

A chat-driven web app that decodes job descriptions, assesses resume fit, and rewrites resume bullets. Users download a targeted `.docx`. Built on Next.js App Router, Clerk auth, Supabase (Postgres + Storage), Anthropic API.

Full spec: `docs/mvp_build_spec.md`. Architecture detail: `docs/architecture.md`. Runtime behavior: `docs/system-flow.md`.

---

## Four-Layer Architecture

```
Route (app/api/chat/route.ts)
  └─ auth, SSE setup, parse body, delegate
Orchestrator (app/lib/orchestrator.ts)
  └─ state machine, step handlers, turn detection, retry
Skill Runners (app/lib/skills/)
  └─ each fetches its own context, calls Claude, parses output
Utilities (app/lib/utils/)
  └─ storage.ts, messages.ts, load-jd.ts, load-resume.ts, update-session.ts, export-resume.ts
```

**Rule:** the route only does auth + SSE setup. The orchestrator owns session logic. Skill runners own Claude calls. Utilities own I/O. Don't collapse layers.

---

## Session State Machine

```
created → jd_loaded → decoded → resume_loaded → assessed → targeted → exported
                    ↑ automatic                           ↘ not_pursuing
```

`jd_loaded` is a transient recovery checkpoint — the orchestrator advances through it to `decoded` immediately without waiting for user input. There is no JD confirmation step.

---

## SSE Event Contract

| Event | What it means |
|---|---|
| `session_created` | New session ID |
| `token` | Append to streaming assistant bubble |
| `message` | Render complete assistant message |
| `step_complete: <step>` | Step advanced — update UI state |
| `error` | Clear incomplete bubble, show error |
| `done` | Stream closed |

Streaming calls emit `token` events. Short orchestrator messages and non-streaming skill outputs use `message`.

---

## Streaming Policy

- **Text outputs** (jd-decoder, jd-match Turn 1+2, resume-targeting Turn 1): `anthropic.messages.stream()` → emit `token` events
- **JSON output** (resume-targeting Turn 2): `anthropic.messages.create()` → buffer → emit `step_complete: targeted`

---

## Skill Runners

Each runner in `app/lib/skills/` is responsible for:
1. Fetching its own context via `storage.ts`
2. Reading its skill prompt from `/skills/<name>.md`
3. Calling Claude (streaming or not)
4. Parsing output and writing results to storage
5. Returning `{ success: true, ... }` or `{ success: false, code, message }`

**Skill context inputs** (what each runner reads from storage):
- `jd-decoder.ts` — reads `raw_jd.md`
- `jd-match.ts` — reads `decoded_jd.md`, `resume_structured.json`
- `resume-targeting.ts` — reads `decoded_jd.md`, `resume_structured.json`

---

## Error Contract

| Layer | Shape |
|---|---|
| Utilities | `{ success: true, ...data }` or `{ success: false, error: string, message: string }` |
| Skill runners | `{ success: true, ... }` or `{ success: false, code: string, message: string }` |
| Orchestrator | Owns retry. 1× retry after 2s for transient 5xx. Immediate fail for 429 and parse errors. |
| Route | Safety net — catches unhandled throws, emits `INTERNAL_ERROR` |

Session state **never advances on failure**.

---

## Storage Convention

One Supabase bucket (`squeaky`). All paths: `users/{user_id}/{session_id}/{filename}`.

```
raw_jd.md
resume_source.pdf
resume_structured.json
resume_main.md
decoded_jd.md
fit_assessment.md
targeted_resume.json
export.docx
```

`storage.ts` is the **only** place that touches Supabase Storage. No component or skill touches it directly.

---

## Models

```typescript
MODELS.analysis = 'claude-sonnet-4-6'   // jd-decoder, jd-match, resume-targeting
MODELS.parsing  = 'claude-haiku-4-5-20251001'  // load-resume structured extraction only
```

---

## Key Constraints

- `export const maxDuration = 300` on every route that calls Anthropic — never remove this
- Do **not** use Vercel Edge Functions — incompatible with pdf-parse, mammoth, docx
- Supabase service role key is server-side only — never in client code or env vars prefixed `NEXT_PUBLIC_`
- File paths for storage are constructed server-side from `user_id` + `session_id` only — never from client input
- SSRF protection required on any URL fetch: reject private IPs, `localhost`, non-http(s) schemes

---

## Multi-Turn Skill Flow

**jd-match** (step: `resume_loaded`):
- Turn 1: arc snapshot → checkpoint buttons (confirm / correct)
- Corrections re-run Turn 1 via `runJDMatchTurn1Continue` — only `confirm` triggers Turn 2
- Turn 2: full assessment → parse `verdict`, `hard_req_status`, `arc_alignment`, `key_factors`

**resume-targeting** (step: `assessed`):
- Orchestrator first proposes scope (no Claude call)
- Turn 1: bullet audit — may ask for numbers. If it does, wait for user response. If not, run Turn 2 immediately.
- Turn 2: JSON rewrite output → parse and emit as `step_complete: targeted`

Turn detection: check stored message history for the step via `messages.ts`.

---

## Missing History Fallback

If Turn 2 finds zero assistant messages for the current step:
- Do not attempt Turn 2
- Restart Turn 1 silently (re-run first Claude call)
- Log the inconsistency server-side, surface nothing to the user

---

## Resume Structured Schema

See `app/lib/types.ts` for `Resume`, `Role`, `Bullet`, `Education`, `Section`.
Bullet IDs format: `r{i}-b{j}` (e.g. `r0-b0`). Role IDs: `r0`, `r1`, etc.

---

## Implementation Status

All four layers are fully implemented — do not create files that already exist. For runtime behavior detail see `docs/system-flow.md`.
