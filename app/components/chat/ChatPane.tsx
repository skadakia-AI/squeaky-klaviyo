'use client'

import { useRef, useEffect, useState } from 'react'
import MessageList from './MessageList'
import CheckpointButtons from './CheckpointButtons'
import InputArea from './InputArea'
import type { useSession } from '../../lib/session'
import type { OutboundMessage } from '../../lib/types'

type Session = ReturnType<typeof useSession>

interface ChatPaneProps {
  session: Session
}

export default function ChatPane({ session }: ChatPaneProps) {
  const { messages, isStreaming, checkpoint, currentStep, showDiffView,
    bulletReviews, bulletEdits, sendMessage, clearCheckpoint, acceptBullet, rejectBullet,
    editBullet, pendingRecovery, continueSession, abandonSession } = session
  const bottomRef = useRef<HTMLDivElement>(null)
  const [arcCorrectionMode, setArcCorrectionMode] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(content: string, file?: File) {
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
        sendMessage({
          type: 'file_upload',
          content: base64,
          file_name: file.name,
          file_type: ext as OutboundMessage['file_type'],
        })
      }
      reader.readAsDataURL(file)
    } else if (arcCorrectionMode) {
      setArcCorrectionMode(false)
      sendMessage({ type: 'checkpoint', content })
    } else {
      sendMessage({ type: 'text', content })
    }
  }

  function getPlaceholder(): string {
    if (!currentStep || currentStep === 'created') return 'Paste a job posting URL, upload a PDF, or paste the text...'
    if (currentStep === 'decoded') return 'Upload your resume or paste it here...'
    if (currentStep === 'targeted' || currentStep === 'exported') return ''
    return 'Type your response...'
  }

  const showInput = !checkpoint && !showDiffView &&
    currentStep !== 'targeted' && currentStep !== 'exported' && currentStep !== 'not_pursuing'

  return (
    <>
      <div
        className="flex-1 overflow-y-auto px-6 py-6"
        style={{ paddingBottom: 80, backgroundColor: '#F9FAFB' }}
      >
        <div className="mx-auto max-w-[680px] flex flex-col gap-4">

          {/* Session recovery prompt */}
          {pendingRecovery && (
            <div
              className="rounded-lg px-4 py-3 text-sm flex flex-col gap-2"
              style={{ backgroundColor: '#F3F4F6', color: '#111827', borderRadius: 8 }}
            >
              <span>
                You were working on{' '}
                <strong>{pendingRecovery.session.role ?? 'a role'}</strong>
                {pendingRecovery.session.company ? ` at ${pendingRecovery.session.company}` : ''}.
                Continue where you left off?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => continueSession(
                    pendingRecovery.session.id,
                    pendingRecovery.messages,
                    pendingRecovery.session
                  )}
                  className="px-3 py-1 text-xs font-medium rounded"
                  style={{ backgroundColor: '#111827', color: '#FFFFFF', borderRadius: 4 }}
                >
                  Continue
                </button>
                <button
                  onClick={abandonSession}
                  className="px-3 py-1 text-xs rounded"
                  style={{ backgroundColor: '#E5E7EB', color: '#6B7280', borderRadius: 4 }}
                >
                  Start fresh
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && !pendingRecovery && (
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Drop in a job description — paste a URL, upload a PDF, or paste the text directly.
              I&apos;ll decode what the hiring manager actually wants.
            </p>
          )}

          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            bulletReviews={bulletReviews}
            bulletEdits={bulletEdits}
            onAccept={acceptBullet}
            onReject={rejectBullet}
            onEdit={editBullet}
            onCheckpointChoice={(val) => sendMessage({ type: 'checkpoint', content: val })}
          />
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom bar: checkpoint buttons or text input */}
      {checkpoint === 'arc_confirmation' ? (
        <CheckpointButtons
          type="arc_confirmation"
          onChoice={(val) => {
            if (val === 'correct') { clearCheckpoint(); setArcCorrectionMode(true) }
            else sendMessage({ type: 'checkpoint', content: val })
          }}
          disabled={isStreaming}
        />
      ) : showInput ? (
        <InputArea placeholder={getPlaceholder()} disabled={isStreaming} onSend={handleSend} />
      ) : null}
    </>
  )
}
