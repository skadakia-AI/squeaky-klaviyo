import ReactMarkdown from 'react-markdown'

interface JDDecodeCardProps {
  content: string
  showUploadPrompt: boolean
}

export default function JDDecodeCard({ content, showUploadPrompt }: JDDecodeCardProps) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      <div
        className="px-4 py-2 text-xs font-medium tracking-wide uppercase"
        style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}
      >
        Role Decoded
      </div>

      <div className="px-5 py-4 text-sm" style={{ color: '#374151' }}>
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.75rem', color: '#111827' }}>
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 style={{ fontSize: '0.6875rem', fontWeight: 600, marginTop: '1.75rem', marginBottom: '0.5rem', paddingBottom: '0.3rem', borderBottom: '1px solid #F3F4F6', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.2rem', color: '#374151' }}>
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p style={{ marginBottom: '0.5rem', fontSize: '0.8125rem', lineHeight: '1.6' }}>
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '0.5rem' }}>
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol style={{ listStyleType: 'decimal', paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem', fontSize: '0.8125rem', lineHeight: '1.6' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#D1D5DB', flexShrink: 0, marginTop: '0.5rem' }} />
                <span>{children}</span>
              </li>
            ),
            strong: ({ children }) => <strong style={{ fontWeight: 600, color: '#111827' }}>{children}</strong>,
            em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
            hr: () => null,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      {showUploadPrompt && (
        <div
          className="px-4 py-3 text-sm"
          style={{ borderTop: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', color: '#6B7280' }}
        >
          Upload your resume or paste it below.
        </div>
      )}
    </div>
  )
}
