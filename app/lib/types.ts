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
  | 'jd_preview'
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
  error: { code: string; message: string } | null
}
