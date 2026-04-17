import BulletRow from './BulletRow'
import OutOfScopeBullet from './OutOfScopeBullet'
import type { Role, TargetingRewrite, TargetingRemoval } from '../../lib/types'

interface RoleSectionProps {
  role: Role
  inScope: boolean
  bulletsExcluded: boolean
  rewrites: TargetingRewrite[]
  removals: TargetingRemoval[]
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
  onToggleExclude: () => void
}

export default function RoleSection({
  role,
  inScope,
  bulletsExcluded,
  rewrites,
  removals,
  bulletReviews,
  bulletEdits,
  onAccept,
  onReject,
  onEdit,
  onToggleExclude,
}: RoleSectionProps) {
  const rewriteMap = Object.fromEntries(rewrites.map(r => [r.bullet_id, r]))
  const removalMap = Object.fromEntries(removals.map(r => [r.bullet_id, r]))

  return (
    <div className="mb-6">
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid #E5E7EB' }}
      >
        {/* Role header strip — inside the card */}
        <div
          className="px-3 py-2.5 flex items-baseline gap-2"
          style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}
        >
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: inScope ? '#111827' : '#9CA3AF' }}>
            {role.title}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            {role.company}
            {role.start_date && ` · ${role.start_date}–${role.end_date ?? 'Present'}`}
          </span>
          {!inScope && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={onToggleExclude}
                style={{
                  fontSize: '0.6875rem',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid',
                  borderColor: bulletsExcluded ? '#FECACA' : '#E5E7EB',
                  backgroundColor: bulletsExcluded ? '#FEF2F2' : '#FFFFFF',
                  color: bulletsExcluded ? '#991B1B' : '#6B7280',
                  cursor: 'pointer',
                }}
              >
                {bulletsExcluded ? 'Bullets excluded from resume' : 'Exclude bullets from resume'}
              </button>
            </div>
          )}
        </div>

        {/* Column headers for in-scope roles */}
        {inScope && (
          <div
            className="grid gap-4 px-3 py-2"
            style={{ gridTemplateColumns: '1fr 1fr', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}
          >
            <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Original</span>
            <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rewritten</span>
          </div>
        )}

        {!inScope && bulletsExcluded ? null : role.bullets.map(bullet => {
          if (!inScope) {
            return <OutOfScopeBullet key={bullet.id} text={bullet.text} />
          }

          const rewrite = rewriteMap[bullet.id]
          const removal = removalMap[bullet.id]

          if (rewrite) {
            return (
              <BulletRow
                key={bullet.id}
                bulletId={bullet.id}
                original={bullet.text}
                rewritten={rewrite.rewritten}
                objective={rewrite.objective}
                unquantified={rewrite.unquantified}
                review={bulletReviews[bullet.id]}
                edit={bulletEdits[bullet.id]}
                onAccept={() => onAccept(bullet.id)}
                onReject={() => onReject(bullet.id)}
                onEdit={(text) => onEdit(bullet.id, text)}
              />
            )
          }

          if (removal) {
            return (
              <BulletRow
                key={bullet.id}
                bulletId={bullet.id}
                original={bullet.text}
                rewritten=""
                objective=""
                unquantified={false}
                review={bulletReviews[bullet.id]}
                edit={bulletEdits[bullet.id]}
                onAccept={() => onAccept(bullet.id)}
                onReject={() => onReject(bullet.id)}
                onEdit={(text) => onEdit(bullet.id, text)}
                flaggedForRemoval
                removalReason={removal.reason}
              />
            )
          }

          // Bullet in scope but not rewritten (pass-through)
          return <OutOfScopeBullet key={bullet.id} text={bullet.text} />
        })}
      </div>
    </div>
  )
}
