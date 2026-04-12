# Design Decisions
**Last updated: April 2026**

A running log of significant design decisions — what was decided, what alternatives were considered, and why. Focused on the web app. CLI-era decisions are retained where the rationale still applies.

---

## Skill Architecture

### Two-skill design: jd-decoder + jd-match
**Decision:** Split role analysis and candidate evaluation into two separate skills.
**Alternatives considered:** One combined skill; three skills (decoder, ICP generator, matcher).
**Rationale:** The decoded JD is a reusable artifact — it analyzes the role independently of any candidate. Keeping it separate means you can decode once and run multiple assessments against it (e.g., different resume versions, future multi-candidate use). Three skills was too granular — the no-brainer hire profile (Section 11) flows directly from the JD analysis and requires no additional inputs, so it belongs inside the decoder.

---

### ICP definition inside jd-decoder (Section 11)
**Decision:** The no-brainer hire profile lives as Section 11 of the decoded JD, not as a separate skill.
**Alternatives considered:** Separate skill; generated on demand inside jd-match.
**Rationale:** The ICP requires no inputs beyond the JD itself — it's a synthesis of the preceding 10 sections. Generating it inside the decoder means the decoded file is a complete, standalone deliverable. A separate skill adds a step with no benefit.

---

### Full analysis for all verdicts including "not a fit"
**Decision:** Every verdict — including not a fit — gets the full assessment. No early exit after the hard requirements check.
**Alternatives considered:** Early exit (stop after 2+ Not Met; skip arc alignment).
**Rationale:** Two reasons. First, the skill might misread the resume — the user needs enough detail to catch and challenge the assessment. Second, not-a-fit cases are worth understanding. Knowing *why* something was filtered out is the signal that improves targeting over time. A truncated assessment loses that.

---

### Resume arc snapshot confirmed by user before assessment proceeds
**Decision:** After reading the structured resume, jd-match prints a career arc summary and asks the user to confirm before running the full assessment.
**Alternatives considered:** Run assessment without confirmation; show raw extracted text.
**Rationale:** PDF extraction is imperfect — complex layouts and encoding issues can produce garbled or misordered content. If the skill misreads the resume and the user doesn't catch it, the entire assessment is built on bad input. The snapshot confirmation is a lightweight catch before it matters.

---

### Discrete Claude API calls per skill (not persistent conversation)
**Decision:** Each skill invocation is a fresh Claude API call. Multi-turn within a skill is handled by replaying stored messages from the database.
**Alternatives considered:** Persistent conversation thread per session; streaming multi-turn.
**Rationale:** Discrete calls are cheaper (only pay for context relevant to the current step), stateless (serverless-compatible), and simpler to reason about. The orchestrator has everything needed to reconstruct context from Supabase — there's no quality loss from starting each call fresh. A persistent thread would create timeout risks and make the architecture stateful in ways that conflict with serverless execution.

---

### Skills as system prompts, not tool definitions
**Decision:** Skill `.md` files are passed as system prompts to `anthropic.messages.create`. The orchestrator calls utilities directly in code — they are not registered as Claude tools.
**Alternatives considered:** Register utilities as Claude tools and let Claude decide when to call them; agent model with tool access.
**Rationale:** The workflow is deterministic. Claude deciding when to call load-jd or update-session adds unpredictability with no benefit — those calls happen at defined points in a fixed sequence. Direct orchestration in code is cheaper, faster, more debuggable, and easier to test. The agent model is reserved for future conversational features where open-ended decision-making is actually needed.

---

### Haiku for intent classification, Sonnet for analysis
**Decision:** The intent classifier (`classifyIntent` in `intent-decoder.ts`) uses Claude Haiku. All analysis skills (jd-decoder, jd-match, resume-targeting) use Claude Sonnet.
**Rationale:** Intent classification is a narrow extraction task — given a context description and a user message, return a JSON action label. This requires no reasoning, no domain synthesis, no judgment. Haiku is fast (< 1s) and cheap enough to run on every user message without adding meaningful latency or cost. Sonnet is reserved for tasks requiring nuanced judgment: decoding what a hiring manager actually wants, assessing candidate fit, rewriting resume bullets. Using Sonnet for classification would add cost and latency with no quality benefit.

---

### Claude Haiku for resume parsing, Sonnet for analysis
**Decision:** Claude Haiku (`claude-haiku-4-5-20251001`) is used for structured JSON extraction in load-resume. Claude Sonnet 4.6 is used for all analysis skills.
**Rationale:** Resume parsing is pure extraction — convert text to a matching JSON schema with no inference or judgment. Haiku is fast and cheap enough for this. Sonnet is reserved for where reasoning quality, nuanced judgment, and domain synthesis matter. This split reduces cost per session by roughly 40–50% with no quality impact on analysis outputs.

---

## Intent Classification

### Checkpoint buttons for high-stakes binary confirmations
**Decision:** Arc snapshot confirmation and scope confirmation use checkpoint buttons rendered in the UI rather than free-text input classified by the intent classifier. Buttons send `{ type: 'checkpoint', content: 'action_name' }` directly, bypassing the classifier entirely.
**Alternatives considered:** Classify typed responses ("yes", "looks right", "this scope works") through the intent classifier same as other steps.
**Rationale:** The classifier is a probabilistic Haiku call. For high-stakes confirmations — "does this arc accurately represent my background?" and "is this the right targeting scope?" — misclassification has real consequences: advancing to assessment with bad context, or targeting the wrong roles. A button click has exact semantics; there is no ambiguity to classify. The pattern also makes the required action explicit to the user rather than relying on them to phrase a response the classifier will read correctly. Any step where the binary choice matters enough that misclassification would corrupt downstream work should use buttons.

---

### assessed_numbers sub-state bypasses the classifier
**Decision:** When the orchestrator is waiting for numbers (Turn 1 asked for metrics, user hasn't responded yet), `resolveIntentContext` returns `null` instead of `'assessed_numbers'`, bypassing the intent classifier entirely. Any user message in this sub-state triggers Turn 2 directly.
**Alternatives considered:** Classify as `numbers_response` / `chat` / `unclear` using the normal classifier path.
**Rationale:** "Skip" is the canonical example of why this is hard. In `assessed_pursue_or_pass` context, "skip" correctly means "pass on this role." In numbers context, "skip" means "proceed without metrics." A classifier given `assessed_numbers` context and the message "skip" can produce either reading depending on how the description is worded — and even a well-worded description is fragile. Since there is no meaningful action to take in this sub-state other than proceeding to Turn 2 (there is no "wait longer" or "abort" path), bypassing the classifier is strictly correct. The only exception would be a genuine question ("why do you need these?"), which gets handled after the fact when the user sees the rewrite output.

---

## Orchestrator & State Machine

### Single API endpoint with state machine routing
**Decision:** One POST endpoint (`/api/chat/route.ts`) handles all workflow steps, routing by `current_step`.
**Alternatives considered:** Separate API routes per step (`/api/chat/decode`, `/api/chat/assess`, etc.).
**Rationale:** A single endpoint keeps the client simple (one SSE connection per user action) and session state coherent. Separate routes would require the client to know which endpoint to call at each step — coupling UI to server routing logic. The state machine belongs on the server.

---

### JD load and decode run in one shot — no confirmation step
**Decision:** After the user submits a job description, the system loads it and decodes it immediately without stopping to confirm the extracted text. `jd_loaded` exists as a state in the database only as a recovery checkpoint — the orchestrator passes through it automatically.
**Alternatives considered:** Show the raw extracted JD text and ask the user to confirm before decoding; allow editing of the raw text.
**Rationale:** The decoded JD is the artifact with value — the raw extracted text is an intermediate. Showing it adds a step with no benefit: users are not equipped to evaluate whether the raw extraction is complete or correct, and the decoder handles noisy input well. If the source content was wrong (wrong URL, wrong PDF), the decoded output makes that obvious and the user can start a new session. `jd_loaded` is retained as a DB state so that a session interrupted between load and decode can resume automatically on next request rather than losing the fetched content.

---

### Checkpoint 0 is the only rollback point
**Decision:** The only rollback is Checkpoint 0 (JD preview). All subsequent confirmations are one-way. "New role" is the recovery mechanism for everything else.
**Alternatives considered:** Allow rollback at any checkpoint; soft rollback via "undo."
**Rationale:** Multi-step rollback requires tracking which data to delete, which steps to re-enable, and how to handle partially-completed downstream steps. Checkpoint 0 is the only case where rollback adds enough value to justify the complexity — catching a wrong JD before a full decode is cheap. After that, the session has generated substantial computed artifacts. Starting fresh is the correct and simpler path.

---

### Session recovery threshold: 7 days
**Decision:** Active sessions under 7 days show a continuation prompt on page load. Sessions older than 7 days are auto-abandoned silently.
**Alternatives considered:** Always show continuation; 24-hour threshold.
**Rationale:** A week-old in-progress session almost certainly represents abandoned work. Always showing continuation for arbitrarily old sessions surfaces stale state the user has moved past. 7 days covers weekends and short breaks without becoming noise.

---

## Data & Storage

### Separate fit_assessment.md from decoded_jd.md
**Decision:** Fit assessment is its own file, not appended to the decoded JD.
**Rationale:** The decoded JD analyzes the role — it's objective and reusable. The fit assessment evaluates the candidate against a specific resume version — it's subjective and specific. Mixing them muddies both. The sessions table captures verdict and key metadata; the file captures the full reasoning needed for stretch cases.

---

### Export docx stored in Supabase, not regenerated on demand
**Decision:** `export.docx` is generated once, written to Supabase Storage, and served via signed URL. Re-downloading re-serves the stored file.
**Alternatives considered:** Regenerate on each download request.
**Rationale:** Storing the file enables re-download from session history. Generation is deterministic (same inputs always produce the same output), so a stored file is trustworthy. Files are small (~50–100KB) — storage cost is negligible.

---

### Standard docx template (not mirroring original formatting)
**Decision:** Exported `.docx` uses a fixed standard template. Does not replicate the user's original resume formatting.
**Alternatives considered:** Round-trip formatting using docxtemplater; preserve original layout.
**Rationale:** PDF/DOCX → text → DOCX conversion loses structural information and produces inconsistent results. A clean standard template is more professional and predictable. The value delivered is the rewritten content — users apply their own styling in Word.

---

### raw_jd.md excluded from handleChat session context
**Decision:** When `resolveSessionContext` assembles artifacts to inject into `handleChat`, it includes `decoded_jd.md`, `resume_main.md`, and `fit_assessment.md` — but never `raw_jd.md`.
**Rationale:** Two reasons. First, `decoded_jd.md` supersedes `raw_jd.md` the moment it exists — the decoded version is structured, synthesized, and far more useful for answering questions about the role. Including both would be redundant and wasteful on context. Second, before the decode step runs, `raw_jd.md` may be very large (full job posting HTML or PDF text) and unstructured — injecting it into a chat context would push useful content out of the window without adding value. If no decoded JD exists yet (e.g., decode failed), the chat handler simply operates without role context, which is the correct behavior.

---

### Service role key for MVP, full RLS before broader launch
**Decision:** Supabase service role key used server-side for MVP. All queries manually scoped to `user_id` in code. No row-level security at the database layer yet.
**Alternatives considered:** Full RLS from day one (Supabase + Clerk JWT verification).
**Rationale:** RLS with Clerk JWT verification adds non-trivial configuration complexity before the product is validated. The service role key is acceptable at single-digit user count, with an explicit commitment to migrate before broader launch. Users are uploading personal career data — database-level isolation is the correct production posture, just not on day one.

---

## Input Handling

### Paste supported alongside file upload and URL
**Decision:** JD and resume intake both accept pasted text alongside URL (JD) and file upload (both).
**Alternatives considered:** File upload and URL only.
**Rationale:** Most job posting URLs either require login or render dynamically in ways that defeat server-side fetching. PDF parsing fails on complex resume layouts. Paste sidesteps both failure modes and is universally accessible. Input type (URL / file / text) is detected server-side — no UI complexity added.
