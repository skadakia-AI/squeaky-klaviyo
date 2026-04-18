'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import type { DashboardSession } from '../../lib/types'
import { fetchSessions, triggerExport, archiveSession } from '../../lib/api'
import DashboardFilters, { type StatusFilter, type FitFilter } from './DashboardFilters'
import ApplicationRow from './ApplicationRow'
import DashboardDrawer from './DashboardDrawer'
import { deriveStatus } from './dashboardUtils'

export type DrawerTab = 'jd' | 'fit' | 'resume'

const TH: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 11, fontWeight: 600, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}

export default function DashboardPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<DashboardSession[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [fitFilter, setFitFilter] = useState<FitFilter>('all')
  const [drawerSession, setDrawerSession] = useState<DashboardSession | null>(null)
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('jd')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    fetchSessions().then(data => {
      setSessions(data)
      setLoading(false)
    })
  }, [])

  const filtered = sessions.filter(s => {
    if (statusFilter !== 'all' && deriveStatus(s) !== statusFilter) return false
    if (fitFilter !== 'all' && s.verdict !== fitFilter) return false
    return true
  })

  const openDrawer = useCallback((session: DashboardSession, tab: DrawerTab) => {
    setDrawerSession(session)
    setDrawerTab(tab)
  }, [])

  const closeDrawer = useCallback(() => setDrawerSession(null), [])

  async function handleRemove(sessionId: string) {
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    const ok = await archiveSession(sessionId)
    if (!ok) {
      // Restore the row if the API call failed
      fetchSessions().then(setSessions)
    }
  }

  async function handleDownload(sessionId: string) {
    setDownloadingId(sessionId)
    const result = await triggerExport(sessionId)
    setDownloadingId(null)
    if (result?.downloadUrl) window.open(result.downloadUrl, '_blank')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      {/* Header */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, height: 48, background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em', color: '#111827' }}>squeaky</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/session/new"
            style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', background: '#111827', color: '#FFFFFF', borderRadius: 6, textDecoration: 'none' }}
          >
            + New Application
          </Link>
          <UserButton />
        </div>
      </header>

      <main style={{ marginTop: 48, padding: '36px 40px', maxWidth: 1120 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: '#111827' }}>My Applications</h1>
        </div>

        <DashboardFilters
          statusFilter={statusFilter}
          fitFilter={fitFilter}
          onStatusChange={setStatusFilter}
          onFitChange={setFitFilter}
        />

        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState hasFilter={statusFilter !== 'all' || fitFilter !== 'all'} onNew={() => router.push('/session/new')} />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <th style={TH}>Company</th>
                  <th style={TH}>Role</th>
                  <th style={TH}>Added</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Fit</th>
                  <th style={TH}>Next Step</th>
                  <th style={TH}></th>
                  <th style={{ ...TH, paddingRight: 20 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <ApplicationRow
                    key={s.id}
                    session={s}
                    onContinue={id => router.push(`/session/${id}`)}
                    onOpenDrawer={openDrawer}
                    onDownload={handleDownload}
                    onRemove={handleRemove}
                    downloading={downloadingId === s.id}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <DashboardDrawer
        key={drawerSession?.id ?? 'none'}
        session={drawerSession}
        initialTab={drawerTab}
        onClose={closeDrawer}
      />
    </div>
  )
}

function EmptyState({ hasFilter, onNew }: { hasFilter: boolean; onNew: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, background: '#F3F4F6', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 12h8M8 8h8M8 16h4" />
        </svg>
      </div>
      {hasFilter ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>No matches</div>
          <div style={{ fontSize: 13, color: '#6B7280' }}>Try adjusting your filters.</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>No applications yet</div>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, maxWidth: 320, marginBottom: 20 }}>
            Paste a job description to decode the role, assess your fit, and tailor your resume for it.
          </div>
          <button
            onClick={onNew}
            style={{ fontSize: 13, fontWeight: 500, padding: '7px 14px', background: '#111827', color: '#FFFFFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            + New Application
          </button>
        </>
      )}
    </div>
  )
}
