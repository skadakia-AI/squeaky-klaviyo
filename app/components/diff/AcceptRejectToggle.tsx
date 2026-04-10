interface AcceptRejectToggleProps {
  review: boolean | undefined   // undefined = unreviewed
  onAccept: () => void
  onReject: () => void
}

export default function AcceptRejectToggle({ review, onAccept, onReject }: AcceptRejectToggleProps) {
  return (
    <div className="flex gap-1 flex-shrink-0">
      <button
        onClick={onAccept}
        title="Accept rewrite"
        className="w-7 h-7 flex items-center justify-center rounded text-xs font-medium"
        style={{
          backgroundColor: review === true ? '#065F46' : '#F3F4F6',
          color: review === true ? '#FFFFFF' : '#6B7280',
          borderRadius: 4,
        }}
      >
        ✓
      </button>
      <button
        onClick={onReject}
        title="Reject rewrite"
        className="w-7 h-7 flex items-center justify-center rounded text-xs font-medium"
        style={{
          backgroundColor: review === false ? '#991B1B' : '#F3F4F6',
          color: review === false ? '#FFFFFF' : '#6B7280',
          borderRadius: 4,
        }}
      >
        ✕
      </button>
    </div>
  )
}
