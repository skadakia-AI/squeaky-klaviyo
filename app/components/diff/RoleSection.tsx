import BulletRow from './BulletRow'
import OutOfScopeBullet from './OutOfScopeBullet'
import type { Role, TargetingRewrite, TargetingRemoval } from '../../lib/types'

interface RoleSectionProps {
  role: Role
  inScope: boolean
  rewrites: TargetingRewrite[]
  removals: TargetingRemoval[]
  bulletReviews: Record<string, boolean>
  bulletEdits: Record<string, string>
  onAccept: (bulletId: string) => void
  onReject: (bulletId: string) => void
  onEdit: (bulletId: string, text: string) => void
}

export default function RoleSection({
  role,
  inScope,
  rewrites,
  removals,
  bulletReviews,
  bulletEdits,
  onAccept,
  onReject,
  onEdit,
}: RoleSectionProps) {
  const rewriteMap = Object.fromEntries(rewrites.map(r => [r.bullet_id, r]))
  const removalMap = Object.fromEntries(removals.map(r => [r.bullet_id, r]))

  return (
    <div className="mb-6">
      {/* Role header */}
      <div className="mb-2 px-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold" style={{ color: inScope ? '#111827' : '#9CA3AF' }}>
            {role.title}
          </span>
          <span className="text-xs" style={{ color: '#9CA3AF' }}>
            {role.company}
            {role.start_date && ` · ${role.start_date}–${role.end_date ?? 'Present'}`}
          </span>
          {!inScope && (
            <span className="text-xs italic ml-auto" style={{ color: '#D1D5DB' }}>
              out of scope
            </span>
          )}
        </div>
      </div>

      {/* Bullets */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid #E5E7EB' }}
      >
        {/* Column headers for in-scope roles */}
        {inScope && (
          <div
            className="grid gap-4 px-3 py-2 text-xs font-medium"
            style={{ gridTemplateColumns: '1fr 1fr', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}
          >
            <span>Original</span>
            <span>Rewritten</span>
          </div>
        )}

        {role.bullets.map(bullet => {
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
