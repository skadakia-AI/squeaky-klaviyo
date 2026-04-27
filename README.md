# Squeaky — Job Search Intelligence

## Problem Statement

The job market is more competitive than it's ever been. AI-generated applications and resume fraud are accelerating. The deeper problem isn't volume but convergence. Every resume sounds the same: keyword-optimized, polished, and hollow. AI has made it trivially easy to produce bullets that say nothing a hiring manager hasn't read a hundred times.

The candidates who break through are the ones who understand what the hiring manager actually needs.

A job description isn't a checklist but a cipher, containing clues such as: What triggered the hire? What problems will the candidate need to solve? What does success look like? What's actually non-negotiable vs. nice to have? Almost no candidate can repeatably and reliably do this analysis. 

As a nontechnical founder building early-stage GTM, I learned that you can't find product-market fit without first understanding what your customer is trying to accomplish, what they've already tried, and the tradeoffs they're weighing. The same analysis applies to a job search ("candidate-market fit"). Without it, you're polishing language without resolving the positioning problem.

My initial target is mid-career professionals recently laid off from high-paying roles, who haven't had to apply in 3+ years, and are mass applying but struggling to break through.

If this were solved: that candidate lands the role they weren't the obvious choice for — because they walked in knowing exactly what the hiring manager needed, and their resume made the case without fluff. You'd see it in downloaded resumes: candidates completing the full flow and submitting something they trusted.

---

## Solution Overview

Squeaky decodes job descriptions to evaluate a candidate's fit, identify gaps, and rewrite their resume to make the strongest possible case for the role.

The workflow:

1. Paste or upload a job description — Squeaky extracts what the role is actually about: what triggered the hire, what the candidate will own, what success looks like, what's non-negotiable
2. Upload a resume — Squeaky compares it against the decoded JD and returns an honest fit verdict, including "not a fit"
3. If fit exists, Squeaky proposes a targeting scope and rewrites bullets to close gaps and amplify relevant strengths — using only what the candidate has actually done
4. The candidate reviews every rewrite in a diff view, accepts or rejects each change, and downloads a targeted `.docx`

AI is not supplementary here but core. Three things require it:

- **Decoding intent from language.** A job description is written in corporate shorthand. Extracting what it actually means — the subtext, the unstated priorities, the signal inside a duty clause — requires language understanding, not keyword extraction.
- **Reasoning across a gap.** Mapping a nonlinear background onto a specific role's requirements isn't a lookup problem. It requires judgment about what counts as evidence, what's transferable, and what's genuinely missing.
- **Rewriting with constraint.** The model can only use what the candidate has provided. No invented metrics, no fabricated outcomes. A Turn 1 audit flags any bullet missing real numbers before rewriting — because early testing showed the model would otherwise generate plausible-sounding metrics that weren't true.

A non-AI version of this is a career coach charging $400 a session. The output might be similar but the cost and access aren't.

---

## AI Integration

**Models and APIs:**
- Claude Sonnet 4.6 for all reasoning: JD decoding, fit assessment, resume targeting. Sonnet over Opus — cheaper and more token-efficient with no meaningful quality loss for this use case.
- Claude Haiku 4.5 for classification and structured extraction from PDFs and Word files. Fast and cheap for tasks where depth doesn't matter — but required significant iteration. Early classifiers were too broad: a company About page initially passed as a job description. Several rounds of prompt tightening were needed: explicit negative examples, tighter output schemas, stricter decision boundaries.
- Jina API for URL-based JD ingestion — some job postings returned no usable data on a raw fetch due to JavaScript rendering or access restrictions. Jina resolved this cleanly.

**Patterns used:**

*Multi-turn orchestration with a session state machine.* Sessions can be interrupted — a user might upload a JD, close the tab, and return hours later. Without explicit state, the orchestrator can't know whether to resume or restart. The state machine makes recovery deterministic. The session moves through seven explicit states: `created → jd_loaded → decoded → resume_loaded → assessed → targeted → exported`. Each state has its own skill runner. Turn detection works by checking stored message history — so the orchestrator knows whether it's running Turn 1 or Turn 2 for a given step without relying on client state.

*Separation of concerns as a reliability requirement.* This started as a CLI project where skill files handled their own reads, writes, and analysis in a single pass. It worked locally but created three problems: skills weren't reusable, passing context between skills was brittle, and instruction adherence was harder to enforce when prompts were doing too many things at once. The rebuild separated reads, writes, and reasoning into distinct layers — utilities handle all I/O, skill runners handle Claude calls and output parsing, the orchestrator owns state transitions. Each layer has a defined error shape. Prompt iteration became faster and safer: changing a skill prompt no longer risked breaking context passing or storage behavior elsewhere.

*Two-pass targeting.* Resume targeting runs in two turns. Turn 1 audits bullets against the decoded JD and flags any missing real numbers before writing anything. If numbers are missing, the product asks for them — one at a time, not in a batch — before proceeding to Turn 2. Early testing showed the model would invent plausible-sounding metrics when numbers were absent. "Reduced churn by 18%" sounds right. It might not be true. The audit step closes that failure mode before it reaches the user.

*Streaming for perceived quality.* A 30-second silent wait kills trust; streaming a 30-second response builds it. All user-facing text uses SSE `token` events via `anthropic.messages.stream()`. The final structured rewrite uses non-streaming JSON — the full object is parsed and validated before anything renders.

**Tradeoffs:**
- No RAG: the context is always the user's own documents, loaded fresh per session. No retrieval problem to solve.
- Streaming complexity: SSE token events required a more complex client-side state model, but the perceived quality gain was non-negotiable.

**Where AI exceeded expectations:** The JD decoder surfaced implicit requirements — things coded inside a sub-clause of a duty, not listed as a requirement — and correctly labeled them as unstated hard requirements. I hadn't explicitly prompted for inference at that level.

**Where it fell short:** Three places. First, number fabrication — without the Turn 1 audit, the model generated plausible-sounding metrics that weren't true. Second, classification reliability — Haiku required far more iteration than expected to reliably distinguish a job description from unrelated content; the edge cases were genuinely hard. Third, instruction adherence — even with explicit constraints in the skill prompts, the model occasionally violated formatting rules or ignored output boundaries. The fix was tighter output schemas and defensive parsing, not better prompting alone.

---

## Architecture / Design Decisions

I started with a monolithic route handler (~590 lines) where skill files handled their own reads, writes, and Claude calls in a single pass. It worked locally. In production it was impossible to debug — failures were hard to isolate, context passing between skills was brittle, and changing one prompt risked breaking unrelated behavior. The rebuild imposed four non-collapsible layers:

```
Route (app/api/chat/route.ts)          ← auth, SSE setup, delegate only
Orchestrator (app/lib/orchestrator.ts) ← state machine, dispatch, retry
Skill Runners (app/lib/skills/)        ← Claude calls, output parsing
Utilities (app/lib/utils/)             ← all I/O: storage, messages, export
```

Within utilities, I think in three categories:
- **Reads**: `load-jd.ts`, `load-resume.ts`, `messages.ts` — fetch context, never write
- **Writes**: `storage.ts`, `update-session.ts`, `export-resume.ts` — persist results, never call Claude
- **Runs**: skill runners and the orchestrator — coordinate, reason, and transform

This maps cleanly to how the system fails. A read failure means missing context. A write failure means lost output. A run failure means bad reasoning or a broken call. Each has a different recovery path.

**Data flow.** User input hits the route → authenticated and delegated to the orchestrator → orchestrator checks session state and dispatches to the correct skill runner → skill runner fetches its context from storage, calls Claude, parses output, writes results back to storage → orchestrator emits SSE events → client `useSession` hook processes the event stream and updates UI state. The server always drives. The client only renders.

**Frontend structure.** `useSession` owns all client state — current step, message history, checkpoint markers, review counts. Components are dumb renderers: `ChatPane` renders the message stream, `FitAssessmentCard` and `JDDecodeCard` render structured outputs at specific steps, `DiffViewPanel` and `QuantificationPanel` activate when targeting begins. Within a session, the server drives state — step transitions, checkpoint markers, and review counts all flow from SSE events, not client logic.

**Key decisions:**

*Input validation as a guard layer.* Before any Sonnet call runs, Haiku classifies every JD and resume input. Non-JD content and non-resume content are rejected before state advances. This keeps expensive calls from running on bad input and gives users a clear error rather than a confused output.

*Skill chaining with intent.* Skills aren't isolated — they're chained. The fit assessment output feeds directly into resume targeting as the primary gap brief. The orchestrator passes context forward deliberately, not incidentally. The summary rewrite runs in parallel with Turn 2 since both need the same inputs and neither blocks the other — if summary fails, targeting still completes.

*Security by default.* Supabase service role key is server-side only. File paths constructed from `user_id + session_id` only — never from client input. SSRF protection on every URL fetch. A pre-tool hook blocks Claude from reading `.env` files during development. These were consolidated in a dedicated security pass mid-project after the core flow was working.

*SSE over WebSockets.* The flow is unidirectional — the server always drives, the client renders. SSE connections are stateless: each request opens a new stream, the server pushes events, the connection closes. Application state persists in Supabase between requests. WebSockets would add bidirectional complexity the product doesn't need.

*TDD as a forcing function.* Every behavior change ships with a test. The test suite runs `tsc --noEmit`, ESLint, and Vitest in sequence — enforced by a pre-commit hook. 226 tests across 10 files covering unit behavior and full orchestrator integration.

**Assumptions:**
- All context fits within a single Claude context window — no chunking or retrieval needed
- Within a session, flow is server-driven; the client has no routing logic and no independent state

**What I'd do differently:** Start with the four-layer architecture. The monolith-to-rebuild cost was real — not just in time, but in the bugs introduced during the transition. The constraint that utilities never call Claude and skill runners never touch storage is obvious in retrospect. It wasn't obvious when I started.

**Third-party:** Next.js App Router, Clerk (auth), Supabase (Postgres + Storage), Jina API (URL ingestion), Anthropic SDK, Sentry (error monitoring), `pdf-parse`, `mammoth`, `docx`

---

## What did AI help you do faster, and where did it get in your way?

I don't write code. Claude Code and I are the sole implementers on this project — I own the product spec and the decisions; Claude writes the code. The first working version of Squeaky — four-layer architecture, full UI, SSE streaming, Supabase storage — was running with a real user in under two weeks — in sessions ranging from 30 minutes to 2.5 hours, fit around other commitments. The constraint was clarifying: you learn quickly what to prioritize when you only have an hour.

What surprised me was how much I learned in the process. I came in without a background in software architecture. Working through this project taught me how to think about separating concerns across layers, when to use server-side vs. client-side state, how SSE differs from WebSockets and why it matters, how storage buckets work, how to structure tests, how to debug systematically, and how to work around real tool limitations — like the fact that neither raw fetch nor Jina can read LinkedIn job descriptions, which shaped the JD ingestion design.

That said, I've been burned enough times with AI coding tools to know what "two weeks of vibe coding" actually costs you. I ran into this at my startup: things feel like magic early on, then old code gets overwritten, working features start breaking, and when everything is built on natural language and intuition there's no way to know what happened or why.

That history forced me to be deliberate. Before any code exists, I work with Claude to produce a detailed architecture doc and error contract. The `CLAUDE.md` file at the root of this repo is, functionally, a system prompt for the codebase — it defines layer ownership, error shapes by layer, streaming policy, state machine, and the constraints that must survive across sessions. The sequence is inverted: spec → constraints → implementation. Code is the last thing that happens.

It also changed how I debug. I don't let Claude run wild on a fix. When something breaks, I ask it to identify what happened, what should have happened, what caused it, what else could go wrong in the course of fixing it, and what the plan is — before touching anything. If it claims a certain thing caused an issue, I ask how it knows: is it inferring, or did it read actual error logs? A hypothesis and a diagnosis are not the same thing.

**What Claude moved through quickly:** Everything mechanical — SSE wiring, TypeScript types, storage utilities, test scaffolding, boilerplate error handling. Things that would have taken me months to learn happened in days.

**Where it fell short:** Several places. Architecture discipline across sessions — even with `CLAUDE.md`, drift happened, and I caught it in diffs, not by trusting instructions had been followed. Classification reliability and instruction adherence on complex outputs required more iteration than expected. And the model was sometimes quick to jump to writing code before fully diagnosing the problem — I had to pull it back repeatedly and force a diagnosis before a fix.

Deployment exposed a different category of failure: gaps in operational knowledge. When standing up the production Supabase instance, Claude generated an incomplete schema — missing three of the four required tables and multiple columns — which only surfaced through runtime errors. It incorrectly assessed that a project creation setting ("Automatically expose new tables") would have no impact, when in fact it caused a permission error that blocked all database writes and took significant debugging time to isolate. It also failed to flag upfront that sensitive environment variables in Vercel should be marked as such. These weren't reasoning failures — they were incomplete knowledge about how third-party platforms work in practice, presented with more confidence than was warranted. The pattern: Claude was more reliable on things it had seen in code than on things that live in platform UIs and deployment configs.

What I haven't solved yet: I'd love to run parallel agents from multiple terminals working on different parts of the project simultaneously, but I don't have enough guardrails or a clear enough "definition of done" per agent to trust that implicitly. I also never got around to systemizing how the frontend UI gets designed and generated — that stayed ad hoc throughout, and it shows.

**How it changed my approach:** I now incorporate unit and integration tests early, enforce them with pre-commit and CI hooks, and treat every class of failure as something to systematize rather than react to. The goal wasn't to move fast. It was to move in a way I could understand, debug, and recover from.

---

## Getting Started

```bash
git clone https://github.com/skadakia-AI/squeaky-klaviyo.git
cd squeaky-klaviyo
npm install

cp .env.example .env.local
# Required:
# ANTHROPIC_API_KEY
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
# CLERK_SECRET_KEY
# NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
# NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY   ← server-side only, never NEXT_PUBLIC_

npm run dev
```

Requires Node 18+. Supabase bucket named `squeaky`, path convention: `users/{user_id}/{session_id}/{filename}`.

---

## Demo

https://www.loom.com/share/2623dba3a27943db88ddad313c58282f

1. Paste a job description → Squeaky decodes it: hiring manager's problem, outcome they own, risks they're managing, what a no-brainer hire looks like, foreseeable gaps
2. Upload your resume (PDF or Word) → fit verdict, hard requirement status, arc alignment
3. Review targeting scope → answer quantification prompts one at a time → receive rewritten bullets in a diff view
4. Edit any bullet inline, accept or reject each change, download targeted `.docx`

---

## Testing / Error Handling

`npm run test` runs `tsc --noEmit`, ESLint, and Vitest in sequence. All three must pass before any change ships — enforced by a pre-commit hook and GitHub Actions CI. 226 tests across 10 files.

Coverage includes:
- Happy path for each of the seven state transitions
- Turn detection: Turn 2 called with no Turn 1 history → silently restarts Turn 1 rather than throwing
- Retry behavior: transient 5xx triggers 1× retry after 2s; 429 hard-fails immediately; session state never advances on failure
- Parse errors fail immediately — no retry on bad model output
- Intent classification: checkpoint button clicks bypass the classifier entirely; numbers sub-state bypasses it too

Failure modes I thought about explicitly:
- Bad input before expensive calls: Haiku classifies every JD and resume before Sonnet runs — company About pages, cover letters, and essays are rejected early
- Fabricated metrics: Turn 1 audit catches bullets missing real numbers before Turn 2 rewrites anything
- Session interruption: state machine makes mid-session recovery deterministic — the orchestrator checks stored message history, not client state
- Layer violations: utilities never call Claude; skill runners never write to storage directly — each layer fails in a predictable, isolated way

**What I caught from real users (first test session, April 12):**
- Quantification questions were batched — users didn't know which bullet each referred to. Redesigned to one question at a time with bullet context shown.
- "Arc alignment" confused users despite being a useful concept. Renamed to plain language in the UI.
- The download function failed silently on first run. Fixed with explicit error surfacing.
- Users wanted to edit rewrites inline, not just accept or reject. Added inline editing to the diff view.

The product worked. The UX didn't. Testing against a real user in a real job search was the only way to see that.

---

## Future Improvements

*Product:*
- **Experience reframing before bullet rewriting** — the current flow rewrites bullets without first asking whether the framing of the entire experience is right for the role. The better version: identify misaligned framing, surface clarifying questions to the candidate, incorporate their context, then rewrite. This is a meaningful quality gap in the current output.
- **Progressive JD disclosure** — right now the full decoded JD surfaces at once. The better design surfaces the right intel at the right step: business context and hiring trigger upfront, requirements at fit assessment, targeting signals at rewrite. Information architecture, not just features.
- **Resume reuse across sessions** — the product currently asks for a fresh resume upload every session. A returning user should be able to confirm their prior resume or swap it out. Obvious gap for the repeat user.
- **JD decode as a top-of-funnel free tool** — the intelligence layer is useful before a candidate even decides to apply. Standalone free tool drives acquisition; the rest of the product is the conversion.
- **Shareable fit verdict card** — a public URL and OG image for the fit assessment result. Job searching is private suffering; this makes one moment worth sharing. Likely the highest-leverage acquisition feature before any paid spend.
- **Resume formatting fidelity** — the downloaded `.docx` uses a generic template. Matching the candidate's original formatting is the difference between a tool and a finished product, and a direct determinant of willingness to pay.

*Beyond the resume:*
The job search doesn't end at the application. The natural next layer is interview prep (surface likely questions from the decoded JD and fit gaps), outreach drafting (craft a targeted message to the hiring manager), and a proof of capability artifact (a tailored leave-behind that makes the case beyond the resume). Each of these uses the same decoded JD and fit assessment as inputs — the hard work is already done.

*Technical:*
- **Dynamic orchestrator routing** — the current linear state machine works but is brittle for anything non-sequential. The next version replaces it with an orchestrator that dynamically routes to skills, tools, or sub-agents based on context.
- **AI observability and evals** — Langfuse tracing on every Claude call for latency, token cost, and inputs/outputs per skill. Structured evals with benchmark inputs and pass/fail scoring for all four skill agents. Right now prompt quality is assessed by feel. That's not a quality gate.

---

## Live URL

https://squeaky-klaviyo.vercel.app/
