'use client'

import type { DerivedStatus } from './dashboardUtils'

export type StatusFilter = 'all' | DerivedStatus
export type FitFilter = 'all' | 'no-brainer' | 'stretch but doable' | 'not a fit'

interface DashboardFiltersProps {
  statusFilter: StatusFilter
  fitFilter: FitFilter
  onStatusChange: (v: StatusFilter) => void
  onFitChange: (v: FitFilter) => void
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'passed', label: 'Passed' },
]

const FIT_OPTIONS: { value: FitFilter; label: string }[] = [
  { value: 'all', label: 'All Fit' },
  { value: 'no-brainer', label: 'No-brainer' },
  { value: 'stretch but doable', label: 'Stretch' },
  { value: 'not a fit', label: 'Not a fit' },
]

function FilterPill<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center" style={{ gap: 2, background: '#F3F4F6', borderRadius: 6, padding: 2 }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="text-xs font-medium px-3 py-1"
          style={{
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            background: value === o.value ? '#FFFFFF' : 'transparent',
            color: value === o.value ? '#111827' : '#6B7280',
            boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function DashboardFilters({ statusFilter, fitFilter, onStatusChange, onFitChange }: DashboardFiltersProps) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
      <FilterPill options={STATUS_OPTIONS} value={statusFilter} onChange={onStatusChange} />
      <FilterPill options={FIT_OPTIONS} value={fitFilter} onChange={onFitChange} />
    </div>
  )
}
