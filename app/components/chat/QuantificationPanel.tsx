'use client'

import { useState } from 'react'
import type { QuantificationQuestion } from '../../lib/types'

interface QuantificationPanelProps {
  questions: QuantificationQuestion[]
  isStreaming: boolean
  onSubmit: (answers: string[]) => void
}

export default function QuantificationPanel({ questions, isStreaming, onSubmit }: QuantificationPanelProps) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''))

  function setAnswer(i: number, value: string) {
    setAnswers(prev => { const next = [...prev]; next[i] = value; return next })
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: '#F9FAFB', zIndex: 20, top: 48 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #E5E7EB', backgroundColor: '#FFFFFF' }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#111827' }}>
            A few numbers needed
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
            Rough estimates are fine. Leave blank anything you don&apos;t have.
          </p>
        </div>
        <button
          onClick={() => onSubmit(answers)}
          disabled={isStreaming}
          className="px-4 py-1.5 text-sm font-medium rounded flex-shrink-0"
          style={{
            backgroundColor: '#111827',
            color: '#FFFFFF',
            borderRadius: 6,
            opacity: isStreaming ? 0.5 : 1,
            cursor: isStreaming ? 'not-allowed' : 'pointer',
          }}
        >
          Submit
        </button>
      </div>

      {/* Column headers */}
      <div
        className="grid gap-4 px-6 py-2 flex-shrink-0"
        style={{ gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #F3F4F6' }}
      >
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#9CA3AF' }}>
          Bullet
        </span>
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#9CA3AF' }}>
          Question
        </span>
      </div>

      {/* Questions */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        <div className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <div
              key={i}
              className="grid gap-4 py-3 px-3 rounded"
              style={{
                gridTemplateColumns: '1fr 1fr',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
              }}
            >
              {/* Bullet text */}
              <p className="text-sm" style={{ color: '#6B7280' }}>
                {q.bullet}
              </p>

              {/* Question + input */}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium" style={{ color: '#111827' }}>
                  {q.question}
                </p>
                <input
                  type="text"
                  value={answers[i]}
                  onChange={e => setAnswer(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && i === questions.length - 1) onSubmit(answers) }}
                  placeholder="Enter a number, or leave blank to skip"
                  className="text-sm w-full outline-none"
                  style={{
                    border: '1px solid #D1D5DB',
                    borderRadius: 4,
                    padding: '6px 8px',
                    backgroundColor: '#FAFAFA',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
