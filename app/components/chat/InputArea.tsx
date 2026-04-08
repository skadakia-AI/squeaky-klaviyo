'use client'

import { useRef, useState } from 'react'

interface InputAreaProps {
  placeholder: string
  disabled: boolean
  onSend: (content: string, file?: File) => void
}

export default function InputArea({ placeholder, disabled, onSend }: InputAreaProps) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onSend('', file)
      e.target.value = ''
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex items-center gap-3 px-6"
      style={{
        height: 64,
        borderTop: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF',
      }}
    >
      <button
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        className="flex-shrink-0 text-sm"
        style={{ color: '#9CA3AF' }}
        title="Upload file"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 16l3-3 2.5 2.5L13 11l3 3" />
          <rect x="2" y="2" width="16" height="16" rx="2" />
        </svg>
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFile} />

      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 text-sm outline-none bg-transparent"
        style={{ color: '#111827' }}
      />

      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded"
        style={{
          backgroundColor: disabled || !text.trim() ? '#E5E7EB' : '#111827',
          color: disabled || !text.trim() ? '#9CA3AF' : '#FFFFFF',
          borderRadius: 6,
          transition: 'background-color 0.15s',
        }}
      >
        Send
      </button>
    </div>
  )
}
