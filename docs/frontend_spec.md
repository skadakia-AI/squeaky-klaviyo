# Squeaky — Frontend Spec
**Last updated: April 2026**

---

## Design Principles

- **Minimalism:** show only what the current step requires. Nothing decorative, nothing premature.
- **Clarity:** the user always knows where they are, what just happened, and what to do next.
- **Clean aesthetics:** professional, document-like. Closer to Linear or Notion than a consumer app.
- **Intuitive:** chat-native. Binary decisions are buttons. Open-ended responses are text. No ambiguity.

**Scope:** desktop only. The diff view requires two-column layout that does not work on mobile. Show a "best on desktop" message if accessed on a small screen.

---

## Design Language

### Colors

| Token | Value | Usage |
|---|---|---|
| `bg-base` | `#FFFFFF` | Page background |
| `bg-subtle` | `#F9FAFB` | Chat area background |
| `bg-muted` | `#F3F4F6` | Assistant message bubbles |
| `border` | `#E5E7EB` | All borders |
| `text-primary` | `#111827` | Main text, user bubbles, headings |
| `text-muted` | `#6B7280` | Progress updates, secondary labels, objective tags |
| `text-placeholder` | `#9CA3AF` | Input placeholder |
| `accent-primary` | `#111827` | Primary buttons (dark fill) |
| `accent-secondary` | `#F3F4F6` | Secondary buttons (light fill) |
| `verdict-green` | `#DCFCE7` / `#16A34A` | No-brainer badge bg / text |
| `verdict-amber` | `#FEF9C3` / `#CA8A04` | Stretch but doable badge bg / text |
| `verdict-red` | `#FEE2E2` / `#DC2626` | Not a fit badge bg / text |
| `diff-accepted` | `#F0FDF4` | Rewrite bullet bg when accepted; removal bullet bg when kept |
| `diff-rejected` | `#FEF2F2` | Rewrite bullet bg when rejected; removal bullet bg when marked for removal |
| `unquantified` | `#FEF9C3` / `#CA8A04` | Missing number badge bg / text |
| `error` | `#FEF2F2` / `#DC2626` | Error message bg / text |

### Typography

- **Font:** Inter (Google Fonts) with `system-ui` fallback
- **Base:** 14px / 1.6 line height
- **Headings in cards:** 15px semi-bold
- **Labels / badges:** 12px medium, uppercase tracking

### Spacing & Shape

- **Border radius:** 8px (bubbles, cards), 6px (buttons), 4px (badges)
- **Message max width:** 680px, centered in chat pane
- **Card padding:** 16px
- **Bubble padding:** 10px 14px
- **Shadow (cards):** `0 1px 3px rgba(0,0,0,0.08)`

---

## Page Structure

Single page. No routing. Two logical states: chat view, diff view (full overlay).

```
┌─────────────────────────────────────────────┐
│  Header (48px, fixed)                       │
├─────────────────────────────────────────────┤
│                                             │
│  ChatPane (flex-grow, scrollable)           │
│  max-width: 680px, centered                 │
│                                             │
├─────────────────────────────────────────────┤
│  InputArea (64px, fixed)                    │
└─────────────────────────────────────────────┘
```

Diff view slides up as a full-viewport overlay — the chat remains mounted behind it.

---

## Header

**Height:** 48px. Fixed. Thin bottom border.

**Left:** `squeaky` — lowercase wordmark, 16px semi-bold, `text-primary`.

**Right:** `New role` — outlined button, 13px. Clicking mid-workflow shows an inline confirmation below the button:
> *"This will discard your current session."* `[ Yes, start fresh ]` `[ Cancel ]`

No modal. No nav. No user avatar.

---

## Chat Pane

Background: `bg-subtle`. Max width 680px, centered. Full height between header and input area. Auto-scrolls to bottom on new messages unless user has scrolled up.

Messages stack vertically with 12px gap.

### Message Types

#### User message
Right-aligned. Dark bubble (`text-primary` bg, white text). 10px 14px padding, 8px radius. Max width 75% of pane.

#### Assistant message
Left-aligned. Muted bubble (`bg-muted`, `text-primary` text). Same padding and radius. Max width 85%.

#### Progress update
Centered. No bubble. `text-muted`, 13px, italic. Ephemeral — not stored in message history.

Examples: *Fetching job description...* / *Decoding hiring manager priorities...* / *Reading your resume...* / *Assessing fit...* / *Rewriting bullets...*

#### Error message
Left-aligned. `error` bg, `error` text, small warning icon. Shows user-facing message from error contract. Re-enables input after rendering.

#### JD Decode Card
Full chat width (not a bubble). White bg, `border`, 8px radius, 16px padding, subtle shadow.

**Collapsed (default):**
```
Lead PM, Private Credit
State Street · Charles River

Business Context
· [first bullet]
· [second bullet]
· [third bullet]
                                            [Expand ↓]
```

**Expanded:** all 11 sections as collapsible accordions inside the card. Section headers 13px semi-bold. Max card height 480px with internal scroll.

Followed immediately by Checkpoint 0 buttons (see below).

#### Fit Assessment Card
Full chat width card. White bg, `border`, 8px radius.

```
Lead PM, Private Credit · State Street

[ Stretch but doable ]  ← amber badge

Arc alignment: Partial
Hard reqs: all partial, none unmet
Key factors: arc genuine but unconnected; regulated product gap; domain framing off

[Read full assessment ↓]

[ Pursue this role ]    [ Pass on this one ]
```

Verdict badge colors:
- No-brainer → `verdict-green`
- Stretch but doable → `verdict-amber`
- Not a fit → `verdict-red` + additional line: *"The gaps identified above won't close with rewriting alone. You can still target these bullets."*

Full assessment text is collapsible below the key factors. Collapsed by default.

---

## Checkpoint Buttons

For binary decisions, the input area is hidden and two buttons appear centered below the last assistant message.

- **Primary:** `accent-primary` bg, white text, 8px radius, 13px medium, 10px 20px padding
- **Secondary:** white bg, `border`, `text-primary`

On click: brief loading state (spinner in button), input remains hidden while orchestrator processes. Buttons disappear when response arrives.

**Checkpoint 0 — JD preview** (after JD Decode Card):
```
[ Looks right — continue ]    [ Re-enter the JD ]
```

**Pursue or pass** (integrated into Fit Assessment Card — buttons inside the card, not below it):
```
[ Pursue this role ]    [ Pass on this one ]
```

**Arc confirmation and numbers request** use the normal text input — user types their response. Input placeholder updates to *"Type your response..."* for these steps.

---

## Input Area

**Height:** 64px. Fixed at bottom. White bg, top border.

```
[ 📎 ] [ ________________________________ text input ________________________________ ] [ → ]
```

- **📎 (file upload):** opens native file picker (`.pdf`, `.docx`, `.txt`). After selection: filename chip in input field, send button activates.
- **Text input:** placeholder updates by step (see Input Placeholder section). URL, file, and pasted text are all accepted — type detected server-side.
- **→ (send):** `accent-primary` bg, white icon. Disabled when input empty or streaming.

**Input disabled states:**
- During SSE stream → input greyed, placeholder *"Working..."*
- At binary checkpoint → entire input area hidden, replaced by checkpoint buttons
- During diff view → entire input area hidden

---

## Diff View Panel

Full-viewport overlay. Appears when `step_complete: targeted` SSE event fires. Chat remains mounted behind it.

### Diff Header (56px, fixed within panel)

```
Resume Targeting                  [ 5 left to review ]    [ Download .docx → ]
```

- **Title:** "Resume Targeting" — 13px semi-bold, left.
- **Unreviewed count:** amber pill badge (`#FEF3C7` / `#92400E`), 12px. Live count. Shows *"All reviewed"* in muted text when zero.
- **Download .docx:** primary button (`#111827` bg, white text). **Disabled** until `unreviewedCount === 0`. On click: submits `bullet_reviews`, `bullet_edits`, and `excluded_out_of_scope_roles` to `/api/session/reviews`, triggers export-resume, initiates file download.

`unreviewedCount` is initialized as the total number of rewrite bullets plus flagged-for-removal bullets across all in-scope roles. Every bullet with a rewrite or removal recommendation requires an explicit decision before download unlocks.

### Diff Body (scrollable)

Background `#F9FAFB`. Max width 900px, centered. Roles rendered as cards, each with its own border and header strip.

---

### Role Card Structure

Each role renders as a card (`border: 1px solid #E5E7EB`, `border-radius: 8px`, `overflow: hidden`).

**Role header strip** (top of card, `#F9FAFB` bg, bottom border):
```
Senior Product Manager   Tangify · 2021–2025
```
13px semi-bold title, 12px muted company + dates. For out-of-scope roles, see Out-of-Scope section below.

**Column headers** (white bg, bottom border, below role header — in-scope roles only):
```
  ORIGINAL                       REWRITTEN
```
11px, `#9CA3AF`, uppercase, letter-spaced.

---

### Bullet Row — Rewrite

```
┌──────────────────────────┬────────────────────────────────┬──────┐
│ Built live MVP within    │ Compressed concept-to-paying-  │ ✓ ✕ │
│ weeks using no-/low-code │ customer cycle to under 8 weeks│      │
│ tools; recruited 100+    │ by building a live MVP,        │      │
│ users...                 │ recruiting 100+ users, and     │      │
│                          │ running structured feedback    │  ✎   │
│                          │ → Establish scalable models    │      │
└──────────────────────────┴────────────────────────────────┴──────┘
```

- **Left column:** original text. 13px, `#6B7280`. Read-only.
- **Right column:** rewritten (or edited) text. 13px, `#111827`. Objective tag below in blue (`#EFF6FF` / `#1D4ED8`).
- **Controls (bottom-right of right column):**
  - **✎ edit button** (pencil icon, 28×28, `#F3F4F6` bg) — opens textarea for inline editing
  - **✓ accept** and **✕ reject** buttons (28×28 each)

**Row background by state:**
- Unreviewed: `#FFFFFF`
- Accepted: `#F0FDF4` (light green)
- Rejected: `#FEF2F2` (light red)

---

### Inline Editing

Clicking the ✎ button (or anywhere on the rewritten text) opens an inline textarea. On blur the textarea closes and the edit is saved.

**Editing auto-accepts the bullet** — `bulletReviews[id]` is set to `true` and the row turns green. The user can still explicitly reject after editing; rejection always exports the original text regardless of any edit.

**Edit persistence:** stored in `bulletEdits` (`Record<string, string>`). Resolution order at export time: rejected → original; edit present → edited text; accepted → AI rewrite; else → original.

---

### Unquantified Bullet

When `unquantified: true`, an amber `+ number?` badge appears below the objective tag. Acts as a prompt to click edit and add a figure.

---

### Bullet Row — Flagged for Removal

Right column shows:
```
Flagged for removal
[reason text — why this bullet was flagged]
```
Both lines in `#9CA3AF`, italic. No edit button.

**Button semantics (inverted from rewrite rows):**
- **✕ (left button)** = remove from export. Active state: red (`#991B1B` bg).
- **✓ (right button)** = keep bullet in export. Active state: green (`#065F46` bg).

**Row background by state:**
- Unreviewed: `#FFFFFF`
- Removal accepted (✕): `#FEF2F2` (light red — signals deletion)
- Removal rejected / kept (✓): `#F0FDF4` (light green — signals retained)

---

### Out-of-Scope Roles

Out-of-scope roles appear in the same card structure as in-scope roles. Their bullets are shown dimmed (`#9CA3AF`) with no rewrite or accept/reject controls. The role header strip carries an "Exclude bullets from resume" toggle button.

**Default state (bullets included in export):**
```
Senior PM   Acme Corp · 2018–2020   [ Exclude bullets from resume ]
```
- Bullets visible below, dimmed
- All bullets export unchanged

**After toggling exclusion:**
```
Senior PM   Acme Corp · 2018–2020   [ Bullets excluded from resume ]
```
- Bullets disappear from the diff view
- Role still exports (company, title, dates) — bullets are stripped from the docx
- Toggle button styled with red tint (`#FEF2F2` bg, `#991B1B` text, red border) to signal active exclusion
- Toggle is reversible at any time before download

`excludedOutOfScopeRoles` (array of role IDs) is submitted with `bullet_reviews` and `bullet_edits` on download and saved to the session. The default is an empty array — no exclusions unless the user opts out.

---

## SSE Event → UI State Map

| Event | UI action |
|---|---|
| Connection opens | Show first progress update |
| `session_created` | Store `sessionId` in client state |
| `message` (assistant) | Append text into current assistant bubble |
| `step_complete: jd_loaded` | Progress update: *"Fetching job description..."* |
| `step_complete: decoded` | Render JDDecodeCard. Show Checkpoint 0 buttons. Hide input. |
| `step_complete: resume_loaded` | Progress update: *"Resume loaded"* |
| `step_complete: assessed` | Render FitAssessmentCard with pursue/pass buttons. Hide input. |
| `step_complete: not_pursuing` | Show *"Session saved"* message. Show new session CTA. Disable input permanently. |
| `step_complete: targeted` | Open DiffViewPanel. Hide input area. |
| `step_complete: exported` | Close DiffViewPanel. Show download link in chat. Show new session CTA. |
| `error` | Render error message bubble. Re-enable input. |
| `done` | Close SSE. Re-enable input if step requires text response. |

---

## Client State

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
  bulletReviews: Record<string, boolean>    // bullet_id → true=accept/remove, false=reject/keep
  bulletEdits: Record<string, string>       // bullet_id → edited text (edit auto-accepts)
  unreviewedCount: number                   // rewrites + removals requiring a decision; gates download
  excludedOutOfScopeRoles: string[]         // role IDs whose bullets are stripped from the export
  error: { code: string; message: string } | null
}

type CheckpointType =
  | "jd_preview"        // binary buttons: continue | re-enter
  | "arc_confirmation"  // text input: y | correction
  | "scope_selection"   // text input: confirm or adjust roles
  | "pursue_or_pass"    // binary: buttons inside FitAssessmentCard
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

## Component Hierarchy

```
app/
  page.tsx                    — root, mounts AppLayout
  layout.tsx                  — Inter font, metadata, viewport

components/
  layout/
    AppLayout.tsx             — header + chat pane + diff view orchestration
    Header.tsx                — logo, New role button, abandon confirmation
  chat/
    ChatPane.tsx              — message list + input area, SSE connection manager
    MessageList.tsx           — renders ChatMessage array
    UserMessage.tsx           — right-aligned dark bubble
    AssistantMessage.tsx      — left-aligned muted bubble
    ProgressUpdate.tsx        — centered muted italic, ephemeral
    ErrorMessage.tsx          — red-tinted error bubble
    CheckpointButtons.tsx     — binary decision buttons (replaces input area)
    InputArea.tsx             — file upload + text input + send button
  cards/
    JDDecodeCard.tsx          — collapsible 11-section analysis card
    FitAssessmentCard.tsx     — verdict badge + key factors + pursue/pass buttons
  diff/
    DiffViewPanel.tsx         — full overlay, conditional on showDiffView
    DiffHeader.tsx            — back link, role name, unreviewed count, download
    DiffBody.tsx              — scrollable, organizes RoleSections
    RoleSection.tsx           — sticky role header + bullet rows
    BulletRow.tsx             — original | rewritten | ✎ edit button | ✓ ✕ accept/reject (in-scope); X ✓ remove/keep (removal)
    OutOfScopeBullet.tsx      — dimmed read-only bullet row for out-of-scope and pass-through bullets
    AcceptRejectToggle.tsx    — two-button ✓ / ✕; variant='removal' inverts icons and active colors
    ObjectiveTag.tsx          — → [objective] label under rewritten text
    UnquantifiedBadge.tsx     — + number? amber badge

lib/
  session.ts                  — useSession hook, ClientState management
  sse.ts                      — SSE connection, event parsing, reconnect logic
  api.ts                      — typed fetch wrappers for /api/chat, /api/session/*
  types.ts                    — shared: Resume, TargetingOutput, ClientState, etc.
```

---

## Session Recovery UI

On page load, call `GET /api/session/active`.

**No active session:** render empty chat with opening prompt:
> *"Drop in a job description — paste a URL, upload a PDF, or paste the text directly."*

**Active session under 7 days:** show continuation card centered in chat:
```
┌──────────────────────────────────────────┐
│  You were working on                     │
│  Lead PM, Private Credit · State Street  │
│                                          │
│  [ Continue where you left off ]         │
│  [ Start fresh ]                         │
└──────────────────────────────────────────┘
```
Continue → load message history, re-show last checkpoint if applicable.
Start fresh → mark session abandoned, render empty state.

**Session older than 7 days:** render empty state (auto-abandoned server-side).

---

## Input Placeholder by Step

| Step | Placeholder |
|---|---|
| `created` | *"Paste a job posting URL, upload a PDF, or paste the text..."* |
| `decoded` | *"Upload your resume or paste it here..."* |
| `resume_loaded` / `assessed` | *"Type your response..."* |
| `targeted` | *(input hidden — diff view open)* |
