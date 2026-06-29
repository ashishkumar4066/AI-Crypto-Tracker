import { Calendar } from 'lucide-react'
import { mockFinancialYears } from '../data/mockData'

export default function FYSelector({ selectedFY, onFYChange }) {
  return (
    <div className="px-1">
      <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase mb-2"
        style={{ letterSpacing: '0.1em', color: 'rgba(148,163,184,0.5)' }}>
        <Calendar className="w-3 h-3" strokeWidth={2} />
        Financial Year
      </label>
      <select
        value={selectedFY}
        onChange={(e) => onFYChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg text-[13px] font-medium focus:outline-none transition-all duration-200 appearance-none cursor-pointer"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#cbd5e1',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        {mockFinancialYears.map((fy) => (
          <option key={fy.fy} value={fy.fy} style={{ background: '#1e293b', color: '#cbd5e1' }}>
            FY {fy.fy} ({fy.count} txns)
          </option>
        ))}
      </select>
    </div>
  )
}
