'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { DashboardSession } from '../../lib/types'
import type { DrawerTab } from './DashboardPage'
import { fetchArtifact, triggerExport } from '../../lib/api'
import { formatDate } from './dashboardUtils'

interface DashboardDrawerProps {
  session: DashboardSession | null
  initialTab: DrawerTab
  onClose: () => void
}

const TABS: { key: DrawerTab; label: string }[] = [
  { key: 'jd', label: 'Decoded JD' },
  { key: 'fit', label: 'Fit Assessment' },
  { key: 'resume', label: 'Tailored Resume' },
]

// key prop on this component (from parent) resets it when session changes,
// so initialTab is always the correct starting value.
export default function DashboardDrawer({ session, initialTab, onClose }: DashboardDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>(initialTab)
  // undefined = not yet fetched; string = fetched (may be empty string on 404)
  const [artifacts, setArtifacts] = useState<Partial<Record<DrawerTab, string>>>({})
  const [downloading, setDownloading] = useState(false)

  const isOpen = !!session
  const canViewFit = session && !['decoded', 'resume_loaded'].includes(session.current_step)
  const canViewResume = session && ['targeted', 'exported'].includes(session.current_step)
  const isCompleted = session?.current_step === 'exported'

  const content = artifacts[tab]
  const isLoading = content === undefined

  function tabEnabled(t: DrawerTab) {
    if (t === 'fit') return !!canViewFit
    if (t === 'resume') return !!canViewResume
    return true
  }

  // Fetch the active tab's artifact when it becomes visible and hasn't been fetched yet
  useEffect(() => {
    if (!session) return
    if (!tabEnabled(tab)) return
    if (artifacts[tab] !== undefined) return

    fetchArtifact(session.id, tab).then(result => {
      setArtifacts(prev => ({ ...prev, [tab]: result ?? '' }))
    })
  // artifacts intentionally excluded — we only re-run when tab or session changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, tab])

  async function handleDownload() {
    if (!session) return
    setDownloading(true)
    const result = await triggerExport(session.id)
    setDownloading(false)
    if (result?.downloadUrl) window.open(result.downloadUrl, '_blank')
  }

  return (
    <>
      {isOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 40 }}
          onClick={onClose}
        />
      )}

      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 500,
          background: '#FFFFFF', borderLeft: '1px solid #E5E7EB',
          zIndex: 50, display: 'flex', flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        {session && (
          <>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                    {session.company ?? 'Unknown company'} — {session.role ?? 'Unknown role'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                    Added {formatDate(session.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {(canViewResume || isCompleted) && (
                    <button
                      onClick={handleDownload}
                      disabled={downloading}
                      style={{
                        fontSize: 12, fontWeight: 500, padding: '5px 12px',
                        background: '#FFFFFF', color: downloading ? '#9CA3AF' : '#374151',
                        border: '1px solid #E5E7EB', borderRadius: 5,
                        cursor: downloading ? 'default' : 'pointer',
                        opacity: downloading ? 0.6 : 1,
                      }}
                    >
                      {downloading ? 'Generating…' : '↓ Resume'}
                    </button>
                  )}
                  <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>
                    ×
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', padding: '0 20px', flexShrink: 0 }}>
              {TABS.map(({ key, label }) => {
                const enabled = tabEnabled(key)
                return (
                  <button
                    key={key}
                    onClick={() => { if (enabled) setTab(key) }}
                    style={{
                      fontSize: 12, fontWeight: 500, padding: '10px 0', marginRight: 20,
                      background: 'none', border: 'none',
                      borderBottom: tab === key ? '2px solid #111827' : '2px solid transparent',
                      color: !enabled ? '#D1D5DB' : tab === key ? '#111827' : '#9CA3AF',
                      cursor: enabled ? 'pointer' : 'default',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {!tabEnabled(tab) ? (
                <Placeholder text={tab === 'fit' ? 'Fit assessment not yet available.' : 'Resume targeting not yet complete.'} />
              ) : isLoading ? (
                <Placeholder text="Loading…" />
              ) : !content ? (
                <Placeholder text="Not available for this session." />
              ) : (
                <MarkdownBody content={content} isResume={tab === 'resume'} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
      <span style={{ fontSize: 13, color: '#9CA3AF' }}>{text}</span>
    </div>
  )
}

function MarkdownBody({ content, isResume }: { content: string; isResume: boolean }) {
  return (
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: isResume ? '1rem' : '0.875rem', fontWeight: 700, marginBottom: isResume ? '0.1rem' : '0.25rem', color: '#111827', marginTop: 0 }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '1.25rem', marginBottom: '0.3rem', color: isResume ? '#111827' : '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: isResume ? '1px solid #E5E7EB' : 'none', paddingBottom: isResume ? '0.2rem' : 0 }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.15rem', color: '#111827' }}>
              {children}
            </h3>
          ),
          p: ({ children }) => <p style={{ marginBottom: '0.4rem', marginTop: 0 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0' }}>{children}</ul>,
          li: ({ children }) => (
            <li style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <span style={{ color: '#9CA3AF', flexShrink: 0 }}>·</span>
              <span>{children}</span>
            </li>
          ),
          em: ({ children }) => <em style={{ fontStyle: 'italic', color: '#6B7280', fontSize: 12 }}>{children}</em>,
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          hr: () => <hr style={{ margin: '0.75rem 0', borderColor: '#F3F4F6' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
