'use client'

import { useState } from 'react'
import AcceptRejectToggle from './AcceptRejectToggle'
import ObjectiveTag from './ObjectiveTag'
import UnquantifiedBadge from './UnquantifiedBadge'

interface BulletRowProps {
  bulletId: string
  original: string
  rewritten: string
  objective: string
  unquantified: boolean
  review: boolean | undefined
  edit: string | undefined
  onAccept: () => void
  onReject: () => void
  onEdit: (text: string) => void
  flaggedForRemoval?: boolean
}

export default function BulletRow({
  bulletId: _bulletId,
  original,
  rewritten,
  objective,
  unquantified,
  review,
  edit,
  onAccept,
  onReject,
  onEdit,
  flaggedForRemoval = false,
}: BulletRowProps) {
  const [editing, setEditing] = useState(false)
  const displayText = edit ?? rewritten

  return (
    <div
      className="grid gap-4 py-3 px-3 rounded"
      style={{
        gridTemplateColumns: '1fr 1fr',
        backgroundColor: review === true ? '#F0FDF4' : review === false ? '#FFF5F5' : '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
      }}
    >
      {/* Original */}
      <div className="text-sm" style={{ color: '#6B7280' }}>
        <span style={{ textDecoration: flaggedForRemoval && review === true ? 'line-through' : 'none' }}>
          {original}
        </span>
      </div>

      {/* Rewritten */}
      <div className="flex flex-col gap-1.5">
        {editing ? (
          <textarea
            className="text-sm w-full rounded p-1.5 outline-none resize-none"
            style={{ border: '1px solid #D1D5DB', borderRadius: 4, minHeight: 72 }}
            defaultValue={displayText}
            autoFocus
            onBlur={(e) => {
              onEdit(e.target.value)
              setEditing(false)
            }}
          />
        ) : (
          <p
            className="text-sm cursor-text"
            style={{ color: '#111827' }}
            onClick={() => !flaggedForRemoval && setEditing(true)}
            title={flaggedForRemoval ? undefined : 'Click to edit'}
          >
            {flaggedForRemoval ? <em style={{ color: '#9CA3AF' }}>Flagged for removal</em> : displayText}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {objective && <ObjectiveTag objective={objective} />}
          {unquantified && !flaggedForRemoval && <UnquantifiedBadge />}
          <div className="ml-auto">
            <AcceptRejectToggle review={review} onAccept={onAccept} onReject={onReject} />
          </div>
        </div>
      </div>
    </div>
  )
}
