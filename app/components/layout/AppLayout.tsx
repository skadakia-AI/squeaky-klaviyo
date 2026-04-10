'use client'

import Header from './Header'
import ChatPane from '../chat/ChatPane'
import DiffViewPanel from '../diff/DiffViewPanel'
import { useSession } from '../../lib/session'

export default function AppLayout() {
  const session = useSession()

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      <Header
        hasActiveSession={!!session.sessionId}
        onNewRole={session.startNewSession}
      />
      <div className="flex flex-col flex-1 overflow-hidden" style={{ marginTop: 48 }}>
        <ChatPane session={session} />
      </div>

      {session.showDiffView && session.targetingData && (
        <DiffViewPanel
          targetingData={session.targetingData}
          resumeData={session.resumeData}
          bulletReviews={session.bulletReviews}
          bulletEdits={session.bulletEdits}
          unreviewedCount={session.unreviewedCount}
          isStreaming={session.isStreaming}
          onAccept={session.acceptBullet}
          onReject={session.rejectBullet}
          onEdit={session.editBullet}
          onDownload={session.downloadResume}
        />
      )}
    </div>
  )
}
