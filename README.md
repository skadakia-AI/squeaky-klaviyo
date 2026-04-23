# Squeaky

AI-powered resume targeting. Paste a job description, upload your resume, and get back a tailored version — bullets rewritten, scoped, and ready to submit.

## What it does

Squeaky walks you through a structured workflow:

1. **Load JD** — paste text, drop a PDF, or provide a URL
2. **Decode** — Claude extracts the role requirements, scope, and must-haves
3. **Load resume** — paste text or upload PDF/DOCX
4. **Fit assessment** — Claude evaluates your arc alignment and hard requirement coverage
5. **Target** — rewrites bullets in scope; flags weak or irrelevant ones
6. **Export** — download the targeted resume as a DOCX

Sessions persist in Supabase so you can pick up where you left off.

## Tech stack

- **Framework**: Next.js 16.2.2 (App Router)
- **Auth**: Clerk
- **Database + Storage**: Supabase
- **AI**: Anthropic Claude — Sonnet 4.6 for analysis, Haiku for parsing
- **Export**: `docx` library
- **File parsing**: `pdf-parse`, `mammoth` (DOCX)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Create a `.env.local` file:

```env
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  api/
    chat/route.ts          # Main orchestrator — routes messages by session step
    session/
      active/route.ts      # Fetch active session
      reviews/route.ts     # Bullet review state
  components/
    chat/                  # ChatPane, InputArea, message types, CheckpointButtons
    layout/                # Header, AppLayout
  lib/
    anthropic.ts           # Anthropic client + model constants
    supabase.ts            # Supabase clients (anon + service role)
    types.ts               # Shared types (Resume, TargetingOutput, ClientState, …)
    utils/
      load-jd.ts           # JD ingestion (URL / PDF / text)
      load-resume.ts       # Resume ingestion (PDF / DOCX / text)
      update-session.ts    # Session state machine helper
      export-resume.ts     # DOCX generation
skills/
  jd-decoder.md            # Prompt: decode a JD into structured analysis
  jd-match.md              # Prompt: assess resume-JD fit
  resume-targeting.md      # Prompt: rewrite and scope resume bullets
```

## Session state machine

The orchestrator routes each message by `current_step`:

```
created → jd_loaded → decoded → resume_loaded → assessed → targeted → exported
                                                                ↓
                                                          not_pursuing
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

