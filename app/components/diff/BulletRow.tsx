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
          <div className="ml-auto flex items-center gap-1">
            {!flaggedForRemoval && (
              <button
                onClick={() => setEditing(true)}
                title="Edit rewrite"
                className="w-7 h-7 flex items-center justify-center rounded"
                style={{ backgroundColor: editing ? '#EFF6FF' : '#F3F4F6', color: '#6B7280', borderRadius: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            <AcceptRejectToggle review={review} onAccept={onAccept} onReject={onReject} />
          </div>
        </div>
      </div>
    </div>
  )
}
