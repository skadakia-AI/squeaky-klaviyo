interface ObjectiveTagProps {
  objective: string
}

export default function ObjectiveTag({ objective }: ObjectiveTagProps) {
  return (
    <span
      className="inline-block text-xs px-1.5 py-0.5 rounded"
      style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', borderRadius: 3 }}
    >
      {objective}
    </span>
  )
}
