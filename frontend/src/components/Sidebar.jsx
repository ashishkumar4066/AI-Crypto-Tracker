import { useState } from 'react'
import {
  GitBranch,
  TableProperties,
  TrendingUp,
  ChevronRight,
  Layers,
  Route,
} from 'lucide-react'

const exchanges = [
  { id: 'binance',  label: 'Binance',  color: '#F0B90B' },
  { id: 'kucoin',   label: 'KuCoin',   color: '#23AF91' },
  { id: 'wazirx',   label: 'WazirX',   color: '#5B6DEE' },
  { id: 'mudrex',   label: 'Mudrex',   color: '#FF6B35' },
]

function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.14em', color: 'rgba(148,163,184,0.35)',
      padding: '0 8px', marginBottom: 10,
    }}>
      {children}
    </p>
  )
}

function ExchangeItem({ ex, isOpen, isActive, onToggle, currentView, onNavigate }) {
  return (
    <div style={{ marginBottom: isOpen ? 6 : 2 }}>
      {/* Exchange row */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '10px 12px', borderRadius: 12,
          border: 'none', cursor: 'pointer', transition: 'background 0.15s',
          background: isOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
          color: isOpen ? '#fff' : 'rgba(203,213,225,0.75)',
          fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = isOpen ? 'rgba(255,255,255,0.06)' : 'transparent' }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: ex.color, boxShadow: `0 0 8px ${ex.color}40`, flexShrink: 0,
        }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{ex.label}</span>
        <ChevronRight size={14} style={{
          color: 'rgba(148,163,184,0.4)', transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        }} />
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div style={{
          margin: '6px 0 4px 20px', padding: '10px 14px',
          borderRadius: 10, background: 'rgba(255,255,255,0.03)',
          borderLeft: `2px solid ${ex.color}40`,
        }}>
          {/* Sub-nav */}
          {[
            { id: 'transactions', label: 'Transactions', icon: TableProperties },
            { id: 'flow', label: 'Flow Map', icon: GitBranch },
            { id: 'coinflow', label: 'Coin Flows', icon: Route },
          ].map((item) => {
            const Icon = item.icon
            const active = isActive && currentView === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(ex.id, item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', transition: 'background 0.12s',
                  background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: active ? '#a5b4fc' : 'rgba(148,163,184,0.55)',
                  fontSize: 12, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? 'rgba(99,102,241,0.15)' : 'transparent' }}
              >
                <Icon size={14} strokeWidth={2} />
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({
  currentView,
  selectedExchange,
  onNavigate,
}) {
  const [openExchange, setOpenExchange] = useState(selectedExchange || 'binance')

  return (
    <aside style={{
      width: 264, height: '100vh', display: 'flex', flexDirection: 'column',
      flexShrink: 0, background: 'linear-gradient(180deg, #0f172a 0%, #1a1440 100%)',
      fontFamily: 'inherit',
    }}>

      {/* Logo */}
      <div style={{ padding: '28px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          }}>
            <TrendingUp size={20} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>CryptoTracker</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(148,163,184,0.45)', marginTop: 2 }}>Portfolio Flow</div>
          </div>
        </div>
      </div>

      {/* Scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 14px' }}>
        <SectionLabel>Exchanges</SectionLabel>
        <div style={{ marginBottom: 24 }}>
          {exchanges.map((ex) => (
            <ExchangeItem
              key={ex.id}
              ex={ex}
              isOpen={openExchange === ex.id}
              isActive={selectedExchange === ex.id}
              onToggle={() => setOpenExchange(openExchange === ex.id ? null : ex.id)}
              currentView={currentView}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '0 8px 20px' }} />

        <SectionLabel>Overview</SectionLabel>
        <div>
          {[
            { id: 'flow', label: 'Flow Map', icon: GitBranch, desc: 'All exchanges' },
            { id: 'transactions', label: 'Transactions', icon: Layers, desc: 'Combined view' },
          ].map((item) => {
            const Icon = item.icon
            const active = selectedExchange === null && currentView === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(null, item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '11px 12px', borderRadius: 12,
                  border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                  background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: active ? '#fff' : 'rgba(203,213,225,0.65)',
                  fontSize: 13, fontWeight: 500, fontFamily: 'inherit', marginBottom: 4,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? 'rgba(255,255,255,0.07)' : 'transparent' }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                }}>
                  <Icon size={15} style={{ color: active ? '#818cf8' : 'rgba(148,163,184,0.45)' }} strokeWidth={2} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ lineHeight: 1.2 }}>{item.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: 'rgba(148,163,184,0.35)', marginTop: 2 }}>{item.desc}</div>
                </div>
                {active && (
                  <div style={{
                    marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
                    background: '#818cf8', boxShadow: '0 0 8px rgba(129,140,248,0.5)',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom: Status */}
      <div style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.025)',
        }}>
          <div className="animate-pulse-soft" style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.4)',
          }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(148,163,184,0.4)' }}>Connected</span>
        </div>
      </div>
    </aside>
  )
}
