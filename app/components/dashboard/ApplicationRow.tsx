'use client'

import { useState } from 'react'
import type { DashboardSession } from '../../lib/types'
import type { DrawerTab } from './DashboardPage'
import {
  deriveStatus, formatDate,
  NEXT_STEP_LABEL, VERDICT_STYLES,
} from './dashboardUtils'

interface ApplicationRowProps {
  session: DashboardSession
  onContinue: (sessionId: string) => void
  onOpenDrawer: (session: DashboardSession, tab: DrawerTab) => void
  onDownload: (sessionId: string) => void
  onRemove: (sessionId: string) => void
  downloading: boolean
}

const STATUS_STYLES = {
  in_progress: { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6', label: 'In Progress' },
  completed:   { bg: '#ECFDF5', text: '#065F46', dot: '#10B981', label: 'Completed' },
  passed:      { bg: '#F3F4F6', text: '#9CA3AF', dot: '#D1D5DB', label: 'Passed' },
}

// Fixed-width grid: [primary action] [Decoded JD] [View Fit]
// All rows align because each slot has a fixed width regardless of content.
const ACTION_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '96px 76px 56px',
  gap: 8,
  alignItems: 'center',
}

export default function ApplicationRow({
  session, onContinue, onOpenDrawer, onDownload, onRemove, downloading,
}: ApplicationRowProps) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const status = deriveStatus(session)
  const statusStyle = STATUS_STYLES[status]
  const verdictStyle = session.verdict ? VERDICT_STYLES[session.verdict] : null
  const nextStep = NEXT_STEP_LABEL[session.current_step] ?? ''
  const canViewFit = !['decoded', 'resume_loaded'].includes(session.current_step)

  return (
    <tr style={{ cursor: 'default' }}>
      <td style={TD}>
        <span style={{ fontWeight: 500, color: '#111827' }}>{session.company ?? '—'}</span>
      </td>
      <td style={TD}>
        <span style={{ color: '#374151' }}>{session.role ?? '—'}</span>
      </td>
      <td style={TD}>
        <span style={{ color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatDate(session.created_at)}
        </span>
      </td>
      <td style={TD}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: statusStyle.bg, color: statusStyle.text, whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusStyle.dot, flexShrink: 0 }} />
          {statusStyle.label}
        </span>
      </td>
      <td style={TD}>
        {verdictStyle ? (
          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: verdictStyle.bg, color: verdictStyle.text, whiteSpace: 'nowrap' }}>
            {verdictStyle.label}
          </span>
        ) : (
          <span style={{ color: '#D1D5DB', fontSize: 13 }}>—</span>
        )}
      </td>
      <td style={TD}>
        <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>{nextStep}</span>
      </td>

      {/* Main actions */}
      <td style={TD}>
        <div style={ACTION_GRID}>
          {/* Slot 1: primary action */}
          {status === 'in_progress' && (
            <button onClick={() => onContinue(session.id)} style={BTN_PRIMARY}>
              Continue
            </button>
          )}
          {status === 'completed' && (
            <button
              onClick={() => onDownload(session.id)}
              disabled={downloading}
              style={{ ...BTN_SECONDARY, opacity: downloading ? 0.5 : 1, cursor: downloading ? 'default' : 'pointer' }}
            >
              {downloading ? 'Generating…' : '↓ Resume'}
            </button>
          )}
          {status === 'passed' && <div />}

          {/* Slot 2: Decoded JD */}
          <button onClick={() => onOpenDrawer(session, 'jd')} style={BTN_GHOST}>
            Decoded JD
          </button>

          {/* Slot 3: View Fit */}
          <button
            onClick={() => canViewFit && onOpenDrawer(session, 'fit')}
            disabled={!canViewFit}
            style={{ ...BTN_GHOST, color: canViewFit ? '#6B7280' : '#D1D5DB', cursor: canViewFit ? 'pointer' : 'default', textDecoration: canViewFit ? 'underline' : 'none' }}
          >
            View Fit
          </button>
        </div>
      </td>

      {/* Remove column */}
      <td style={{ ...TD, paddingRight: 20, width: 72, textAlign: 'right' }}>
        {confirmRemove ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setConfirmRemove(false); onRemove(session.id) }}
              style={{ fontSize: 11, fontWeight: 500, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Remove
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            style={{ fontSize: 12, color: '#D1D5DB', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            title="Remove from dashboard"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  )
}

const TD: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid #F3F4F6',
  verticalAlign: 'middle',
  fontSize: 13,
}

const BTN_PRIMARY: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, padding: '5px 0',
  background: '#111827', color: '#FFFFFF',
  border: 'none', borderRadius: 5, cursor: 'pointer',
  width: '100%', textAlign: 'center',
}

const BTN_SECONDARY: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, padding: '5px 0',
  background: '#374151', color: '#FFFFFF',
  border: 'none', borderRadius: 5,
  width: '100%', textAlign: 'center',
}

const BTN_GHOST: React.CSSProperties = {
  fontSize: 12, color: '#6B7280',
  background: 'none', border: 'none', cursor: 'pointer',
  padding: 0, textDecoration: 'underline',
  textUnderlineOffset: 2, whiteSpace: 'nowrap',
  textAlign: 'center', width: '100%',
}
