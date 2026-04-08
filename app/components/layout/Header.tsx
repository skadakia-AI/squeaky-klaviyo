'use client'

import { useState } from 'react'
import { UserButton } from '@clerk/nextjs'

interface HeaderProps {
  hasActiveSession: boolean
  onNewRole: () => void
}

export default function Header({ hasActiveSession, onNewRole }: HeaderProps) {
  const [confirming, setConfirming] = useState(false)

  function handleNewRole() {
    if (hasActiveSession) {
      setConfirming(true)
    } else {
      onNewRole()
    }
  }

  function handleConfirm() {
    setConfirming(false)
    onNewRole()
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-6"
      style={{
        height: 48,
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF',
      }}
    >
      <span className="text-sm font-semibold tracking-tight" style={{ color: '#111827' }}>
        squeaky
      </span>

      <div className="flex items-center gap-4">
        {confirming ? (
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: '#6B7280' }}>
              Discard current session?
            </span>
            <button
              onClick={handleConfirm}
              className="text-sm font-medium"
              style={{ color: '#DC2626' }}
            >
              Discard
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-sm"
              style={{ color: '#6B7280' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleNewRole}
            className="text-sm px-3 py-1 rounded"
            style={{
              backgroundColor: '#F3F4F6',
              color: '#111827',
              borderRadius: 6,
            }}
          >
            New role
          </button>
        )}
        <UserButton />
      </div>
    </header>
  )
}
