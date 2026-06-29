import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { mockFinancialYears } from '../data/mockData'

export const allYears = mockFinancialYears.map((f) => f.fy)

export default function YearFilter({ selectedYears, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (fy) => {
    if (selectedYears.includes(fy)) {
      if (selectedYears.length === 1) return
      onChange(selectedYears.filter((y) => y !== fy))
    } else {
      onChange([...selectedYears, fy])
    }
  }

  const selectAll = () => onChange([...allYears])
  const isAll = selectedYears.length === allYears.length

  const label = isAll
    ? 'All Years'
    : selectedYears.length === 1
      ? `FY ${selectedYears[0]}`
      : `${selectedYears.length} Years`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          color: '#475569', background: '#fff',
          border: '1px solid #e2e8f0', cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
          borderColor: open ? '#a5b4fc' : '#e2e8f0',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={14} style={{ color: '#94a3b8' }} />
        {label}
        <ChevronDown size={14} style={{
          color: '#94a3b8',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          minWidth: 200, padding: '6px 0',
          background: '#fff', borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        }}>
          {/* Select All */}
          <button
            onClick={isAll ? () => onChange([allYears[0]]) : selectAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 14px',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              color: isAll ? '#6366f1' : '#64748b',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid #f1f5f9',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 4,
              border: isAll ? '2px solid #6366f1' : '2px solid #cbd5e1',
              background: isAll ? '#6366f1' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.12s',
            }}>
              {isAll && <Check size={10} color="#fff" strokeWidth={3} />}
            </div>
            Select All
          </button>

          {/* Year checkboxes */}
          {allYears.map((fy) => {
            const checked = selectedYears.includes(fy)
            return (
              <button
                key={fy}
                onClick={() => toggle(fy)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '8px 14px',
                  fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                  color: checked ? '#1e293b' : '#64748b',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: checked ? '2px solid #6366f1' : '2px solid #cbd5e1',
                  background: checked ? '#6366f1' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.12s',
                }}>
                  {checked && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
                FY {fy}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
