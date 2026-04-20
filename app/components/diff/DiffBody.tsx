import RoleSection from './RoleSection'
import SummaryRow from './SummaryRow'
import type { TargetingOutput, Resume } from '../../lib/types'

interface DiffBodyProps {
  targetingData: TargetingOutput
  resumeData: Resume | null
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  excludedOutOfScopeRoles: string[]
  summaryReview: boolean | undefined
  summaryEdit: string | undefined
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
  onToggleOutOfScopeRole: (roleId: string) => void
  onAcceptSummary: () => void
  onRejectSummary: () => void
  onEditSummary: (text: string) => void
}

export default function DiffBody({
  targetingData,
  resumeData,
  bulletReviews,
  bulletEdits,
  excludedOutOfScopeRoles,
  summaryReview,
  summaryEdit,
  onAccept,
  onReject,
  onEdit,
  onToggleOutOfScopeRole,
  onAcceptSummary,
  onRejectSummary,
  onEditSummary,
}: DiffBodyProps) {
  const scopeSet = new Set(targetingData.scope ?? [])
  const roles = resumeData?.experience ?? []

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-[900px]">
        {targetingData.summary_rewrite && (
          <SummaryRow
            original={targetingData.summary_rewrite.original}
            rewritten={targetingData.summary_rewrite.rewritten}
            review={summaryReview}
            edit={summaryEdit}
            onAccept={onAcceptSummary}
            onReject={onRejectSummary}
            onEdit={onEditSummary}
          />
        )}

        {roles.map(role => (
          <RoleSection
            key={role.id}
            role={role}
            inScope={scopeSet.has(role.id)}
            bulletsExcluded={excludedOutOfScopeRoles.includes(role.id)}
            rewrites={targetingData.rewrites?.filter(r => r.bullet_id.startsWith(role.id)) ?? []}
            removals={targetingData.flagged_for_removal?.filter(r => r.bullet_id.startsWith(role.id)) ?? []}
            bulletReviews={bulletReviews}
            bulletEdits={bulletEdits}
            onAccept={onAccept}
            onReject={onReject}
            onEdit={onEdit}
            onToggleExclude={() => onToggleOutOfScopeRole(role.id)}
          />
        ))}

        {roles.length === 0 && (
          <p className="text-sm text-center py-12" style={{ color: '#9CA3AF' }}>
            No resume data available.
          </p>
        )}
      </div>
    </div>
  )
}
