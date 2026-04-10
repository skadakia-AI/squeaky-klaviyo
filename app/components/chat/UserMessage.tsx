interface UserMessageProps {
  content: string
  type?: string
}

export default function UserMessage({ content, type }: UserMessageProps) {
  if (type === 'file_upload') {
    return (
      <div className="flex justify-end">
        <div
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg"
          style={{ backgroundColor: '#111827', color: '#FFFFFF', borderRadius: 8 }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
            <path d="M11 3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-5-5z" />
            <path d="M11 3v5h5" />
          </svg>
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div
        className="max-w-[75%] px-4 py-2.5 text-sm rounded-lg"
        style={{ backgroundColor: '#111827', color: '#FFFFFF', borderRadius: 8 }}
      >
        {content}
      </div>
    </div>
  )
}
