# Squeaky — To-Do

## Launch Checklist (ship these first)

- [ ] **Rotate API keys (Vercel breach response)** — rotate `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → Data API → regenerate Project Secret Key), `ANTHROPIC_API_KEY` (console.anthropic.com → API Keys), and Clerk secret keys. Update all three in Vercel env vars (Production, Preview, Development) and in `.env.local`. Mark `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` as Sensitive in Vercel for Production and Preview.
- [ ] **Create public repo for Klaviyo role** — duplicate current repo to a new public GitHub repo (`squeaky-klaviyo` or similar): create empty repo on GitHub, then `git remote add klaviyo <url> && git push klaviyo master`. Send that link to Klaviyo.
- [ ] **Separate dev vs. prod environments** — create a second Supabase project (squeaky-dev) and a second Anthropic API key (squeaky-dev) for local development. Update `.env.local` to point to dev credentials only. Vercel Production and Preview continue to use prod credentials. Clerk already provides separate dev/prod instances — verify `.env.local` uses the dev instance keys.
- [ ] **Anthropic Tier 2 upgrade** — deposit $40 in the Anthropic console before any real users arrive. Tier 1 caps at $100/month spend and 8k OTPM; a burst of 5-6 simultaneous users will generate 429s and hard-fail sessions. Tier 2 is 11x the output capacity ($500/month ceiling).
- [ ] **Clerk production mode** — flip Clerk to prod in dashboard, update env vars. No code changes.
- [x] **App landing + empty state** — new user signs in and sees a clear starting point, not a blank screen. Minimum viable onboarding.
- [ ] **Per-user rate cap** — soft daily session limit via Supabase query. Cost protection before Stripe is in. At ~$0.20/session on Sonnet 4.6, Tier 2's $500/month ceiling = ~2,500 sessions/month total.
- [ ] **429 retry with backoff** — orchestrator currently hard-fails on 429 with no retry. At launch with concurrent users this will surface as silent errors mid-flow. Read the `retry-after` response header and retry once before failing.
- [x] **Dashboard / pipeline view** — per-opportunity cards: company, title, fit verdict, step progress, download link. Backend state exists; display layer is the work.
- [ ] **Summary + skills rewrites** — extend resume-targeting to rewrite summary and skills sections (not just bullets). Schema → prompt → diff view → export.
- [ ] **Langfuse tracing** — trace every Claude call for latency, token cost, inputs/outputs. Required for observability from day one.
- [ ] **Confirm Supabase prod project** — verify real user data will land in a production Supabase instance, not a dev one.
- [x] **JD Decoded card cleanup** — reduce verbosity, improve scannability. First impression of the product's output quality.
- [ ] **Funnel query before first user** — write and test the Supabase query that shows step completion rates (JD uploaded → decoded → resume uploaded → assessed → targeted → downloaded). North star: total docx downloads. Quality gate: download rate per completed workflow (exported / targeted sessions) + bullet accept rate. Run on day 2 and weekly after.

---

## Bugs (discovered Apr 20)

- [x] **No-summary resume → no summary generated** — if the uploaded resume has no summary section, resume-targeting never generates one. Should create a new summary even when none exists in the source.
- [ ] **Checkpoint buttons missing after resume swap** — upload wrong doc, then replace it. "Confirm scope", "Tailor my resume" / "Pass" buttons don't re-render. Likely a hydration issue: markers restored from old session state aren't re-applied after the new resume is loaded.
- [ ] **Bullet rewrite latency** — Turn 2 (JSON rewrite) is still slow. Investigate prompt size, model choice, and whether streaming can be added or the payload trimmed.
- [x] **Unreviewed count off-by-one blocks download** — after accepting all bullet rewrites and the summary rewrite, the unreviewed count still shows 1 and the download button stays locked. Fixed: `totalReviewable` now filters against in-scope bullet IDs from the resume, preventing phantom counts from model-generated entries for non-existent or out-of-scope bullets.
- [ ] **Scope adjustment doesn't handle unlisted experience** — when the verdict is "not a fit" because the resume lacks specific evidence (e.g., a tool or project the user has actually done), the scope adjustment flow has no path for the user to say "I've done this but it's not in my resume." Currently the orchestrator only looks at resume content to reframe scope — it can't surface or incorporate experience the candidate mentions conversationally. Need a mechanism to capture user-stated context and fold it into the targeting and narrative.

---

## In Progress / Next Up

### UX Polish — Design Gaps (from design review)

**Ship-blocking:**
- [ ] **Textarea for JD input** — `InputArea` uses `type="text"` (single-line). Pasting a 500-word job description scrolls horizontally and looks broken. Replace with an auto-resizing `textarea`.
- [ ] **Progress animation on loading states** — `ProgressUpdate` renders static text during 30-60s Claude calls. Looks frozen. Add an animated ellipsis or pulse so users know something is happening.
- [ ] **Explain the blocked download button** — Download is `disabled` with only a `title` tooltip explaining why. Users click it, nothing happens, they assume the product is broken. Replace the disabled button with an active "Review [N] remaining →" that scrolls to the first unreviewed bullet, or add visible inline text: "Review all bullets above to unlock."

**High priority:**
- [ ] **Back to dashboard in session view** — no escape from a session except clicking the logo (not a discoverable nav pattern). Add "← My Applications" link to the session header.
- [ ] **Jargon audit: arc, targeting, scope, session** — "arc snapshot", "resume targeting", "adjust scope", "start a new session" are internal product terms. Map each to consumer language: "career summary", "resume rewrites", "include different roles", "add another role".
- [ ] **Explain accept/reject before users hit it** — the diff view requires reviewing every bullet to unlock download, with no explanation of what accepting/rejecting does. Add a one-line explainer at the top and an "Accept all" shortcut for users who trust the rewrites.
- [ ] **Arc confirmation framing** — "Looks right — assess fit" / "Make a correction" gives users no context for what they're confirming or what comes next. Rename to consumer language and signal what's about to happen.

**Medium priority:**
- [ ] **File upload discoverability** — upload button is an unlabeled SVG icon with only a `title` tooltip. Add a text label or use a pill button that reads "Upload PDF" at the `decoded` step where file upload is the primary action.
- [ ] **"Adjust scope" gives no direction** — clicking it clears the checkpoint and shows a blank input with "Type your response...". Set a directive placeholder: "Name any other roles you'd like me to include..." when this state is active.
- [ ] **Edit affordance in diff view** — the pencil edit button is 12×12px with no label; click-to-edit on bullet text has no visual cue. Add a visible "Edit" text link or underline hint on the rewritten text.
- [ ] **Button copy consistency** — `FitAssessmentCard` says "Tailor my resume"; `CheckpointButtons` (pursue_or_pass) says "Target my resume". Same action, two labels. Standardise to "Tailor my resume" everywhere.
- [ ] **Terminal state copy** — "Start a new session" is developer language. Replace bottom bar with two options: "← Back to pipeline" (primary) and "Add another role" (secondary).
- [ ] **Step/progress indicator** — users have no idea how many steps remain or where they are in the flow. Add a minimal indicator (dots or "Step 2 of 4") in the header during active sessions.

---

### UX Polish
- [ ] **User navigation** — navigating between stages of the flow (dashboard → active session → step progress) and revisiting earlier outputs (decoded JD, fit assessment) without losing state. Requires workspace design decision first.
- [ ] **Workspace design** — define what the user's workspace should look and feel like: navigation, save/revisit JD decode and fit assessment, overall information architecture. *Scope this before building.*
- [ ] **App landing page & onboarding** — app entry point for new users: value prop, sign-in/up, empty state, first-use guidance. Distinct from the marketing landing page.
- [ ] **User onboarding flow** — guide new users through first session: what to paste, what to expect at each step, why it matters.
- [x] **Dashboard / pipeline view** — per-opportunity cards: company, title, fit verdict, step progress, download resume. Backend state and data already exist; display layer is the work. *Simpler than it looks.*
- [ ] **Resume reuse across sessions** — if user has a prior resume, confirm which to use instead of always asking for a fresh upload. *Scoping is the hard part: per-user storage? most-recent session? explicit resume library?*
- [ ] **Stripe integration** — paywall for usage beyond a free tier. Decide on model (per-session, subscription, seat) before building.

### Skill Improvements
- [ ] **Experience reframing before bullet rewriting** — current targeting rewrites individual bullets without first asking whether the framing of the entire experience is right for the role. Proposed three-step flow: (1) identify whether each in-scope experience is focused on the right elements given the JD and fit assessment — if not, surface clarifying questions to the user (e.g., "I see hints of technical depth here — can you tell me more about X?"); (2) reframe the experience narrative around the hard skills the role asks for, incorporating user-provided context; (3) only then rewrite and enhance bullet language with quantitative aspects. This requires a new conversational sub-step in the targeting flow before Turn 2, schema changes to capture user-stated context, and prompt changes to resume-targeting.
- [ ] **Summary rewrite prompt** — `skills/summary-rewrite.md` iterated but output still has issues. Known problems: slow generation (Turn 2 itself is slow), abstract phrasing in S3, needs objection-handling mechanic for stretch verdicts. Multiple test sessions run; prompt is mid-iteration. *Resume here next session.*
- [ ] **Non-bullet resume sections** — targeting should also rewrite the summary, skills, and projects sections (not just experience bullets). Requires schema changes (types.ts), skill prompt additions, diff view extensions. *Schema design is the gating work.*
- [ ] **Resume formatting fidelity** — downloaded .docx should match the original uploaded resume as closely as possible: fonts, margins, section spacing, header style. Currently export uses a generic template. Requires reading and replicating the source document's formatting. *See also: Growth & Delight — this is a pre-pricing gate.*
- [ ] **JD Decoder: surface the non-obvious insight** — the decode should lead with what the role is *really* about: org signals, buried priorities, subtext that a seasoned recruiter would catch. Currently it reformats; it needs to reveal. Prompt change in `jd-decoder.md`, no code changes. This is the moment users decide whether the product is smart or just a formatter. *Consider for launch.*
- [ ] **Diff view: surface the "why" behind each rewrite** — the `objective` field already exists per bullet but renders as a small tag. Promote it to a one-line callout explaining the improvement: "Added outcome framing, aligned to their 'data-driven' language." Makes the AI's reasoning legible and turns a functional UI into a moment of feeling understood.
- [ ] **JD Decoder tone** — make output spikier and more opinionated (voice/tone pass on skill prompt)
- [ ] **JD Decoder section enforcement** — hard limit on section output counts not being respected; needs per-section enforcement
- [ ] **Progressive JD disclosure** — surface the right decoded intel at the right step (business context + no-brainer hire upfront; requirements for fit; targeting signals for rewrite) rather than dumping everything at once

### Observability & Evals
- [x] **Sentry** — error monitoring for unhandled exceptions in route + orchestrator.
- [ ] **AI observability (Langfuse)** — trace every Claude call: latency, token cost, inputs/outputs per skill. Langfuse preferred over Helicone because it handles both tracing and evals in one tool, directly supporting the evals items below. Medium effort, high value.
- [ ] **Product telemetry** — funnel visibility via Supabase queries on the existing `sessions` table (step, timestamps, verdict, bullet_reviews). No separate events table or third-party tool needed yet. PostHog deferred until user volume justifies it. Key metrics: total docx downloads (north star), download rate per completed workflow (exported / targeted), bullet accept rate (quality gate: >40%), return sessions (retention), time JD upload → download (trust signal).
- [ ] **AI evals for all skill agents** — structured criteria per skill output (jd-decoder, jd-match, resume-targeting), benchmark inputs, pass/fail scoring, regression tracking across prompt changes. Langfuse (above) is the recommended platform. Not "test until it feels right."
- [ ] **Eval: orchestrator on bad input** — non-JD uploads, garbage text, out-of-order requests
- [ ] **Eval: JD decoder output quality** — section counts, bullet length, tone

### Orchestrator Guardrails
- [x] Input validation: Haiku classification rejects non-JD content in `load-jd.ts` and non-resume content in `load-resume.ts` before advancing state
- [ ] **Out-of-order step requests** — user asking to go back mid-flow (e.g., "use a different JD" at assessed) routes to handleChat. Needs proper handling.
- [ ] **Reminder bubble UX** — `handleChat` appends a separate reminder bubble after streamed response. Consider folding into streamed reply instead.

### Infrastructure
- [x] Rename `middleware.ts` → `proxy.ts` (Next.js 16 deprecation warning)

### Tech Debt
- [ ] **Delete `JDDecodeData` type** — defined in `types.ts` but never populated anywhere; JD decode renders as markdown, not structured sections. Remove type and its branch in `ChatMessage.data?`.
- [ ] **Deduplicate verdict block parser** — `parseVerdictFromText` (`session.ts`) and `parseVerdictBlock` (`jd-match.ts`) implement the same regex-based field extraction. Extract to a shared utility importable by both client and server.

---

## Downstream (post-core)

### Growth & Delight
- [ ] **Shareable fit verdict card** — a public URL + OG image for the fit assessment result ("No-brainer hire for [Role] at [Company]"). Job searching is private suffering; this makes one moment positive and public. Likely the highest-leverage acquisition feature in the product — do this before any paid marketing spend. Requires a public route, a read-only session share token, and a card render endpoint.
- [ ] **Resume formatting fidelity (pre-pricing gate)** — the downloaded .docx is the product's closing argument. If it looks generic, all the upstream intelligence feels wasted. Nail the formatting before putting a price on the product. Hard engineering problem (mammoth + docx template matching) but directly determines willingness to pay.

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

## Consumer-Grade Polish (post-launch, not MVP gating)

### Reliability
- [ ] **Better error UX** — "Something went wrong" is not consumer-grade. Each error code should map to a human-readable, actionable message (e.g., "We couldn't fetch that URL — try pasting the job description as text instead").
- [ ] **Stuck-state recovery audit** — walk every possible mid-flow failure (PDF parse hang, Supabase Storage 503, Anthropic timeout) and verify the user has a clear path forward. Quantification panel hydration was one; there may be others.
- [ ] **Session abandonment cleanup** — orphaned sessions leave PDFs and structured JSON sitting in Supabase Storage indefinitely. Add a scheduled cleanup for sessions abandoned >30 days with no export.

### UX & Access
- [ ] **Mobile responsiveness** — fixed-position panels (QuantificationPanel, DiffView) are almost certainly broken on small viewports. Test and fix layout on mobile before any public-facing promotion.
- [ ] **Accessibility** — keyboard navigation, focus management, screen reader labels. Not blocking for MVP but required before any meaningful user volume.
- [ ] **File size limits enforced client-side** — currently only validated server-side. Add client-side check before upload to give instant feedback instead of a mid-upload error.

### Trust & Privacy
- [ ] **Data retention policy** — resumes are sitting in Supabase Storage with no deletion flow. Users need a way to delete their data, and there should be a stated retention policy before any public launch.
- [ ] **Privacy policy** — required before storing any real user data at consumer scale. Covers resume storage, Anthropic API data handling, Clerk auth data.

### Cost & Operations
- [ ] **Spend alerting** — set a Anthropic console spend alert at 80% of the monthly ceiling so you're not surprised by a cutoff mid-month.
- [ ] **Cost monitoring per user** — track Anthropic spend per `user_id` in the `sessions` table (token counts already available in API responses). Needed to identify abuse and inform pricing decisions.

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
- [x] Fit assessment verdict display — colored banner, key factors, arc alignment row, narrative with color-coded status dots
- [x] QuantificationPanel design — card shell, uppercase column headers, matching DiffHeader aesthetic
- [x] Diff view design — DiffHeader card style, BulletRow color-coded rows, consistent typography
- [x] Input validation — Haiku classification in `load-jd.ts` (rejects About pages, blog posts) and `load-resume.ts` (rejects essays, cover letters) before advancing state
- [x] Error handler strips stale progress messages on failure
- [x] JDDecodeCard upload prompt footer is conditional — hides once user moves past `decoded` step
- [x] Sentry error monitoring and session replay
- [x] Dashboard — session list with status, fit, next step, artifact drawer (Decoded JD / Fit / Tailored Resume), remove, download; lazy session creation via /session/new; /session/[id] routing; useSession tests
- [x] Session hydration fixes — checkpoint restoration, targeting diff view, base64 display bug; routing bug fix (window.history.replaceState instead of router.replace to avoid wiping SSE state mid-stream)
