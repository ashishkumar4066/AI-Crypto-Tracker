import { Handle, Position } from 'reactflow'
import {
  Landmark,
  Wallet,
  CandlestickChart,
  HardDrive,
  Ghost,
  CircleDot,
} from 'lucide-react'

const iconMap = {
  'landmark': Landmark,
  'wallet': Wallet,
  'candlestick-chart': CandlestickChart,
  'hard-drive': HardDrive,
  'ghost': Ghost,
}

const variantStyles = {
  source: {
    bg: '#f0fdf4',
    borderColor: '#bbf7d0',
    iconGradient: 'linear-gradient(135deg, #34d399, #10b981)',
    iconShadow: '0 4px 10px rgba(16,185,129,0.25)',
    tagBg: '#ecfdf5',
    tagColor: '#059669',
    tagBorder: '#a7f3d0',
  },
  exchange: {
    bg: '#eff6ff',
    borderColor: '#bfdbfe',
    iconGradient: 'linear-gradient(135deg, #60a5fa, #6366f1)',
    iconShadow: '0 4px 10px rgba(99,102,241,0.25)',
    tagBg: '#eff6ff',
    tagColor: '#4f46e5',
    tagBorder: '#bfdbfe',
  },
  external: {
    bg: '#fffbeb',
    borderColor: '#fde68a',
    iconGradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    iconShadow: '0 4px 10px rgba(245,158,11,0.25)',
    tagBg: '#fefce8',
    tagColor: '#d97706',
    tagBorder: '#fde68a',
  },
}

export default function WalletNode({ data }) {
  const Icon = iconMap[data.icon] || CircleDot
  const v = variantStyles[data.variant] || variantStyles.exchange

  return (
    <div
      className="min-w-[190px] max-w-[230px] rounded-2xl px-5 py-4"
      style={{
        background: `linear-gradient(135deg, ${v.bg}, #ffffff)`,
        border: `1px solid ${v.borderColor}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      <Handle type="target" position={Position.Left}
        style={{ width: 10, height: 10, background: '#fff', border: '2px solid #cbd5e1', left: -5, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />
      <Handle type="source" position={Position.Right}
        style={{ width: 10, height: 10, background: '#fff', border: '2px solid #cbd5e1', right: -5, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: v.iconGradient, boxShadow: v.iconShadow }}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{data.label}</div>
          <div className="text-[10px] font-medium mt-0.5" style={{ color: '#94a3b8' }}>{data.subtitle}</div>
        </div>
      </div>

      {/* Assets */}
      {data.assets && data.assets.length > 0 && (
        <div className="space-y-2 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
          {data.assets.map((asset, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md"
                style={{ background: v.tagBg, color: v.tagColor, border: `1px solid ${v.tagBorder}`, letterSpacing: '0.05em' }}>
                {asset.symbol}
              </span>
              <span className="text-[12px] font-mono font-semibold" style={{ color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                {asset.amount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
