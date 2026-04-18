// ─── Resume schema ───────────────────────────────────────────────────────────

export interface Resume {
  name: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  website?: string
  summary?: string
  experience: Role[]
  education: Education[]
  skills?: string[]
  other?: Section[]
}

export interface Role {
  id: string        // e.g. "r0", "r1"
  company: string
  title: string
  location?: string
  start_date?: string
  end_date?: string
  description?: string
  bullets: Bullet[]
}

export interface Bullet {
  id: string        // e.g. "r0-b0", "r0-b1"
  text: string
}

export interface Education {
  institution: string
  degree?: string
  field?: string
  location?: string
  dates?: string
  notes?: string[]
}

export interface Section {
  title: string
  content: string
}

// ─── Targeting output ─────────────────────────────────────────────────────────

export interface TargetingOutput {
  role: string
  scope: string[]
  rewrites: TargetingRewrite[]
  flagged_for_removal: TargetingRemoval[]
  credibility_check: CredibilityCheck
}

export interface TargetingRewrite {
  bullet_id: string
  original: string
  rewritten: string
  objective: string
  structure: string
  unquantified: boolean
}

export interface TargetingRemoval {
  bullet_id: string
  original: string
  reason: string
}

export interface CredibilityCheck {
  throughline: string
  notes: string
}

// ─── SSE / API wire types ─────────────────────────────────────────────────────

export type OutboundMessage = {
  type: 'text' | 'file_upload' | 'checkpoint'
  content: string
  display?: string   // human-readable label shown in the chat bubble (defaults to content)
  file_name?: string
  file_type?: string
  silent?: boolean
}

export interface QuantificationQuestion {
  bullet: string
  question: string
}

export type SSEEvent =
  | { type: 'session_created'; session_id: string }
  | { type: 'token'; content: string }
  | { type: 'message'; role: 'assistant'; content: string; progress?: boolean }
  | { type: 'step_complete'; step: CurrentStep; data?: unknown }
  | { type: 'quantification_needed'; questions: QuantificationQuestion[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' }

export interface DashboardSession {
  id: string
  company: string | null
  role: string | null
  current_step: CurrentStep
  status: string
  verdict: string | null
  arc_alignment: string | null
  created_at: string
  updated_at: string
}

export interface ActiveSession {
  id: string
  current_step: CurrentStep
  status: string
  company?: string
  role?: string
  verdict?: string
  arc_alignment?: string
  bullet_reviews?: Record<string, boolean>
  bullet_edits?: Record<string, string>
  excluded_out_of_scope_roles?: string[]
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  step: string
  created_at: string
}

// ─── Intent classification ────────────────────────────────────────────────────

// A decision context maps to a specific point where the orchestrator needs to
// know what the user is trying to do. One context per actual decision point —
// not one per state machine step (assessed has three sub-states, each is its
// own context).
export type IntentContext =
  | 'jd_loaded'               // "Does this look right?"
  | 'decoded'                  // "Upload your resume or paste it here"
  | 'resume_loaded'            // arc snapshot confirmation
  | 'assessed_pursue_or_pass'  // "Want to target your resume, or pass?"
  | 'assessed_scope'           // "Does this scope work?"
  | 'assessed_numbers'         // "I need a few numbers from you"

export type StepAction =
  | 'confirm'           // user agrees / wants to proceed
  | 'reject'            // user wants to re-enter / go back
  | 'pass'              // user does not want to pursue this role
  | 'scope_confirm'     // user agrees with the proposed targeting scope
  | 'scope_add'         // user wants to adjust which roles are in scope
  | 'numbers_response'  // user is responding to the quantification request
  | 'resume_submit'     // user is submitting resume text (decoded step)
  | 'chat'              // user is asking a question or being conversational
  | 'unclear'           // genuinely ambiguous — cannot determine intent

export type StepIntent = {
  action: StepAction
  confidence: 'high' | 'low'
}

// ─── Session / step ───────────────────────────────────────────────────────────

export type CurrentStep =
  | 'created'
  | 'jd_loaded'
  | 'decoded'
  | 'jd_confirmed'
  | 'resume_loaded'
  | 'assessed'
  | 'targeted'
  | 'exported'
  | 'not_pursuing'
  | 'abandoned'

// ─── Chat messages ────────────────────────────────────────────────────────────

export interface JDDecodeData {
  sections: { title: string; content: string }[]
  summary: string
}

export interface FitAssessmentData {
  verdict: 'no-brainer' | 'stretch but doable' | 'not a fit'
  hard_req_status: string
  arc_alignment: 'strong' | 'partial' | 'weak'
  key_factors: string
  full_text: string
}

export type ChatMessageType =
  | 'text'
  | 'file_upload'
  | 'progress'
  | 'jd_decode_card'
  | 'fit_assessment_card'
  | 'error'
  | 'checkpoint_buttons'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  type: ChatMessageType
  data?: JDDecodeData | FitAssessmentData
  timestamp: number
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

export type CheckpointType =
  | 'arc_confirmation'
  | 'scope_selection'
  | 'pursue_or_pass'
  | 'numbers_request'

// ─── Client state ─────────────────────────────────────────────────────────────

export interface ClientState {
  sessionId: string | null
  currentStep: CurrentStep | null
  isStreaming: boolean
  messages: ChatMessage[]
  checkpoint: CheckpointType | null
  showDiffView: boolean
  targetingData: TargetingOutput | null
  resumeData: Resume | null
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  unreviewedCount: number
  excludedOutOfScopeRoles: string[]
  quantificationQuestions: QuantificationQuestion[] | null
  error: { code: string; message: string } | null
}
