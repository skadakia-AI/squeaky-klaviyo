import AssistantMessage from '../chat/AssistantMessage'

interface JDDecodeCardProps {
  content: string
}

export default function JDDecodeCard({ content }: JDDecodeCardProps) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
    >
      <div
        className="px-4 py-2 text-xs font-medium tracking-wide uppercase"
        style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}
      >
        Role Decoded
      </div>
      <div className="px-4 py-3">
        <AssistantMessage content={content} />
      </div>
    </div>
  )
}
