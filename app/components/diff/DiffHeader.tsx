interface DiffHeaderProps {
  unreviewedCount: number
  isStreaming: boolean
  onDownload: () => void
}

export default function DiffHeader({ unreviewedCount, isStreaming, onDownload }: DiffHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-6"
      style={{
        height: 56,
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF',
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold" style={{ color: '#111827' }}>
          Resume Targeting
        </span>
        {unreviewedCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
            {unreviewedCount} left to review
          </span>
        )}
        {unreviewedCount === 0 && (
          <span className="text-xs" style={{ color: '#6B7280' }}>
            All bullets reviewed
          </span>
        )}
      </div>

      <button
        onClick={onDownload}
        disabled={isStreaming}
        className="px-4 py-2 text-sm font-medium rounded"
        style={{
          backgroundColor: isStreaming ? '#E5E7EB' : '#111827',
          color: isStreaming ? '#9CA3AF' : '#FFFFFF',
          borderRadius: 6,
        }}
      >
        Download .docx
      </button>
    </div>
  )
}
