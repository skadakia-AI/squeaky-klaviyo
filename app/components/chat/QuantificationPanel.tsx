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
      {/* Header — matches DiffHeader exactly */}
      <div
        className="flex items-center justify-between px-6"
        style={{ height: 56, borderBottom: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', flexShrink: 0 }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: '#111827' }}>
            A few numbers needed
          </span>
          <span className="text-xs" style={{ color: '#6B7280' }}>
            Rough estimates are fine — leave blank anything you don&apos;t have
          </span>
        </div>
        <button
          onClick={() => onSubmit(answers)}
          disabled={isStreaming}
          className="px-4 py-2 text-sm font-medium rounded"
          style={{
            backgroundColor: isStreaming ? '#E5E7EB' : '#111827',
            color: isStreaming ? '#9CA3AF' : '#FFFFFF',
            borderRadius: 6,
          }}
        >
          Submit
        </button>
      </div>

      {/* Body — matches DiffBody: px-6 py-6, max-w-[900px] centered */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-[900px]">
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>

            {/* Column headers — matches RoleSection headers */}
            <div
              className="grid gap-4 px-3 py-2 text-xs font-medium"
              style={{
                gridTemplateColumns: '1fr 1fr',
                backgroundColor: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB',
                color: '#6B7280',
              }}
            >
              <span>Your bullet</span>
              <span>What&apos;s needed</span>
            </div>

            {/* Question rows — matches BulletRow layout */}
            {questions.map((q, i) => (
              <div
                key={i}
                className="grid gap-4 py-3 px-3"
                style={{
                  gridTemplateColumns: '1fr 1fr',
                  backgroundColor: '#FFFFFF',
                  borderBottom: i < questions.length - 1 ? '1px solid #F3F4F6' : 'none',
                }}
              >
                <p className="text-sm" style={{ color: '#6B7280' }}>
                  {q.bullet}
                </p>

                <div className="flex flex-col gap-2">
                  <p className="text-sm" style={{ color: '#111827' }}>
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
                      padding: '5px 8px',
                      backgroundColor: '#FAFAFA',
                      color: '#111827',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
