import DiffHeader from './DiffHeader'
import DiffBody from './DiffBody'
import type { TargetingOutput, Resume } from '../../lib/types'

interface DiffViewPanelProps {
  targetingData: TargetingOutput
  resumeData: Resume | null
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  unreviewedCount: number
  isStreaming: boolean
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
  onDownload: () => Promise<void>
}

export default function DiffViewPanel({
  targetingData,
  resumeData,
  bulletReviews,
  bulletEdits,
  unreviewedCount,
  isStreaming,
  onAccept,
  onReject,
  onEdit,
  onDownload,
}: DiffViewPanelProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: '#F9FAFB', zIndex: 20, top: 48 }}
    >
      <DiffHeader
        unreviewedCount={unreviewedCount}
        isStreaming={isStreaming}
        onDownload={onDownload}
      />
      <DiffBody
        targetingData={targetingData}
        resumeData={resumeData}
        bulletReviews={bulletReviews}
        bulletEdits={bulletEdits}
        onAccept={onAccept}
        onReject={onReject}
        onEdit={onEdit}
      />
    </div>
  )
}
