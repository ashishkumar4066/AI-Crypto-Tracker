import { Handle, Position } from 'reactflow'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  CircleDot,
} from 'lucide-react'

const actionConfig = {
  BUY: { bg: '#ecfdf5', border: '#86efac', text: '#047857', icon: ArrowDownCircle, iconColor: '#10b981' },
  P2P_BUY: { bg: '#ecfdf5', border: '#86efac', text: '#047857', icon: ArrowDownCircle, iconColor: '#10b981' },
  SELL: { bg: '#fff1f2', border: '#fda4af', text: '#be123c', icon: ArrowUpCircle, iconColor: '#f43f5e' },
  P2P_SELL: { bg: '#fff1f2', border: '#fda4af', text: '#be123c', icon: ArrowUpCircle, iconColor: '#f43f5e' },
  CONVERT: { bg: '#f5f3ff', border: '#c4b5fd', text: '#6d28d9', icon: ArrowRightLeft, iconColor: '#8b5cf6' },
  DEPOSIT: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', icon: ArrowDownLeft, iconColor: '#3b82f6' },
  WITHDRAWAL: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309', icon: ArrowUpRight, iconColor: '#f59e0b' },
  INTERNAL_TRANSFER: { bg: '#f0f9ff', border: '#7dd3fc', text: '#0369a1', icon: ArrowRightLeft, iconColor: '#0ea5e9' },
  DUST: { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b', icon: Sparkles, iconColor: '#94a3b8' },
}

const fallback = { bg: '#f8fafc', border: '#cbd5e1', text: '#64748b', icon: CircleDot, iconColor: '#94a3b8' }

export default function ActionNode({ data }) {
  const c = actionConfig[data.actionType] || fallback
  const Icon = c.icon

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full"
      style={{
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <Handle type="target" position={Position.Left}
        style={{ width: 8, height: 8, background: '#fff', border: '2px solid #cbd5e1', left: -4, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      <Handle type="source" position={Position.Right}
        style={{ width: 8, height: 8, background: '#fff', border: '2px solid #cbd5e1', right: -4, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />

      <Icon className="w-4 h-4" style={{ color: c.iconColor }} strokeWidth={2.5} />
      <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: c.text, letterSpacing: '-0.01em' }}>
        {data.label}
      </span>
    </div>
  )
}
