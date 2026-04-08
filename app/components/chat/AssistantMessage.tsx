import ReactMarkdown from 'react-markdown'

interface AssistantMessageProps {
  content: string
  isError?: boolean
  isStreaming?: boolean
}

export default function AssistantMessage({ content, isError, isStreaming }: AssistantMessageProps) {
  const bg = isError ? '#FEF2F2' : '#F3F4F6'
  const textColor = isError ? '#DC2626' : '#111827'

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] px-4 py-2.5 text-sm rounded-lg"
        style={{ backgroundColor: bg, color: textColor, borderRadius: 8 }}
      >
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 style={{ fontSize: '1rem', fontWeight: 700, marginTop: '0.75rem', marginBottom: '0.25rem' }}>{children}</h1>,
            h2: ({ children }) => <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.25rem', color: textColor }}>{children}</h2>,
            h3: ({ children }) => <h3 style={{ fontSize: '0.875rem', fontWeight: 500, marginTop: '0.5rem', marginBottom: '0.125rem' }}>{children}</h3>,
            p: ({ children }) => <p style={{ marginBottom: '0.5rem' }}>{children}</p>,
            ul: ({ children }) => <ul style={{ listStyleType: 'disc', paddingLeft: '1rem', marginBottom: '0.5rem' }}>{children}</ul>,
            ol: ({ children }) => <ol style={{ listStyleType: 'decimal', paddingLeft: '1rem', marginBottom: '0.5rem' }}>{children}</ol>,
            li: ({ children }) => <li style={{ marginBottom: '0.125rem' }}>{children}</li>,
            strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
            em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
            blockquote: ({ children }) => (
              <blockquote style={{ borderLeft: '2px solid #D1D5DB', paddingLeft: '0.75rem', margin: '0.5rem 0', opacity: 0.85, fontSize: '0.8rem' }}>{children}</blockquote>
            ),
            code: ({ children }) => <code style={{ fontSize: '0.75rem', backgroundColor: 'rgba(0,0,0,0.08)', padding: '0 0.25rem', borderRadius: 3 }}>{children}</code>,
            hr: () => <hr style={{ margin: '0.75rem 0', opacity: 0.2 }} />,
          }}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && (
          <span
            className="inline-block ml-1 align-middle"
            style={{ width: 6, height: 14, backgroundColor: textColor, opacity: 0.6, borderRadius: 1 }}
          />
        )}
      </div>
    </div>
  )
}
