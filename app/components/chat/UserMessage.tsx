interface UserMessageProps {
  content: string
}

export default function UserMessage({ content }: UserMessageProps) {
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
