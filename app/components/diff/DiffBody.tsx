import RoleSection from './RoleSection'
import type { TargetingOutput, Resume } from '../../lib/types'

interface DiffBodyProps {
  targetingData: TargetingOutput
  resumeData: Resume | null
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  excludedOutOfScopeRoles: string[]
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
  onToggleOutOfScopeRole: (roleId: string) => void
}

export default function DiffBody({
  targetingData,
  resumeData,
  bulletReviews,
  bulletEdits,
  excludedOutOfScopeRoles,
  onAccept,
  onReject,
  onEdit,
  onToggleOutOfScopeRole,
}: DiffBodyProps) {
  const scopeSet = new Set(targetingData.scope ?? [])
  const roles = resumeData?.experience ?? []

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-[900px]">
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
