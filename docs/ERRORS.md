# Error Reference
**Last updated: April 2026**

All handled error states in the Squeaky web app — what triggers them, what the user sees, and how they recover. Organised by utility or skill where the error originates.

---

## load-jd

### URL fetch errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Login wall | Fetched content contains login/auth signals ("sign in", "log in", "create an account") | "This page requires a login and can't be fetched. Paste the job description text directly instead." | Paste JD text into the input |
| Bot detection | Fetched content contains bot-check signals ("checking your browser", "security check", "enable javascript") | "This site is blocking automated access. Copy the job description text from your browser and paste it here." | Copy text from browser, paste into input |
| JS-rendered / sparse content | Content fetched but no responsibilities or requirements sections found (common on Workday, iCIMS) | "The job content couldn't be extracted — this page may load dynamically. Copy the text from your browser and paste it here." | Copy text from browser, paste into input |
| No job-like signals | Content fetched but doesn't resemble a job posting | "The fetched page doesn't look like a job description. Check the URL points to a specific listing, or paste the text directly." | Verify URL or paste text |
| SSRF / invalid URL | URL resolves to a private IP, localhost, or non-http/https scheme | "That URL can't be fetched. Please use a public job posting URL or paste the text directly." | Use a valid public URL or paste |
| Fetch failure | Network error or non-200 response | "Couldn't fetch that URL. Try again, or paste the job description text directly." | Retry or paste |

**Platforms known to fail URL fetch:** LinkedIn (login wall), Workday (JS-rendered), iCIMS (JS-rendered).
**Platforms that typically work:** Greenhouse, Lever, most company career pages.

---

### JD content errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Empty input | Input is blank or whitespace only | "Please paste a job description, drop a PDF, or enter a URL." | Provide input |
| Sparse content | Content present but very short (< ~200 characters) | "This looks too short to be a full job description. Is this the complete posting?" | Confirm or re-enter |

---

## load-resume

### File parsing errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Image-based PDF | PDF opens but extractable text is fewer than 10 lines | "This PDF appears to be image-based and can't be parsed. Export a text-based PDF from Word or Google Docs, or paste your resume text directly." | Export text-based PDF or paste |
| Unsupported file type | File extension is not `.pdf`, `.docx`, or `.txt` | "Only PDF, Word (.docx), and plain text files are supported. Try re-saving in one of those formats." | Re-save in a supported format |
| File too large | Uploaded file exceeds 5MB | "This file is too large (max 5MB). Try compressing it or pasting the text directly." | Compress or paste |
| Parse failure | File opens but content cannot be extracted | "Couldn't read this file. Try a different format or paste your resume text directly." | Paste text or try different format |

---

### Resume content errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Empty paste | Pasted content is fewer than ~10 lines | "This looks too short to be a complete resume. Please paste the full text." | Paste complete resume |
| Sparse content warning | Content present but fewer than ~20 lines | "This looks shorter than a typical resume — continuing, but let me know if something looks off." | Session continues — user can flag if needed |
| Structured extraction failure | Claude (Haiku) returns malformed or incomplete JSON | "Couldn't parse your resume structure. Try pasting the text directly if you uploaded a file, or start a new session." | Paste text or start fresh |

---

## jd-match (skill runner)

### Assessment errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Decoded JD not found | `decoded_jd.md` missing from storage for this session | "Couldn't load the job analysis for this session. Please start a new session." | Start new session |
| Structured resume not found | `resume_structured.json` missing from storage | "Couldn't load your resume for this session. Please start a new session." | Start new session |
| Section extraction failure | Section 10 or 11 cannot be parsed from decoded JD | "Something went wrong reading the job analysis. Try starting a new session." | Start new session |
| Arc confirmation declined | User responds that the arc summary is inaccurate | Skill asks what was misread, incorporates correction (max 2 rounds), then proceeds | Describe the misread — skill self-corrects |

---

## resume-targeting (skill runner)

### Targeting errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Structured resume not found | `resume_structured.json` missing | "Couldn't load your resume. Please start a new session." | Start new session |
| Decoded JD not found | `decoded_jd.md` missing | "Couldn't load the job analysis. Please start a new session." | Start new session |
| JSON parse failure | Claude returns targeting output that cannot be parsed as JSON | "Something went wrong generating your rewrites. Try again." | Retry — orchestrator retries once automatically |
| Empty scope | No role IDs in scope list | "No roles were selected for rewriting. Please start a new session." | Start new session |

---

## Orchestrator

### Session errors

| Error | Trigger | Message shown to user | Recovery |
|---|---|---|---|
| Session not found | `session_id` doesn't exist or belongs to another user | "Session not found. Try starting a new session." | Start new session |
| Invalid state | Message received for a session in a terminal state (`exported`, `not_pursuing`, `abandoned`) | "This session is already complete. Start a new session to work on a different role." | Start new session |
| Session creation failed | Supabase insert fails on new session | "Couldn't start a new session. Please try again." | Retry |

---

## Claude API (all skill runners)

| Error | Trigger | Message shown to user | Retry behaviour |
|---|---|---|---|
| Transient 5xx | Anthropic server error | *(retried silently — user sees extended progress indicator)* | Retry once after 2s. Surface error on second failure: "Something went wrong. Please try again." |
| Rate limit (429) | Too many concurrent requests | "The AI service is busy — wait a moment and try again." | No retry. Fail immediately. |
| Timeout | Request exceeds execution time limit | "This is taking longer than expected. Please try again." | No retry. Surface error. |
| Malformed output | Claude returns output missing required structure | "Something went wrong processing the response. Please try again." | No retry. Session state preserved — user can retry same step. |

---

## General

| Error | Trigger | Message shown to user |
|---|---|---|
| Unauthorized | Request arrives without valid Clerk session | "Please sign in to continue." |
| File upload error | Browser-side upload fails before reaching server | "Upload failed. Try again or paste the text directly." |
| Unhandled exception | Unexpected error not caught by skill runner or utility | "Something went wrong. Please try again. Your session has been saved." |

**Principle:** session state never advances on error. The user can always retry the same step without re-uploading or re-entering data.
