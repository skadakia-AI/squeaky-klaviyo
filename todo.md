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
- [ ] Set up testing framework (Vitest recommended for Next.js)
- [ ] Unit tests: `applyStepComplete` (all step transitions), SSE wire format parsing in `sse.ts`
- [ ] Integration tests: orchestrator step routing (mocked Supabase + Anthropic), `handleAssessed` sub-state detection
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

### Architecture
- [ ] **Orchestrator UX** — should feel conversational and intuitive, like a smart advisor keeping the user on track; not a rigid step-by-step funnel. User objectives are the constraint, not the sequence.
- [ ] **Eval framework** — replace vibes-based testing with a structured eval system: defined criteria per skill output, benchmark inputs, pass/fail scoring, and regression tracking across prompt changes. Not "test until it feels right."
- [ ] **Dynamic routing / sub-agent spawning** — replace forced linear state machine with an orchestrator that can dynamically route to skills, tools, or sub-agents based on context. Clean separation of concerns and delegation must be preserved (each skill knows its role, inputs, outputs), but the routing should be fluid and agentic — not hardcoded step → step. Connects to LLM-router evaluation below.
- [ ] **Rethink deterministic orchestrator vs. LLM-based router** — evaluate whether a routing model would handle edge cases (bad input, ambiguous state, user going off-script) better than the current state machine.
- [ ] **Progressive JD disclosure** — rethink what decoded JD information surfaces at which step. Some sections are relevant upfront (business context, no-brainer hire); others are more useful downstream (success criteria for targeting, requirements for fit assessment). Surface the right intel at the right moment rather than dumping everything at once.

### Testing
- [ ] Full end-to-end test (Playwright or similar) — deferred until core flow is stable
- [ ] Session recovery UI polish
- [ ] Multi-role support (if project scales to team)
