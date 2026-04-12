interface CheckpointButtonsProps {
  type: 'arc_confirmation' | 'pursue_or_pass' | 'scope_selection'
  onChoice: (value: string) => void
  disabled: boolean
}

const BUTTONS = {
  arc_confirmation: [
    { label: 'Looks right — assess fit', value: 'confirm', primary: true },
    { label: 'Make a correction', value: 'correct', primary: false },
  ],
  pursue_or_pass: [
    { label: 'Target my resume', value: 'confirm', primary: true },
    { label: 'Pass on this role', value: 'pass', primary: false },
  ],
  scope_selection: [
    { label: 'This scope works', value: 'scope_confirm', primary: true },
    { label: 'Adjust scope', value: 'adjust', primary: false },
  ],
}

export default function CheckpointButtons({ type, onChoice, disabled }: CheckpointButtonsProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-3 px-6"
      style={{ height: 64, borderTop: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      {BUTTONS[type].map(btn => (
        <button
          key={btn.value}
          onClick={() => onChoice(btn.value)}
          disabled={disabled}
          className="px-5 py-2 text-sm font-medium rounded"
          style={{
            backgroundColor: btn.primary ? '#111827' : '#F3F4F6',
            color: btn.primary ? '#FFFFFF' : '#111827',
            borderRadius: 6,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  )
}
