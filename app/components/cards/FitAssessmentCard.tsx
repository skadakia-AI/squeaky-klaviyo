import ReactMarkdown from 'react-markdown'
import type { FitAssessmentData } from '../../lib/types'

const VERDICT_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  'no-brainer':         { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', label: 'No-brainer hire' },
  'stretch but doable': { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', label: 'Stretch — worth pursuing' },
  'not a fit':          { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', label: 'Not a fit' },
}

const ARC_LABELS: Record<string, string> = {
  strong:  'Strong',
  partial: 'Partial',
  weak:    'Weak',
}

// Find the narrative portion (everything from the first h1 heading onward).
// The verdict block uses h2 (## Verdict); the narrative starts with h1 (# Fit Assessment: ...).
function extractNarrative(content: string): string {
  const h1Idx = content.indexOf('\n# ')
  if (h1Idx >= 0) return content.slice(h1Idx + 1).trim()
  const sepIdx = content.indexOf('\n---\n')
  if (sepIdx >= 0) return content.slice(sepIdx + 5).trim()
  return ''
}

function parseKeyFactors(raw: string): string[] {
  return raw.split(/;\s*/).map(s => s.trim()).filter(Boolean)
}

// Recursively extract plain text from a ReactMarkdown children node so we can
// detect status words (Met / Partial / Not Met / Present / Absent) for color-coding.
function getChildText(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return (node as unknown[]).map(getChildText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return getChildText((node as { props: { children: unknown } }).props.children)
  }
  return ''
}

// Map the status word found in a list item to a dot color.
// Checks in order so "Not Met" (red) takes priority over the bare word "met" (green).
function statusDotColor(text: string): string {
  if (/not\s+met/i.test(text) || /\babsent\b/i.test(text)) return '#EF4444'
  if (/\bpartial\b/i.test(text))                             return '#F59E0B'
  if (/\bmet\b/i.test(text)   || /\bpresent\b/i.test(text)) return '#10B981'
  return '#D1D5DB' // neutral gray for un-tagged bullets
}

interface FitAssessmentCardProps {
  data: FitAssessmentData
  content: string
  onChoice: (value: string, display: string) => void
  disabled: boolean
}

export default function FitAssessmentCard({ data, content, onChoice, disabled }: FitAssessmentCardProps) {
  const style = VERDICT_STYLES[data?.verdict] ?? VERDICT_STYLES['not a fit']
  const narrative = extractNarrative(content)
  const keyFactors = data?.key_factors ? parseKeyFactors(data.key_factors) : []

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      {/* Verdict banner */}
      <div
        className="px-4 py-3"
        style={{ backgroundColor: style.bg, borderBottom: `1px solid ${style.border}` }}
      >
        <div className="text-sm font-semibold mb-1" style={{ color: style.text }}>
          {style.label}
        </div>
        {keyFactors.length > 0 && (
          <ul className="flex flex-col gap-0.5" style={{ listStyle: 'none', padding: 0 }}>
            {keyFactors.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: style.text, opacity: 0.85 }}>
                <span className="mt-0.5 flex-shrink-0">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Career narrative fit — quick summary row */}
      {data?.arc_alignment && (
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <span className="text-xs" style={{ color: '#6B7280' }}>Career narrative fit:</span>
          <span className="text-xs font-medium" style={{ color: '#111827' }}>
            {ARC_LABELS[data.arc_alignment] ?? data.arc_alignment}
          </span>
        </div>
      )}

      {/* Full narrative — all sections rendered as markdown with color-coded status dots */}
      {narrative && (
        <div className="px-4 py-3 text-sm" style={{ borderBottom: '1px solid #F3F4F6', color: '#374151' }}>
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 style={{ fontSize: '0.875rem', fontWeight: 700, marginTop: '0.75rem', marginBottom: '0.25rem', color: '#111827' }}>
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.875rem', marginBottom: '0.3rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 500, marginTop: '0.5rem', marginBottom: '0.125rem' }}>
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p style={{ marginBottom: '0.4rem', fontSize: '0.8125rem', lineHeight: '1.5' }}>
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul style={{ listStyle: 'none', padding: 0, marginBottom: '0.4rem' }}>
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol style={{ listStyleType: 'decimal', paddingLeft: '1.25rem', marginBottom: '0.4rem' }}>
                  {children}
                </ol>
              ),
              li: ({ children }) => {
                const dot = statusDotColor(getChildText(children))
                return (
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.8125rem', lineHeight: '1.5' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: dot, flexShrink: 0, marginTop: '0.35rem' }} />
                    <span>{children}</span>
                  </li>
                )
              },
              strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
              em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
              hr: () => <hr style={{ margin: '0.5rem 0', opacity: 0.15 }} />,
            }}
          >
            {narrative}
          </ReactMarkdown>
        </div>
      )}

      {/* Pursue / pass CTA */}
      <div
        className="px-4 py-3 flex gap-3"
        style={{ backgroundColor: '#F9FAFB' }}
      >
        <button
          onClick={() => onChoice('confirm', 'Tailor my resume')}
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
          onClick={() => onChoice('pass', 'Skip this role')}
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
