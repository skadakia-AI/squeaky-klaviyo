'use client'

import { useState, useRef, useEffect } from 'react'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import CheckpointButtons from './CheckpointButtons'
import InputArea from './InputArea'
import type { CurrentStep } from '../../lib/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

type CheckpointType = 'jd_preview' | 'pursue_or_pass' | null

interface ChatPaneProps {
  onSessionChange: (sessionId: string | null) => void
}

export default function ChatPane({ onSessionChange }: ChatPaneProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<CurrentStep | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [checkpoint, setCheckpoint] = useState<CheckpointType>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addMessage(msg: Omit<Message, 'id'>) {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID() }])
  }

  async function send(content: string, file?: File) {
    if (isStreaming) return

    // Add user message to UI
    const displayContent = file ? `📎 ${file.name}` : content
    addMessage({ role: 'user', content: displayContent })
    setIsStreaming(true)
    setCheckpoint(null)

    // Build message payload
    let msgPayload: { type: 'text' | 'file_upload'; content: string; file_name?: string; file_type?: string }

    if (file) {
      const base64 = await fileToBase64(file)
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      msgPayload = {
        type: 'file_upload',
        content: base64,
        file_name: file.name,
        file_type: ext as 'pdf' | 'docx' | 'txt',
      }
    } else {
      msgPayload = { type: 'text', content }
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msgPayload }),
      })

      if (!res.ok || !res.body) {
        addMessage({ role: 'assistant', content: 'Something went wrong. Please try again.', isError: true })
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleEvent(event)
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      addMessage({ role: 'assistant', content: 'Connection error. Please try again.', isError: true })
    }

    setIsStreaming(false)
  }

  function handleEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case 'session_created': {
        const id = event.session_id as string
        setSessionId(id)
        onSessionChange(id)
        break
      }
      case 'message': {
        const content = event.content as string
        addMessage({ role: 'assistant', content })
        break
      }
      case 'step_complete': {
        const step = event.step as CurrentStep
        setCurrentStep(step)
        if (step === 'jd_loaded') setCheckpoint('jd_preview')
        if (step === 'assessed') setCheckpoint('pursue_or_pass')
        break
      }
      case 'error': {
        addMessage({ role: 'assistant', content: event.message as string, isError: true })
        break
      }
      case 'done':
        setIsStreaming(false)
        break
    }
  }

  function getPlaceholder(): string {
    if (!currentStep || currentStep === 'created') return 'Paste a job posting URL, upload a PDF, or paste the text...'
    if (currentStep === 'decoded') return 'Upload your resume or paste it here...'
    if (currentStep === 'targeted' || currentStep === 'exported') return ''
    return 'Type your response...'
  }

  const showInput = checkpoint === null && currentStep !== 'targeted' && currentStep !== 'exported' && currentStep !== 'not_pursuing'
  const inputDisabled = isStreaming

  return (
    <>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ paddingBottom: 80, backgroundColor: '#F9FAFB' }}>
        <div className="mx-auto max-w-[680px] flex flex-col gap-4">
          {messages.length === 0 && (
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Drop in a job description — paste a URL, upload a PDF, or paste the text directly.
              I'll decode what the hiring manager actually wants.
            </p>
          )}
          {messages.map(msg =>
            msg.role === 'user'
              ? <UserMessage key={msg.id} content={msg.content} />
              : <AssistantMessage key={msg.id} content={msg.content} isError={msg.isError} />
          )}
          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <AssistantMessage content="" isStreaming />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area or checkpoint buttons */}
      {checkpoint ? (
        <CheckpointButtons type={checkpoint} onChoice={(val) => send(val)} disabled={isStreaming} />
      ) : showInput ? (
        <InputArea
          placeholder={getPlaceholder()}
          disabled={inputDisabled}
          onSend={send}
        />
      ) : null}
    </>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
