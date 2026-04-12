# Squeaky — To-Do

## In Progress / Next Up

### UX Polish
- [ ] **Fit assessment verdict display** — verdict banner looks machine-esque; needs visual cleanup (easy, UI-only)
- [ ] **Workspace design** — define what the user's workspace should look and feel like: navigation, save/revisit JD decode and fit assessment, overall information architecture. *Scope this before building.*
- [ ] **App landing page & onboarding** — app entry point for new users: value prop, sign-in/up, empty state, first-use guidance. Distinct from the marketing landing page.
- [ ] **User onboarding flow** — guide new users through first session: what to paste, what to expect at each step, why it matters.
- [ ] **Dashboard / pipeline view** — per-opportunity cards: company, title, fit verdict, step progress, download resume. Backend state and data already exist; display layer is the work. *Simpler than it looks.*
- [ ] **Resume reuse across sessions** — if user has a prior resume, confirm which to use instead of always asking for a fresh upload. *Scoping is the hard part: per-user storage? most-recent session? explicit resume library?*
- [ ] **Stripe integration** — paywall for usage beyond a free tier. Decide on model (per-session, subscription, seat) before building.

### Skill Improvements
- [ ] **Non-bullet resume sections** — rewrite should also handle skills, summary, projects sections. Requires schema changes (types.ts), skill prompt additions, diff view extensions. *Schema design is the gating work.*
- [ ] **JD Decoder tone** — make output spikier and more opinionated (voice/tone pass on skill prompt)
- [ ] **JD Decoder section enforcement** — hard limit on section output counts not being respected; needs per-section enforcement
- [ ] **Progressive JD disclosure** — surface the right decoded intel at the right step (business context + no-brainer hire upfront; requirements for fit; targeting signals for rewrite) rather than dumping everything at once

### Observability & Evals
- [ ] **Sentry** — error monitoring for unhandled exceptions in route + orchestrator. Next.js first-class integration, wizard auto-configures most of it. Easy.
- [ ] **AI observability (Langfuse)** — trace every Claude call: latency, token cost, inputs/outputs per skill. Langfuse preferred over Helicone because it handles both tracing and evals in one tool, directly supporting the evals items below. Medium effort, high value.
- [ ] **Product telemetry** — user behavior: step completion rates, drop-off points, session counts. Supabase events table already captures some events (decode_completed, verdict_delivered, resume_targeted) — extend and surface. Consider PostHog if a full analytics UI is wanted. Easy.
- [ ] **AI evals for all skill agents** — structured criteria per skill output (jd-decoder, jd-match, resume-targeting), benchmark inputs, pass/fail scoring, regression tracking across prompt changes. Langfuse (above) is the recommended platform. Not "test until it feels right."
- [ ] **Eval: orchestrator on bad input** — non-JD uploads, garbage text, out-of-order requests
- [ ] **Eval: JD decoder output quality** — section counts, bullet length, tone

### Orchestrator Guardrails
- [ ] Input validation: detect when uploaded content is not a JD and respond gracefully instead of advancing state
- [ ] **Out-of-order step requests** — user asking to go back mid-flow (e.g., "use a different JD" at assessed) routes to handleChat. Needs proper handling.
- [ ] **Reminder bubble UX** — `handleChat` appends a separate reminder bubble after streamed response. Consider folding into streamed reply instead.

### Infrastructure
- [ ] Rename `middleware.ts` → `proxy.ts` (Next.js 16 deprecation warning)

---

## Downstream (post-core)

### New Skills
- [ ] Interview question identification — surface likely questions based on role + fit gap
- [ ] Proof of capability artifact — generate a tailored leave-behind for the hiring manager
- [ ] Outreach drafting — craft targeted message to hiring manager based on decoded JD + background
- [ ] Network path finding — identify 1st & 2nd degree connections relevant to the role
- [ ] Interview practice — conversational prep mode
- [ ] Research prompt ideas from https://www.anthropic.com/candidate-ai-guidance

### Architecture
- [ ] **Dynamic routing / sub-agent spawning** — replace forced linear state machine with an orchestrator that can dynamically route to skills, tools, or sub-agents based on context
- [ ] Cancel mid-stream — pause/abort a response
- [ ] Full end-to-end tests (Playwright) — deferred until core flow is stable

---

## Go-to-Market

- [ ] **Marketing landing page** — external-facing page for PLG motion: headline, value prop, social proof, CTA to sign up. Separate from the in-app landing page.
- [ ] **GTM plan for MVP** — define ICP, acquisition channel(s), activation metric, success criteria. Scope and execute before broader launch.

---

## Done

- [x] Set up testing framework (Vitest)
- [x] Unit tests: `applyStepComplete`, `parseSSEBuffer`, `classifyIntent`, `handleChat`, `resolveSessionContext`, `resume-targeting`, `jd-match-turn1-continue`
- [x] Integration tests: orchestrator step routing (all steps, chat bypass, terminal states, session context)
- [x] Intent classifier — Haiku-powered `classifyIntent` above orchestrator dispatch
- [x] Checkpoint bypass — button clicks bypass classifier entirely
- [x] Session context in chat — `resolveSessionContext` injects artifacts into `handleChat`
- [x] Arc confirmation UX — checkpoint buttons replace free-text y/n
- [x] Scope confirmation UX — checkpoint buttons
- [x] Fit assessment card — pursue/pass buttons inline
- [x] Remove JD fetch confirmation step
- [x] Upload resume prompt moved into JDDecodeCard footer
- [x] Arc snapshot "y to proceed / n to flag" text removed from skill prompt
- [x] Resume targeting Turn 1/2 split — bullet IDs no longer appear in streamed output
- [x] Numbers loop fix — bypass classifier in numbers sub-state; robust needsNumbers detection
- [x] Test isolation fix — fetchMessages reset in beforeEach
