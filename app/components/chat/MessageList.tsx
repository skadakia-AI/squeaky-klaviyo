import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ProgressUpdate from './ProgressUpdate'
import ErrorMessage from './ErrorMessage'
import JDDecodeCard from '../cards/JDDecodeCard'
import FitAssessmentCard from '../cards/FitAssessmentCard'
import type { ChatMessage, FitAssessmentData } from '../../lib/types'

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming: boolean
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
  onCheckpointChoice: (value: string, display?: string) => void
}

export default function MessageList({
  messages,
  isStreaming,
  onCheckpointChoice,
}: MessageListProps) {
  return (
    <>
      {messages.map((msg, i) => {
        const isLast = i === messages.length - 1

        if (msg.role === 'user') {
          return <UserMessage key={msg.id} content={msg.content} type={msg.type} />
        }

        switch (msg.type) {
          case 'progress':
            return <ProgressUpdate key={msg.id} content={msg.content} />

          case 'error':
            return <ErrorMessage key={msg.id} content={msg.content} />

          case 'jd_decode_card':
            return <JDDecodeCard key={msg.id} content={msg.content} />

          case 'fit_assessment_card':
            return (
              <FitAssessmentCard
                key={msg.id}
                data={msg.data as FitAssessmentData}
                content={msg.content}
                onChoice={(value, display) => onCheckpointChoice(value, display)}
                disabled={isStreaming}
              />
            )

          default:
            return (
              <AssistantMessage
                key={msg.id}
                content={msg.content}
                isStreaming={isStreaming && isLast}
              />
            )
        }
      })}

      {/* Streaming placeholder when no assistant message yet */}
      {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
        <AssistantMessage content="" isStreaming />
      )}
    </>
  )
}
