'use client'

import Header from './Header'
import ChatPane from '../chat/ChatPane'
import DiffViewPanel from '../diff/DiffViewPanel'
import QuantificationPanel from '../chat/QuantificationPanel'
import { useSession } from '../../lib/session'

export default function AppLayout({ initialSessionId = null }: { initialSessionId?: string | null }) {
  const session = useSession(initialSessionId)

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: '#F9FAFB' }}>
      <Header onNewRole={session.startNewSession} />
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
          excludedOutOfScopeRoles={session.excludedOutOfScopeRoles}
          isStreaming={session.isStreaming}
          onAccept={session.acceptBullet}
          onReject={session.rejectBullet}
          onEdit={session.editBullet}
          onToggleOutOfScopeRole={session.toggleOutOfScopeRole}
          onDownload={session.downloadResume}
        />
      )}

      {session.quantificationQuestions && session.quantificationQuestions.length > 0 && (
        <QuantificationPanel
          questions={session.quantificationQuestions}
          isStreaming={session.isStreaming}
          onSubmit={session.submitQuantifications}
        />
      )}
    </div>
  )
}
