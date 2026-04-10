import AssistantMessage from '../chat/AssistantMessage'
import type { FitAssessmentData } from '../../lib/types'

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'no-brainer':        { bg: '#ECFDF5', text: '#065F46', label: 'Strong fit' },
  'stretch but doable':{ bg: '#FFFBEB', text: '#92400E', label: 'Stretch' },
  'not a fit':         { bg: '#FEF2F2', text: '#991B1B', label: 'Not a fit' },
}

interface FitAssessmentCardProps {
  data: FitAssessmentData
  content: string
  onChoice: (value: string) => void
  disabled: boolean
}

export default function FitAssessmentCard({ data, content, onChoice, disabled }: FitAssessmentCardProps) {
  const style = VERDICT_STYLES[data?.verdict] ?? VERDICT_STYLES['not a fit']

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      {/* Verdict banner */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: style.bg, borderBottom: '1px solid #E5E7EB' }}
      >
        <span className="text-sm font-semibold" style={{ color: style.text }}>
          {style.label}
        </span>
        {data?.arc_alignment && (
          <span className="text-xs" style={{ color: style.text, opacity: 0.8 }}>
            Arc: {data.arc_alignment}
          </span>
        )}
      </div>

      {/* Full assessment */}
      <div className="px-4 py-3">
        <AssistantMessage content={content} />
      </div>

      {/* Pursue / pass CTA */}
      <div
        className="px-4 py-3 flex gap-3"
        style={{ borderTop: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}
      >
        <button
          onClick={() => onChoice('yes, proceed')}
          disabled={disabled}
          className="px-4 py-2 text-sm font-medium rounded"
          style={{
            backgroundColor: disabled ? '#E5E7EB' : '#111827',
            color: disabled ? '#9CA3AF' : '#FFFFFF',
            borderRadius: 6,
          }}
        >
          Tailor my resume
        </button>
        <button
          onClick={() => onChoice('pass')}
          disabled={disabled}
          className="px-4 py-2 text-sm rounded"
          style={{
            backgroundColor: '#F3F4F6',
            color: disabled ? '#9CA3AF' : '#6B7280',
            borderRadius: 6,
          }}
        >
          Skip this role
        </button>
      </div>
    </div>
  )
}
