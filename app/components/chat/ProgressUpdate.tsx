interface ProgressUpdateProps {
  content: string
}

export default function ProgressUpdate({ content }: ProgressUpdateProps) {
  return (
    <div className="flex justify-center py-1">
      <span className="text-xs italic" style={{ color: '#9CA3AF' }}>
        {content}
      </span>
    </div>
  )
}
