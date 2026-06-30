import { useState, useEffect, useMemo } from 'react'
import { Search, ArrowLeft, ExternalLink, Loader2, Inbox, ArrowDownCircle, ArrowUpCircle, Repeat2, Gift, Trash2, Link2 } from 'lucide-react'
import { getCoinList, getCoinFlow } from '../api/client'

/* ─── colour map for event types ─── */
const EVENT_COLORS = {
  // Trades
  BUY:              { bg: '#ecfdf5', dot: '#10b981', text: '#065f46', label: 'Buy' },
  P2P_BUY:          { bg: '#ecfdf5', dot: '#10b981', text: '#065f46', label: 'P2P Buy' },
  FIAT_BUY:         { bg: '#ecfdf5', dot: '#10b981', text: '#065f46', label: 'Fiat Buy' },
  SELL:             { bg: '#fff1f2', dot: '#f43f5e', text: '#9f1239', label: 'Sell' },
  P2P_SELL:         { bg: '#fff1f2', dot: '#f43f5e', text: '#9f1239', label: 'P2P Sell' },
  FIAT_SELL:        { bg: '#fff1f2', dot: '#f43f5e', text: '#9f1239', label: 'Fiat Sell' },
  // Transfers
  DEPOSIT:          { bg: '#eff6ff', dot: '#3b82f6', text: '#1e40af', label: 'Deposit' },
  WITHDRAWAL:       { bg: '#fffbeb', dot: '#f59e0b', text: '#92400e', label: 'Withdrawal' },
  INTERNAL_TRANSFER:{ bg: '#f0f9ff', dot: '#0ea5e9', text: '#0c4a6e', label: 'Transfer' },
  // Convert / swap
  CONVERT:          { bg: '#f5f3ff', dot: '#8b5cf6', text: '#5b21b6', label: 'Convert' },
  CONVERT_IN:       { bg: '#f5f3ff', dot: '#8b5cf6', text: '#5b21b6', label: 'Convert In' },
  CONVERT_OUT:      { bg: '#fdf4ff', dot: '#a855f7', text: '#6b21a8', label: 'Convert Out' },
  // Token swaps / rebrands (non-taxable)
  TOKEN_SWAP_IN:    { bg: '#f0fdf4', dot: '#22c55e', text: '#14532d', label: 'Token Swap In' },
  TOKEN_SWAP_OUT:   { bg: '#fefce8', dot: '#eab308', text: '#713f12', label: 'Token Swap Out' },
  // Dust
  DUST_CONVERSION:  { bg: '#f8fafc', dot: '#94a3b8', text: '#475569', label: 'Dust Convert' },
  DUST_IN:          { bg: '#f8fafc', dot: '#94a3b8', text: '#475569', label: 'Dust In' },
  DUST_OUT:         { bg: '#f8fafc', dot: '#64748b', text: '#334155', label: 'Dust Out' },
  // Earn / Staking
  EARN_LOCK:        { bg: '#fff7ed', dot: '#f97316', text: '#7c2d12', label: 'Earn Lock' },
  EARN_UNLOCK:      { bg: '#ecfdf5', dot: '#34d399', text: '#065f46', label: 'Earn Unlock' },
  STAKING_LOCK:     { bg: '#fff7ed', dot: '#fb923c', text: '#7c2d12', label: 'Staking Lock' },
  STAKING_UNLOCK:   { bg: '#ecfdf5', dot: '#4ade80', text: '#065f46', label: 'Staking Unlock' },
  STAKING:          { bg: '#f0fdf4', dot: '#10b981', text: '#065f46', label: 'Staking' },
  // Rewards / income
  REWARD:           { bg: '#ecfdf5', dot: '#10b981', text: '#065f46', label: 'Reward' },
  FUTURES_PNL:      { bg: '#f0f9ff', dot: '#0ea5e9', text: '#0c4a6e', label: 'Futures P&L' },
  FUNDING_FEE_IN:   { bg: '#ecfdf5', dot: '#10b981', text: '#065f46', label: 'Funding Fee' },
  // Fees
  FEE:              { bg: '#f8fafc', dot: '#94a3b8', text: '#475569', label: 'Fee' },
  DUST:             { bg: '#f8fafc', dot: '#94a3b8', text: '#475569', label: 'Dust' },
}
const DEFAULT_COLOR = { bg: '#f8fafc', dot: '#64748b', text: '#475569', label: 'Unknown' }

function getColor(type) {
  return EVENT_COLORS[type] || DEFAULT_COLOR
}

/* ─── format helpers ─── */
function fmtNum(n, decimals) {
  if (n == null) return '-'
  const num = parseFloat(n)
  if (isNaN(num)) return '-'
  if (decimals !== undefined) return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  if (num === 0) return '0'
  if (Math.abs(num) < 0.01) return num.toFixed(6)
  if (Math.abs(num) < 1) return num.toFixed(4)
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function truncHash(hash) {
  if (!hash) return ''
  if (hash.length <= 14) return hash
  return hash.slice(0, 8) + '...' + hash.slice(-4)
}

/* ────────────────────────────────────────────────
   Coin List Mode
   ──────────────────────────────────────────────── */
function CoinListView({ coins, loading, onSelect }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('events')
  const [tab, setTab] = useState('all') // 'all' | 'active' | 'sold'

  const filtered = useMemo(() => {
    let list = coins || []
    if (tab === 'active') list = list.filter((c) => (c.current_balance || 0) > 0)
    if (tab === 'sold') list = list.filter((c) => (c.current_balance || 0) <= 0)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.asset.toLowerCase().includes(q))
    }
    if (sort === 'alpha') {
      list = [...list].sort((a, b) => a.asset.localeCompare(b.asset))
    } else if (sort === 'balance') {
      list = [...list].sort((a, b) => Math.abs(b.current_balance || 0) - Math.abs(a.current_balance || 0))
    } else {
      list = [...list].sort((a, b) => b.total_events - a.total_events)
    }
    return list
  }, [coins, search, sort, tab])

  const activeCount = useMemo(() => (coins || []).filter(c => (c.current_balance || 0) > 0).length, [coins])
  const soldCount = useMemo(() => (coins || []).filter(c => (c.current_balance || 0) <= 0).length, [coins])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>Loading coins...</span>
      </div>
    )
  }

  if (!coins || coins.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <Inbox size={48} style={{ color: '#cbd5e1' }} strokeWidth={1.5} />
        <span style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>No coin data available</span>
        <span style={{ fontSize: 12, color: '#cbd5e1' }}>Import transactions to see coin flows</span>
      </div>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
        {[
          { key: 'all', label: `All Coins (${(coins || []).length})` },
          { key: 'active', label: `Active Holdings (${activeCount})` },
          { key: 'sold', label: `Fully Sold (${soldCount})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              background: tab === t.key ? '#fff' : 'transparent',
              color: tab === t.key ? '#1e293b' : '#64748b',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search coins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10,
              fontSize: 13, fontWeight: 500, fontFamily: 'inherit', color: '#1e293b',
              background: '#fff', border: '1px solid #e2e8f0', outline: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          />
        </div>

        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          {[
            { key: 'events', label: 'Most Events' },
            { key: 'balance', label: 'Balance' },
            { key: 'alpha', label: 'A - Z' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: sort === s.key ? '#6366f1' : '#fff',
                color: sort === s.key ? '#fff' : '#64748b',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, marginLeft: 'auto' }}>
          {filtered.length} coin{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {filtered.map((coin) => {
          const bal = coin.current_balance || 0
          const isDust = bal > 0 && bal < 1
          const isZero = bal === 0
          const isNegative = bal < 0
          const isActive = bal >= 1
          const cardBg = isDust ? '#fafbfc' : isZero ? '#f8fafc' : '#fff'
          const cardBorder = isDust ? '#e2e8f0' : isZero ? '#e2e8f0' : '#f1f5f9'
          const nameColor = isDust || isZero ? '#94a3b8' : '#0f172a'

          return (
          <button
            key={coin.asset}
            onClick={() => onSelect(coin.asset)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: '20px 22px', borderRadius: 16,
              background: cardBg, border: `1px solid ${cardBorder}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              cursor: 'pointer', textAlign: 'left',
              fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.2s, transform 0.15s',
              opacity: isDust || isZero ? 0.75 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#a5b4fc'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.12)'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = cardBorder
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.03)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.opacity = isDust || isZero ? '0.75' : '1'
            }}
          >
            {/* Top row: coin name + balance */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: nameColor, letterSpacing: '-0.01em' }}>
                {coin.asset}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#6366f1',
                background: '#eef2ff', padding: '3px 10px', borderRadius: 20,
              }}>
                {coin.total_events} event{coin.total_events !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Balance row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                color: isActive ? '#059669' : isDust ? '#94a3b8' : isNegative ? '#dc2626' : '#64748b',
              }}>
                {fmtNum(bal)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{coin.asset}</span>
              {isZero && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#64748b', background: '#f1f5f9',
                  padding: '2px 6px', borderRadius: 4, marginLeft: 'auto', textTransform: 'uppercase',
                }}>Fully Sold</span>
              )}
              {isDust && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#f59e0b', background: '#fffbeb',
                  padding: '2px 6px', borderRadius: 4, marginLeft: 'auto', textTransform: 'uppercase',
                }}>Dust</span>
              )}
              {isNegative && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fef2f2',
                  padding: '2px 6px', borderRadius: 4, marginLeft: 'auto', textTransform: 'uppercase',
                }}>Missing Data</span>
              )}
            </div>

            {/* Type breakdown */}
            {coin.types && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(coin.types).map(([type, count]) => {
                  const c = getColor(type)
                  return (
                    <span key={type} style={{
                      fontSize: 10, fontWeight: 600, color: c.text,
                      background: c.bg, padding: '2px 8px', borderRadius: 6,
                    }}>
                      {c.label} {count}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Badges row */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
              {coin.has_deposits && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#1e40af',
                  background: '#dbeafe', padding: '3px 8px', borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <ArrowDownCircle size={10} /> Deposits
                </span>
              )}
              {coin.has_withdrawals && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#92400e',
                  background: '#fef3c7', padding: '3px 8px', borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <ArrowUpCircle size={10} /> Withdrawals
                </span>
              )}
              {coin.has_round_trip && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#5b21b6',
                  background: '#ede9fe', padding: '3px 8px', borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Link2 size={10} /> Round Trip
                </span>
              )}
            </div>
          </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────
   Event Detail Panel (slide-in from right)
   ──────────────────────────────────────────────── */
function EventDetailPanel({ event, coinAsset, onClose }) {
  const c = getColor(event.type)

  // Extract raw operation from external_id: txnhist_{time}_{operation}_{coin}_{change}
  const rawOperation = (() => {
    const eid = event.source_endpoint === 'excel_transaction_history'
      ? (event.id || '')  // external_id not on event, use source_endpoint as signal
      : ''
    // Try to parse from the event type label as fallback
    return null
  })()

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  // Close on Escape
  const handleKeyDown = (e) => { if (e.key === 'Escape') onClose() }

  const Row = ({ label, value, mono, copyable, small }) => {
    if (value == null || value === '' || value === '-') return null
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '10px 0', borderBottom: '1px solid #f1f5f9', gap: 16,
      }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', flexShrink: 0, paddingTop: 1 }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: small ? 11 : 13, fontWeight: 600, color: '#1e293b', textAlign: 'right',
            fontFamily: mono ? "'Fira Mono', 'Courier New', monospace" : 'inherit',
            wordBreak: 'break-all', fontVariantNumeric: mono ? 'normal' : 'tabular-nums',
          }}>
            {value}
          </span>
          {copyable && (
            <button
              onClick={() => copyToClipboard(value)}
              title="Copy"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', padding: 2, flexShrink: 0,
                display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#6366f1'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(15, 23, 42, 0.3)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Panel */}
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 420, background: '#fff',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideInRight 0.2s ease',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fafbfc',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: c.dot, boxShadow: `0 0 8px ${c.dot}50`,
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              {c.label}
              <span style={{ fontWeight: 500, color: '#64748b', marginLeft: 8, fontSize: 13 }}>
                {coinAsset}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {fmtDate(event.datetime)} · {fmtTime(event.datetime)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: 8,
              width: 32, height: 32, cursor: 'pointer', color: '#64748b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Amount hero */}
        <div style={{
          padding: '20px 24px', background: c.bg, borderBottom: '1px solid #f1f5f9',
          textAlign: 'center',
        }}>
          <span style={{
            fontSize: 36, fontWeight: 800, color: c.text || '#0f172a',
            letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtNum(event.amount)}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginLeft: 8 }}>
            {coinAsset}
          </span>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 24px' }}>
          <Row label="Balance after" value={`${fmtNum(event.balance_after)} ${coinAsset}`} />
          <Row label="Price" value={event.price > 0 ? `${fmtNum(event.price)} ${event.counter_asset || ''}` : null} />
          <Row label="Value" value={
            event.quote_amount > 0
              ? `${event.counter_asset === 'INR' ? '₹' : ''}${fmtNum(event.quote_amount)} ${event.counter_asset || ''}`
              : null
          } />
          <Row label="Fee" value={event.fee > 0 ? `${fmtNum(event.fee)} ${event.fee_asset || ''}` : null} />
          <Row label="From" value={event.source_wallet?.replace(/_/g, ' ')} />
          <Row label="To" value={event.dest_wallet?.replace(/_/g, ' ')} />
          <Row label="Network" value={event.network} />
          <Row label="Address" value={event.address} mono copyable small />
          <Row label="TxHash" value={event.txhash} mono copyable small />
          <Row
            label="Source"
            value={event.source_endpoint?.replace('excel_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          />

          {/* Explorer link */}
          {event.explorer_url && event.txhash && (
            <div style={{ marginTop: 16 }}>
              <a
                href={event.explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 16px', borderRadius: 10, textDecoration: 'none',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                }}
              >
                <ExternalLink size={14} />
                View on Block Explorer
              </a>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  )
}

/* ────────────────────────────────────────────────
   Timeline Event Node
   ──────────────────────────────────────────────── */
function TimelineEvent({ event, isLast, onSelect }) {
  const c = getColor(event.type)
  const hasExplorer = event.explorer_url && event.txhash

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: isLast ? 'auto' : 80 }}>
      {/* Left: date/time */}
      <div style={{
        width: 120, flexShrink: 0, textAlign: 'right',
        paddingRight: 24, paddingTop: 2,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', lineHeight: 1.3 }}>
          {fmtDate(event.datetime)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginTop: 2 }}>
          {fmtTime(event.datetime)}
        </div>
      </div>

      {/* Center: dot + vertical line */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: 24, flexShrink: 0,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: c.dot, border: `3px solid ${c.bg}`,
          boxShadow: `0 0 0 2px ${c.dot}30, 0 2px 8px ${c.dot}25`,
          flexShrink: 0, position: 'relative', zIndex: 2,
        }} />
        {!isLast && (
          <div style={{
            width: 2, flex: 1, minHeight: 40,
            background: `linear-gradient(to bottom, ${c.dot}40, #e2e8f020)`,
          }} />
        )}
      </div>

      {/* Right: event card */}
      <div style={{
        flex: 1, paddingLeft: 16, paddingBottom: isLast ? 0 : 24,
      }}>
        <div
          onClick={() => onSelect && onSelect(event)}
          style={{
            padding: '16px 20px', borderRadius: 14,
            background: '#fff', border: '1px solid #f1f5f9',
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            transition: 'box-shadow 0.15s, border-color 0.15s',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.1)'
            e.currentTarget.style.borderColor = '#c7d2fe'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.03)'
            e.currentTarget.style.borderColor = '#f1f5f9'
          }}
        >
          {/* Type badge + amount */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: c.text,
              background: c.bg, padding: '3px 10px', borderRadius: 6,
            }}>
              {c.label}
            </span>
            <span style={{
              fontSize: 18, fontWeight: 700, color: '#0f172a',
              letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
            }}>
              {fmtNum(event.amount)}
            </span>
          </div>

          {/* Detail rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {event.price != null && event.price > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>Price</span>
                <span style={{ color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  ${fmtNum(event.price)}
                  {event.counter_asset ? ` (${event.counter_asset})` : ''}
                </span>
              </div>
            )}
            {event.quote_amount != null && event.quote_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>Value</span>
                <span style={{ color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {event.counter_asset === 'INR' ? '₹' : '$'}{fmtNum(event.quote_amount)}
                </span>
              </div>
            )}
            {event.balance_after != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>Balance after</span>
                <span style={{ color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(event.balance_after)}
                </span>
              </div>
            )}
            {event.location && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>Location</span>
                <span style={{ color: '#475569', fontWeight: 500 }}>
                  {event.location.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {event.network && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>Network</span>
                <span style={{ color: '#475569', fontWeight: 500 }}>{event.network}</span>
              </div>
            )}
          </div>

          {/* TxHash link */}
          {hasExplorer && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              <a
                href={event.explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 600, color: '#6366f1',
                  textDecoration: 'none', transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#4f46e5'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6366f1'}
              >
                <ExternalLink size={12} />
                {truncHash(event.txhash)}
              </a>
            </div>
          )}

          {/* Matched transfer badge */}
          {event.matched_transfer && (
            <div style={{
              marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 600, color: '#0369a1',
              background: '#e0f2fe', padding: '3px 10px', borderRadius: 6,
            }}>
              <Link2 size={10} /> Matched on-chain
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────
   Transfer Connector
   ──────────────────────────────────────────────── */
function TransferConnector({ transfer }) {
  const w = transfer.withdrawal
  const d = transfer.deposit
  return (
    <div style={{
      margin: '8px 0 8px 132px',
      padding: '14px 20px', borderRadius: 12,
      background: 'linear-gradient(135deg, #ede9fe 0%, #e0f2fe 100%)',
      border: '1px dashed #a78bfa',
      display: 'flex', alignItems: 'center', gap: 16,
      maxWidth: 520,
    }}>
      <Link2 size={16} style={{ color: '#7c3aed', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          On-chain Transfer
        </div>
        <div style={{ fontSize: 12, color: '#475569' }}>
          <span style={{ fontWeight: 600 }}>{fmtNum(w?.amount)}</span> withdrawn
          {' '}&rarr;{' '}
          <span style={{ fontWeight: 600 }}>{fmtNum(d?.amount)}</span> deposited
          {transfer.confidence != null && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#6366f1' }}>
              {transfer.confidence}% confidence
            </span>
          )}
        </div>
        {transfer.on_chain_gap_days != null && transfer.on_chain_gap_days > 0 && (
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 3 }}>
            {transfer.on_chain_gap_days} day{transfer.on_chain_gap_days !== 1 ? 's' : ''} gap on-chain
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          {w?.explorer_url && (
            <a href={w.explorer_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ExternalLink size={10} /> Withdrawal tx
            </a>
          )}
          {d?.explorer_url && (
            <a href={d.explorer_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ExternalLink size={10} /> Deposit tx
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────
   Coin Detail Mode (Timeline)
   ──────────────────────────────────────────────── */
function CoinDetailView({ asset, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    async function fetch() {
      try {
        const res = await getCoinFlow(asset)
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) setError('Failed to load coin flow data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [asset])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>Loading {asset} flow...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <Inbox size={48} style={{ color: '#cbd5e1' }} strokeWidth={1.5} />
        <span style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>{error || 'No data'}</span>
        <button onClick={onBack} style={{
          padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          color: '#6366f1', background: '#eef2ff',
        }}>Go back</button>
      </div>
    )
  }

  // Build a lookup of transfers keyed by withdrawal txhash for inline rendering
  const transferMap = {}
  if (data.transfers) {
    data.transfers.forEach((t) => {
      if (t.withdrawal?.txhash) transferMap[t.withdrawal.txhash] = t
    })
  }

  const events = data.events || []

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', color: '#475569', marginBottom: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
      >
        <ArrowLeft size={16} />
        All Coins
      </button>

      {/* Header card */}
      <div style={{
        padding: '24px 28px', borderRadius: 16, marginBottom: 28,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
        boxShadow: '0 8px 32px rgba(99,102,241,0.25)',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
              {data.asset}
            </h3>
            {data.aliases && data.aliases.length > 1 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500, marginTop: 4 }}>
                Also known as: {data.aliases.filter((a) => a !== data.asset).join(', ')}
              </div>
            )}
          </div>
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#a5b4fc',
            background: 'rgba(255,255,255,0.1)', padding: '5px 14px', borderRadius: 20,
          }}>
            {data.total_events} event{data.total_events !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Bought', value: fmtNum(data.total_bought), color: '#34d399' },
            { label: 'Total Sold', value: fmtNum(data.total_sold), color: '#fb7185' },
            { label: 'Current Balance', value: fmtNum(data.current_balance), color: '#a5b4fc' },
          ].map((stat) => (
            <div key={stat.label}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ paddingLeft: 8, paddingBottom: 40 }}>
        {events.map((event, idx) => {
          const isLast = idx === events.length - 1
          const transfer = event.txhash ? transferMap[event.txhash] : null
          return (
            <div key={idx}>
              <TimelineEvent event={event} isLast={isLast && !transfer} onSelect={setSelectedEvent} />
              {transfer && (
                <TransferConnector transfer={transfer} />
              )}
            </div>
          )
        })}
        {events.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 14 }}>
            No events found
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          coinAsset={asset}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────
   Main CoinFlow Page
   ──────────────────────────────────────────────── */
export default function CoinFlow({ exchange, exchangeLabel }) {
  const [coins, setCoins] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCoin, setSelectedCoin] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function fetchCoins() {
      try {
        const res = await getCoinList()
        if (!cancelled && res && res.coins) {
          setCoins(res.coins)
        }
      } catch {
        // no data
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchCoins()
    return () => { cancelled = true }
  }, [exchange])

  return (
    <div style={{ height: '100%', background: '#f8fafc', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '32px 40px 0' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
          Coin Flows
        </h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
          <span style={{ color: '#6366f1', fontWeight: 600 }}>{exchangeLabel}</span>
          {' · '}
          {selectedCoin
            ? <span style={{ color: '#475569', fontWeight: 600 }}>{selectedCoin}</span>
            : <span>{coins.length} coin{coins.length !== 1 ? 's' : ''} tracked</span>
          }
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 40px 40px' }}>
        {selectedCoin ? (
          <CoinDetailView
            asset={selectedCoin}
            onBack={() => setSelectedCoin(null)}
          />
        ) : (
          <CoinListView
            coins={coins}
            loading={loading}
            onSelect={setSelectedCoin}
          />
        )}
      </div>

      {/* Keyframes for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
