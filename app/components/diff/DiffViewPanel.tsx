import DiffHeader from './DiffHeader'
import DiffBody from './DiffBody'
import type { TargetingOutput, Resume } from '../../lib/types'

interface DiffViewPanelProps {
  targetingData: TargetingOutput
  resumeData: Resume | null
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  unreviewedCount: number
  excludedOutOfScopeRoles: string[]
  summaryReview: boolean | undefined
  summaryEdit: string | undefined
  isStreaming: boolean
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
  onToggleOutOfScopeRole: (roleId: string) => void
  onAcceptSummary: () => void
  onRejectSummary: () => void
  onEditSummary: (text: string) => void
  onDownload: () => Promise<void>
}

export default function DiffViewPanel({
  targetingData,
  resumeData,
  bulletReviews,
  bulletEdits,
  unreviewedCount,
  excludedOutOfScopeRoles,
  summaryReview,
  summaryEdit,
  isStreaming,
  onAccept,
  onReject,
  onEdit,
  onToggleOutOfScopeRole,
  onAcceptSummary,
  onRejectSummary,
  onEditSummary,
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
        excludedOutOfScopeRoles={excludedOutOfScopeRoles}
        summaryReview={summaryReview}
        summaryEdit={summaryEdit}
        onAccept={onAccept}
        onReject={onReject}
        onEdit={onEdit}
        onToggleOutOfScopeRole={onToggleOutOfScopeRole}
        onAcceptSummary={onAcceptSummary}
        onRejectSummary={onRejectSummary}
        onEditSummary={onEditSummary}
      />
    </div>
  )
}
