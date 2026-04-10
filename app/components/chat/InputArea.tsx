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
      className="fixed bottom-0 left-0 right-0"
      style={{ borderTop: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', height: 64 }}
    >
      <div className="mx-auto max-w-[680px] h-full flex items-center gap-3 px-6">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0"
          style={{ color: '#9CA3AF' }}
          title="Upload file"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-5-5z" />
            <path d="M11 3v5h5" />
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
    </div>
  )
}
