# Squeaky — To-Do

## In Progress / Next Up

### JD Decoder
- [ ] Remove JD fetch confirmation step — go straight to decode after load
- [ ] Make output spikier and more opinionated (voice/tone pass on skill prompt)
- [ ] Fix section output counts — hard limit not being respected by model; needs per-section enforcement
- [ ] Fix arc alignment formatting in fit assessment card (issue #5, deferred)

### Orchestrator Guardrails
- [ ] Input validation: detect when uploaded content is not a JD and respond gracefully instead of advancing state
- [ ] Broader: define what "invalid input" looks like at each step and handle explicitly (don't let the LLM respond freely then ignore it)

### Tests
- [x] Set up testing framework (Vitest — done)
- [x] Unit tests: `applyStepComplete` (all 9 step transitions), `parseSSEBuffer` (11 cases)
- [x] Integration tests: orchestrator step routing — 36 tests covering all steps, chat bypass, terminal states, session context loading
- [x] Unit tests: `classifyIntent` (29 tests — all contexts, failure modes, prompt construction)
- [x] Unit tests: `handleChat` (12 tests — streaming, storage, reminders, artifact context injection, error handling)
- [x] Unit tests: `resolveSessionContext` (8 tests — loads what exists, skips missing, ordering, edge cases)
- [ ] Eval: JD decoder output quality (section counts, bullet length, tone)
- [ ] Eval: orchestrator behavior on bad input (non-JD uploads, garbage text)

### Infrastructure
- [ ] Rename `middleware.ts` → `proxy.ts` (Next.js 16 deprecation warning)

---

## Backlog

### Product
- [ ] Dashboard / landing page — user sees all roles, all analyses, all resume versions in one place
- [ ] Better activation messaging — empty states, onboarding copy, first-use guidance
- [ ] Ability to cancel mid-stream — pause/abort a response and start something else

### UI
- [ ] Visual refresh — current UI is too gray/flat; needs more personality and energy

### Chat UX — Known Issues
- [ ] **`resume_loaded` "y" bug** — arc snapshot confirmation asks user to type "y" to proceed; classifier misreads it as chat. Same root cause as the `jd_loaded` checkpoint fix. Fix: make arc snapshot confirmation a checkpoint button (like `jd_preview`) rather than free text.
- [ ] **Lint warnings (pre-existing)** — 3 unused var warnings: `getServiceClient` in `orchestrator.ts`, `_bulletId` in `BulletRow.tsx`, `emit` in `resume-targeting.ts`. Low priority cleanup.

### Architecture
- [x] **Intent classifier** — Haiku-powered `classifyIntent` sits above the orchestrator dispatch; routes chat/unclear to `handleChat`, passes typed `resolvedAction` to the state machine. String-matching branches removed from orchestrator.
- [x] **Checkpoint bypass** — button clicks send `type:'checkpoint'` with action name directly, bypassing classifier entirely. Applies to all checkpoint buttons in the UI.
- [x] **`decoded` step classification** — removed from `SKIP_CLASSIFICATION`; questions at this step now route to `handleChat` instead of being treated as resume submissions.
- [x] **Session context in chat** — `resolveSessionContext` loads all existing artifacts (decoded JD, resume, fit assessment) and injects them into `handleChat` system prompt so answers are grounded in actual session content.
- [ ] **Phase 5: unclear handling** — `unclear` intentionally routes same as `chat`. If live testing shows poor behavior, add clarification instruction to `handleChat` system prompt. No code change needed yet.
- [ ] **Reminder bubble UX** — `handleChat` appends a separate reminder bubble after the streamed response. Consider folding into the streamed reply instead (less jarring).
- [ ] **Out-of-order step requests** — user asking to go back mid-flow (e.g., "use a different JD" at assessed) routes to handleChat which says to start new session. Needs proper handling.
- [ ] **assessed_numbers refinement** — classifier context may need more nuance; deferred.
- [ ] **Eval framework** — replace vibes-based testing with a structured eval system: defined criteria per skill output, benchmark inputs, pass/fail scoring, and regression tracking across prompt changes. Not "test until it feels right."
- [ ] **Dynamic routing / sub-agent spawning** — replace forced linear state machine with an orchestrator that can dynamically route to skills, tools, or sub-agents based on context. Clean separation of concerns and delegation must be preserved (each skill knows its role, inputs, outputs), but the routing should be fluid and agentic — not hardcoded step → step.
- [ ] **Progressive JD disclosure** — rethink what decoded JD information surfaces at which step. Some sections are relevant upfront (business context, no-brainer hire); others are more useful downstream (success criteria for targeting, requirements for fit assessment). Surface the right intel at the right moment rather than dumping everything at once.

### Testing
- [ ] Full end-to-end test (Playwright or similar) — deferred until core flow is stable
- [ ] Session recovery UI polish
- [ ] Multi-role support (if project scales to team)
