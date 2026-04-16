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
      <span className="text-sm font-semibold" style={{ color: '#111827' }}>
        Resume Targeting
      </span>

      <div className="flex items-center gap-3">
        {unreviewedCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
            {unreviewedCount} left to review
          </span>
        )}
        {unreviewedCount === 0 && (
          <span className="text-xs" style={{ color: '#6B7280' }}>
            All reviewed
          </span>
        )}

        <button
          onClick={onDownload}
          disabled={isStreaming || unreviewedCount > 0}
          title={unreviewedCount > 0 ? 'Review all bullets before downloading' : undefined}
          className="px-4 py-2 text-sm font-medium rounded"
          style={{
            backgroundColor: isStreaming || unreviewedCount > 0 ? '#E5E7EB' : '#111827',
            color: isStreaming || unreviewedCount > 0 ? '#9CA3AF' : '#FFFFFF',
            borderRadius: 6,
            cursor: unreviewedCount > 0 ? 'not-allowed' : undefined,
          }}
        >
          Download .docx
        </button>
      </div>
    </div>
  )
}
