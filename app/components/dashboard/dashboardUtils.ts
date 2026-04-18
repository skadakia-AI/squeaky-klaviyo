import type { DashboardSession } from '../../lib/types'

export type DerivedStatus = 'completed' | 'passed' | 'in_progress'

export function deriveStatus(session: DashboardSession): DerivedStatus {
  if (session.current_step === 'exported') return 'completed'
  if (session.current_step === 'not_pursuing') return 'passed'
  return 'in_progress'
}

export const NEXT_STEP_LABEL: Record<string, string> = {
  jd_loaded:     'Decode JD',
  decoded:       'Add Resume',
  resume_loaded: 'Assess Fit',
  assessed:      'Tailor Resume',
  targeted:      'Download Resume',
}

export const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  'no-brainer':         { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', label: 'No-brainer' },
  'stretch but doable': { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', label: 'Stretch' },
  'not a fit':          { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', label: 'Not a fit' },
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
