'use client'

import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

interface HeaderProps {
  onNewRole: () => void
}

export default function Header({ onNewRole }: HeaderProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-6"
      style={{
        height: 48,
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: '#FFFFFF',
      }}
    >
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight"
        style={{ color: '#111827', textDecoration: 'none' }}
      >
        squeaky
      </Link>

      <div className="flex items-center gap-4">
        <button
          onClick={onNewRole}
          className="text-sm px-3 py-1 rounded"
          style={{ backgroundColor: '#F3F4F6', color: '#111827', borderRadius: 6 }}
        >
          + New Application
        </button>
        <UserButton />
      </div>
    </header>
  )
}
