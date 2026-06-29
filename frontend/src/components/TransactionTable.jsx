import { ExternalLink, Inbox, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

const typeBadge = {
  BUY:               { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  P2P_BUY:           { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  SELL:              { bg: '#fff1f2', color: '#be123c', border: '#fecdd3' },
  P2P_SELL:          { bg: '#fff1f2', color: '#be123c', border: '#fecdd3' },
  DEPOSIT:           { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  WITHDRAWAL:        { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  CONVERT:           { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  INTERNAL_TRANSFER: { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
  DUST:              { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
}

const assetGrad = {
  BTC: 'linear-gradient(135deg, #f59e0b, #d97706)',
  ETH: 'linear-gradient(135deg, #6366f1, #4f46e5)',
  SOL: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  USDT: 'linear-gradient(135deg, #10b981, #059669)',
  BNB: 'linear-gradient(135deg, #eab308, #ca8a04)',
  SHIB: 'linear-gradient(135deg, #f97316, #ea580c)',
}

const fallbackBadge = { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }

function fmtDate(d) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
function fmtTime(d) { return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) }
function fmtNum(n) { const v = parseFloat(n); return isNaN(v) ? n : v.toLocaleString('en-IN', { maximumFractionDigits: 8 }) }
function truncHash(h) { return h ? `${h.slice(0, 6)}...${h.slice(-4)}` : null }

const headers = ['Date', 'Type', 'Asset', 'Amount', 'Price (USD)', 'Value (INR)', 'Fee', 'Source', 'Dest Wallet', 'TxHash']

const cellBase = { padding: '16px 20px', verticalAlign: 'middle' }
const monoStyle = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }

function SortIcon({ column, sortColumn, sortDirection }) {
  if (sortColumn !== column) return <ChevronsUpDown size={12} style={{ opacity: 0.3, marginLeft: 4 }} />
  if (sortDirection === 'asc') return <ChevronUp size={12} style={{ color: '#6366f1', marginLeft: 4 }} />
  return <ChevronDown size={12} style={{ color: '#6366f1', marginLeft: 4 }} />
}

export default function TransactionTable({ transactions, page, totalPages, onPageChange, sortColumn, sortDirection, onSort }) {
  if (!transactions || transactions.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '80px 20px',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', marginBottom: 16,
        }}>
          <Inbox size={28} style={{ color: '#cbd5e1' }} strokeWidth={1.5} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', margin: 0 }}>No transactions found</p>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6, maxWidth: 280, textAlign: 'center' }}>
          Try adjusting your filters or sync data for this financial year
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {headers.map((h, i) => (
                <th key={h} onClick={() => onSort && onSort(h)} style={{
                  textAlign: 'left', fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: sortColumn === h ? '#6366f1' : '#94a3b8',
                  padding: '14px 20px',
                  paddingLeft: i === 0 ? 28 : 20,
                  paddingRight: i === headers.length - 1 ? 28 : 20,
                  borderBottom: '1px solid #f1f5f9',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'color 0.15s',
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {h}
                    <SortIcon column={h} sortColumn={sortColumn} sortDirection={sortDirection} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, idx) => {
              const badge = typeBadge[tx.type] || fallbackBadge
              const grad = assetGrad[tx.asset] || 'linear-gradient(135deg, #94a3b8, #64748b)'
              const hash = truncHash(tx.txHash)
              return (
                <tr
                  key={tx.id}
                  className="row-stagger"
                  style={{
                    animationDelay: `${idx * 20}ms`,
                    borderBottom: '1px solid #f8fafc',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#fafbff'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Date */}
                  <td style={{ ...cellBase, paddingLeft: 28 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{fmtDate(tx.date)}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, ...monoStyle }}>{fmtTime(tx.date)}</div>
                  </td>

                  {/* Type */}
                  <td style={cellBase}>
                    <span style={{
                      display: 'inline-block', padding: '5px 10px', borderRadius: 8,
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                      background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                    }}>
                      {tx.type.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Asset */}
                  <td style={cellBase}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: grad, boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{tx.asset.slice(0, 2)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{tx.asset}</span>
                    </div>
                  </td>

                  {/* Amount */}
                  <td style={cellBase}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', ...monoStyle }}>
                      {fmtNum(tx.amount)}
                    </span>
                  </td>

                  {/* Price */}
                  <td style={cellBase}>
                    <span style={{ fontSize: 13, color: '#64748b', ...monoStyle }}>${fmtNum(tx.price)}</span>
                  </td>

                  {/* Value */}
                  <td style={cellBase}>
                    <span style={{ fontSize: 13, color: '#64748b', ...monoStyle }}>{fmtNum(tx.value)}</span>
                  </td>

                  {/* Fee */}
                  <td style={cellBase}>
                    <span style={{ fontSize: 13, color: '#94a3b8', ...monoStyle }}>{fmtNum(tx.fee)}</span>
                  </td>

                  {/* Source */}
                  <td style={cellBase}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{tx.source}</span>
                  </td>

                  {/* Dest Wallet */}
                  <td style={cellBase}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>{tx.destWallet || '—'}</span>
                  </td>

                  {/* TxHash */}
                  <td style={{ ...cellBase, paddingRight: 28 }}>
                    {hash ? (
                      <a
                        href={`https://etherscan.io/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, color: '#6366f1', textDecoration: 'none',
                          transition: 'color 0.12s', ...monoStyle,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#4f46e5'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#6366f1'}
                      >
                        {hash}
                        <ExternalLink size={12} style={{ opacity: 0.5 }} />
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: '#d1d5db', ...monoStyle }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px', borderTop: '1px solid #f1f5f9', background: '#fafbfc',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>
            Page <span style={{ color: '#475569', fontWeight: 600 }}>{page}</span> of{' '}
            <span style={{ color: '#475569', fontWeight: 600 }}>{totalPages}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PageBtn onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
              <ChevronLeft size={16} />
            </PageBtn>
            {buildPageNumbers(page, totalPages).map((num) => (
              <PageBtn key={num} active={num === page} onClick={() => onPageChange(num)}>
                {num}
              </PageBtn>
            ))}
            <PageBtn onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
              <ChevronRight size={16} />
            </PageBtn>
          </div>
        </div>
      )}
    </div>
  )
}

function buildPageNumbers(current, total) {
  const pages = []
  const count = Math.min(total, 5)
  let start
  if (total <= 5) start = 1
  else if (current <= 3) start = 1
  else if (current >= total - 2) start = total - 4
  else start = current - 2
  for (let i = 0; i < count; i++) pages.push(start + i)
  return pages
}

function PageBtn({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        border: active ? '1px solid #6366f1' : '1px solid #e2e8f0',
        background: active ? '#6366f1' : '#fff',
        color: active ? '#fff' : '#64748b',
        boxShadow: active ? '0 2px 8px rgba(99,102,241,0.25)' : '0 1px 2px rgba(0,0,0,0.04)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  )
}
