'use client'

import { useState } from 'react'
import AcceptRejectToggle from './AcceptRejectToggle'

interface SummaryRowProps {
  original: string | null
  rewritten: string
  review: boolean | undefined
  edit: string | undefined
  onAccept: () => void
  onReject: () => void
  onEdit: (text: string) => void
}

export default function SummaryRow({
  original,
  rewritten,
  review,
  edit,
  onAccept,
  onReject,
  onEdit,
}: SummaryRowProps) {
  const [editing, setEditing] = useState(false)
  const displayText = edit ?? rewritten

  return (
    <div
      className="rounded mb-6"
      style={{ border: '1px solid #E5E7EB', overflow: 'hidden' }}
    >
      <div
        className="px-3 py-2"
        style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}
      >
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7280' }}>
          Summary
        </span>
      </div>

      <div
        className="grid gap-4 py-3 px-3"
        style={{
          gridTemplateColumns: '1fr 1fr',
          backgroundColor: review === true ? '#F0FDF4' : review === false ? '#FEF2F2' : '#FFFFFF',
        }}
      >
        {/* Original */}
        <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
          {original ?? (
            <em style={{ color: '#9CA3AF' }}>No summary on original resume</em>
          )}
        </div>

        {/* Rewritten */}
        <div className="flex flex-col gap-1.5">
          {editing ? (
            <textarea
              className="w-full rounded p-1.5 outline-none resize-none"
              style={{ fontSize: '0.8125rem', border: '1px solid #D1D5DB', borderRadius: 4, minHeight: 80 }}
              defaultValue={displayText}
              autoFocus
              onBlur={(e) => {
                onEdit(e.target.value)
                setEditing(false)
              }}
            />
          ) : (
            <p
              className="cursor-text"
              style={{ fontSize: '0.8125rem', color: '#111827' }}
              onClick={() => setEditing(true)}
              title="Click to edit"
            >
              {displayText}
            </p>
          )}

          <div className="flex items-center gap-2">
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                title="Edit summary"
                className="w-7 h-7 flex items-center justify-center rounded"
                style={{ backgroundColor: editing ? '#EFF6FF' : '#F3F4F6', color: '#6B7280', borderRadius: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <AcceptRejectToggle review={review} onAccept={onAccept} onReject={onReject} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
