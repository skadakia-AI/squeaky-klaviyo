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
| `diff-accepted` | `#F0FDF4` | Rewritten bullet bg when accepted |
| `diff-rejected` | `#F9FAFB` | Rewritten bullet bg when rejected |
| `diff-edited` | `#EFF6FF` | Rewritten bullet bg when user has edited it |
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

Full-viewport overlay. Appears when `step_complete: targeted` SSE event fires. Slides up from bottom over 200ms (ease-out). Chat remains mounted behind it.

### Diff Header (48px, fixed within panel)

```
← Back to chat    Reviewing: Lead PM @ State Street    3 of 15 unreviewed    [ Download .docx → ]
```

- **← Back to chat:** text link, left. Closes panel without discarding reviews.
- **Role name:** centered, 14px semi-bold.
- **Unreviewed count:** `text-muted`, 13px. Live count. Shows *"All reviewed"* when done.
- **Download .docx:** primary button, always enabled. If unreviewed bullets remain, shows tooltip: *"3 unreviewed bullets will use original text."* On click: submits `bullet_reviews` + `bullet_edits` to `/api/session/reviews`, triggers export-resume, initiates file download.

### Diff Body (scrollable)

**Column headers (top of body, not sticky):**
```
  ORIGINAL TEXT                  YOUR VERSION
```
12px, `text-muted`, uppercase.

Organized by role. In-scope roles first, out-of-scope roles appended after with a visual divider.

**Role header (sticky per role):**
```
TANGIFY — FOUNDER & CEO  ·  2021–2025
```
13px semi-bold, all-caps, `text-muted`. Thin bottom border. Sticks to top of panel body while scrolling through that role.

---

### Bullet Row — In Scope

```
┌──────────────────────────────┬──────────────────────────────┬──────┐
│ ORIGINAL                     │ YOUR VERSION                 │  ○   │
│                              │                              │      │
│ Built live MVP within weeks  │ Compressed concept-to-       │      │
│ using no-/low-code tools;    │ paying-customer cycle to     │      │
│ recruited 100+ users and     │ under 8 weeks by building a  │      │
│ converted first paying       │ live MVP, recruiting 100+    │      │
│ customers within weeks       │ users, and running structured│      │
│                              │ feedback loops               │      │
│                              │                              │      │
│                              │ → Establish scalable         │      │
│                              │   operating models           │      │
└──────────────────────────────┴──────────────────────────────┴──────┘
```

- **Left column (44%):** original text. `text-muted`, 13px. Read-only.
- **Right column (50%):** rewritten text (or user-edited text). `text-primary`, 13px.
- **Objective tag (below rewritten text):** `→ [objective]` — 12px, `text-muted`, italic. Always visible.
- **Toggle (6%):** circular, three-state (see below).

**Toggle states:**
- **Unreviewed (○):** grey ring. No background change on right column.
- **Accepted (✓):** green icon. Right column bg → `diff-accepted`. If user has edited: bg → `diff-edited`.
- **Rejected (✗):** grey ✗. Right column bg → `diff-rejected`, text muted. Left column gets faint highlight border.

Click cycles: unreviewed → accepted → rejected → unreviewed.

---

### Unquantified Bullet

When `unquantified: true`, the bullet row shows an amber badge above the rewritten column:

```
                              │ ⚠ missing number             │
                              │                              │
                              │ Directed €300M+ in active    │
                              │ investments...               │
```

`⚠ missing number` — 11px, `unquantified` colors. Acts as a visual prompt to click and edit.

---

### Inline Editing

**Any bullet's right column is editable.** Click anywhere on the rewritten text → the column becomes an inline textarea (auto-height, same font). No explicit "edit mode" toggle.

While editing:
- Border appears on right column (`border` color, 1px)
- Small `edited` badge appears in bottom-right corner of the cell (12px, `text-muted`)
- Toggle automatically moves to accepted state

On blur:
- Textarea returns to display mode
- `edited` badge persists
- Unreviewed count updates if this was the first interaction

**Edit persistence:** edits stored in `bulletEdits` in client state (`Record<string, string>`) and submitted with `bullet_reviews` on download.

**For `⚠ missing number` bullets:** clicking the badge focuses the textarea immediately.

---

### Flagged for Removal Row

Right column shows in italic `text-muted`: *"Remove this bullet"*
Below that, smaller `text-muted`: *"[reason from targeting output]"*

Toggle semantics for removal rows:
- **Accepted (✓)** = remove from export
- **Rejected (✗)** = keep original bullet in export

Visual: when accepted (remove), a faint strikethrough line spans the full row width.

---

### Out-of-Scope Bullets

Appear after all in-scope bullets, separated by a thin divider and label: `NOT IN SCOPE — EXPORTED UNCHANGED`.

```
┌──────────────────────────────┬──────────────────────────────┬──────────┐
│ Expanded coverage into power │ Expanded coverage into power │ UNCHANGED│
│ and renewables...            │ and renewables...            │          │
└──────────────────────────────┴──────────────────────────────┴──────────┘
```

Both columns `text-muted`. No toggle. `UNCHANGED` label in `text-placeholder`, 11px, right-aligned.

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
  bulletReviews: Record<string, boolean>    // bullet_id: accepted
  bulletEdits: Record<string, string>       // bullet_id: edited text
  unreviewedCount: number
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
    BulletRow.tsx             — original | rewritten | toggle (in-scope)
    OutOfScopeBullet.tsx      — greyed-out unchanged rows
    AcceptRejectToggle.tsx    — three-state circular toggle (○ / ✓ / ✗)
    ObjectiveTag.tsx          — → [objective] label under rewritten text
    UnquantifiedBadge.tsx     — ⚠ missing number amber badge

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
