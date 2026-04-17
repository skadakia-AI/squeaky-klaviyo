interface AcceptRejectToggleProps {
  review: boolean | undefined   // undefined = unreviewed
  onAccept: () => void
  onReject: () => void
  variant?: 'rewrite' | 'removal'  // removal inverts semantics: accept=remove, reject=keep
}

export default function AcceptRejectToggle({ review, onAccept, onReject, variant = 'rewrite' }: AcceptRejectToggleProps) {
  const isRemoval = variant === 'removal'

  return (
    <div className="flex gap-1 flex-shrink-0">
      <button
        onClick={onAccept}
        title={isRemoval ? 'Remove bullet' : 'Accept rewrite'}
        className="w-7 h-7 flex items-center justify-center rounded text-xs font-medium"
        style={{
          backgroundColor: review === true ? (isRemoval ? '#991B1B' : '#065F46') : '#F3F4F6',
          color: review === true ? '#FFFFFF' : '#6B7280',
          borderRadius: 4,
        }}
      >
        {isRemoval ? '✕' : '✓'}
      </button>
      <button
        onClick={onReject}
        title={isRemoval ? 'Keep bullet' : 'Reject rewrite'}
        className="w-7 h-7 flex items-center justify-center rounded text-xs font-medium"
        style={{
          backgroundColor: review === false ? (isRemoval ? '#065F46' : '#991B1B') : '#F3F4F6',
          color: review === false ? '#FFFFFF' : '#6B7280',
          borderRadius: 4,
        }}
      >
        {isRemoval ? '✓' : '✕'}
      </button>
    </div>
  )
}
