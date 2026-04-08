'use client'

import { useState, useCallback } from 'react'
import Header from './Header'
import ChatPane from '../chat/ChatPane'

export default function AppLayout() {
  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  function handleSessionChange(sessionId: string | null) {
    setHasActiveSession(!!sessionId)
  }

  const handleNewRole = useCallback(() => {
    setHasActiveSession(false)
    setResetKey(k => k + 1)  // remounts ChatPane, resetting all state
  }, [])

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      <Header hasActiveSession={hasActiveSession} onNewRole={handleNewRole} />
      <div className="flex flex-col flex-1 overflow-hidden" style={{ marginTop: 48 }}>
        <ChatPane key={resetKey} onSessionChange={handleSessionChange} />
      </div>
    </div>
  )
}
