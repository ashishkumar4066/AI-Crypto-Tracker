import { useState, useEffect, useMemo } from 'react'
import { Scale, Database, FileSpreadsheet, Search, X, ArrowUpDown } from 'lucide-react'
import YearFilter, { allYears } from '../components/YearFilter'
import { getTally } from '../api/client'

const TYPE_COLORS = {
  BUY: '#10b981', P2P_BUY: '#10b981', FIAT_BUY: '#10b981',
  SELL: '#f43f5e', P2P_SELL: '#f43f5e', FIAT_SELL: '#f43f5e',
  DEPOSIT: '#3b82f6', WITHDRAWAL: '#f59e0b',
  CONVERT: '#8b5cf6', DUST_CONVERSION: '#9ca3af',
  INTERNAL_TRANSFER: '#0ea5e9', REWARD: '#22d3ee',
  FEE: '#ef4444', STAKING: '#a78bfa', UNKNOWN: '#6b7280',
}

function SourceBadge({ isExcel }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em',
      background: isExcel ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)',
      color: isExcel ? '#f59e0b' : '#818cf8',
      border: `1px solid ${isExcel ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)'}`,
    }}>
      {isExcel ? <FileSpreadsheet size={10} /> : <Database size={10} />}
      {isExcel ? 'EXCEL' : 'API'}
    </span>
  )
}

function ComparisonBar({ apiCount, excelCount, label }) {
  const total = apiCount + excelCount
  if (total === 0) return null
  const apiPct = (apiCount / total) * 100
  const excelPct = (excelCount / total) * 100
  const diff = excelCount - apiCount

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
          <span style={{ color: '#818cf8', fontWeight: 600 }}>{apiCount} API</span>
          <span style={{ color: '#94a3b8' }}>vs</span>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{excelCount} Excel</span>
          {diff !== 0 && (
            <span style={{
              padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: diff > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
              color: diff > 0 ? '#d97706' : '#6366f1',
            }}>
              {diff > 0 ? `+${diff} in Excel` : `+${Math.abs(diff)} in API`}
            </span>
          )}
          {diff === 0 && (
            <span style={{
              padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: 'rgba(16,185,129,0.1)', color: '#059669',
            }}>
              Match
            </span>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
        background: '#f1f5f9',
      }}>
        {apiCount > 0 && (
          <div style={{
            width: `${apiPct}%`, background: 'linear-gradient(90deg, #818cf8, #6366f1)',
            borderRadius: excelCount === 0 ? 4 : '4px 0 0 4px',
            transition: 'width 0.5s ease',
          }} />
        )}
        {excelCount > 0 && (
          <div style={{
            width: `${excelPct}%`, background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
            borderRadius: apiCount === 0 ? 4 : '0 4px 4px 0',
            transition: 'width 0.5s ease',
          }} />
        )}
      </div>
    </div>
  )
}

export default function Tally({ exchange, exchangeLabel }) {
  const [selectedYears, setSelectedYears] = useState(() => allYears)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterAsset, setFilterAsset] = useState('')
  const [coinSearch, setCoinSearch] = useState('')
  const [sortBy, setSortBy] = useState('total')

  const selectedFY = selectedYears[0]

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      try {
        const result = await getTally({
          fy: selectedFY,
          asset: filterAsset || undefined,
        })
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [selectedFY, filterAsset])

  const coinRows = useMemo(() => {
    if (!data?.by_asset) return []
    return Object.entries(data.by_asset)
      .map(([coin, counts]) => ({
        coin,
        api: counts.api,
        excel: counts.excel,
        total: counts.api + counts.excel,
        diff: counts.excel - counts.api,
      }))
      .filter(r => {
        if (!coinSearch) return true
        return r.coin.toLowerCase().includes(coinSearch.toLowerCase())
      })
      .sort((a, b) => {
        if (sortBy === 'diff') return Math.abs(b.diff) - Math.abs(a.diff)
        if (sortBy === 'coin') return a.coin.localeCompare(b.coin)
        return b.total - a.total
      })
  }, [data, coinSearch, sortBy])

  const typeRows = useMemo(() => {
    if (!data?.by_type) return []
    return Object.entries(data.by_type)
      .map(([type, counts]) => ({
        type,
        api: counts.api,
        excel: counts.excel,
        diff: counts.excel - counts.api,
      }))
      .sort((a, b) => (b.api + b.excel) - (a.api + a.excel))
  }, [data])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontSize: 14 }}>
          <div style={{
            width: 20, height: 20, border: '2px solid #818cf8', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          Loading tally...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
        No data available. Import Excel files or sync via API first.
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
          }}>
            <Scale size={22} color="#fff" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Data Tally
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              <span style={{ color: '#6366f1', fontWeight: 600 }}>{exchangeLabel}</span>
              {' · '}FY {selectedFY} — Comparing API-synced vs Excel-imported records
            </p>
          </div>
          <YearFilter selectedYears={selectedYears} onChange={setSelectedYears} />
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
          <div style={{
            padding: '22px 24px', borderRadius: 16, background: '#fff',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Database size={16} color="#818cf8" />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                API Synced
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#6366f1', letterSpacing: '-0.02em' }}>
              {data.totals.api.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>records from Binance API</div>
          </div>

          <div style={{
            padding: '22px 24px', borderRadius: 16, background: '#fff',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <FileSpreadsheet size={16} color="#f59e0b" />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                Excel Imported
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.02em' }}>
              {data.totals.excel.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>records from Data Download Center</div>
          </div>

          <div style={{
            padding: '22px 24px', borderRadius: 16, background: '#fff',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Scale size={16} color={data.totals.api === data.totals.excel ? '#10b981' : '#f43f5e'} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                Difference
              </span>
            </div>
            <div style={{
              fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em',
              color: data.totals.api === data.totals.excel ? '#10b981' : '#f43f5e',
            }}>
              {data.totals.api === data.totals.excel ? '0' : Math.abs(data.totals.excel - data.totals.api).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              {data.totals.api === data.totals.excel
                ? 'Perfect match!'
                : data.totals.excel > data.totals.api
                  ? 'more records in Excel'
                  : 'more records in API'}
            </div>
          </div>
        </div>

        {/* By Transaction Type */}
        <div style={{
          padding: '24px', borderRadius: 16, background: '#fff',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>
            By Transaction Type
          </h3>
          {typeRows.map(({ type, api, excel, diff }) => (
            <ComparisonBar key={type} label={type.replace(/_/g, ' ')} apiCount={api} excelCount={excel} />
          ))}
          {typeRows.length === 0 && (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No data</p>
          )}
        </div>

        {/* By Coin — with filters */}
        <div style={{
          padding: '24px', borderRadius: 16, background: '#fff',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>
              By Coin
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search coin..."
                  value={coinSearch}
                  onChange={(e) => setCoinSearch(e.target.value)}
                  style={{
                    padding: '7px 10px 7px 30px', borderRadius: 8, fontSize: 12,
                    border: '1px solid #e2e8f0', outline: 'none', width: 160,
                    fontFamily: 'inherit', color: '#334155',
                  }}
                />
                {coinSearch && (
                  <button onClick={() => setCoinSearch('')} style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2,
                  }}>
                    <X size={12} />
                  </button>
                )}
              </div>
              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '7px 10px', borderRadius: 8, fontSize: 12,
                  border: '1px solid #e2e8f0', outline: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', color: '#334155', background: '#fff',
                }}
              >
                <option value="total">Sort: Volume</option>
                <option value="diff">Sort: Difference</option>
                <option value="coin">Sort: A-Z</option>
              </select>
              {/* Asset filter */}
              <select
                value={filterAsset}
                onChange={(e) => setFilterAsset(e.target.value)}
                style={{
                  padding: '7px 10px', borderRadius: 8, fontSize: 12,
                  border: '1px solid #e2e8f0', outline: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', color: '#334155', background: '#fff',
                }}
              >
                <option value="">All Coins</option>
                {(data.available_assets || []).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Coin table */}
          <div style={{ borderRadius: 10, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Coin</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700, color: '#818cf8', fontSize: 11 }}>API</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700, color: '#f59e0b', fontSize: 11 }}>EXCEL</th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700, color: '#64748b', fontSize: 11 }}>DIFF</th>
                  <th style={{ padding: '10px 16px', width: '35%' }}></th>
                </tr>
              </thead>
              <tbody>
                {coinRows.map(({ coin, api, excel, total, diff }) => (
                  <tr key={coin} style={{ borderTop: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#fafbfc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b' }}>{coin}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6366f1', fontWeight: 600 }}>{api}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#d97706', fontWeight: 600 }}>{excel}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      {diff === 0 ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>✓</span>
                      ) : (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 4,
                          background: diff > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
                          color: diff > 0 ? '#d97706' : '#6366f1',
                        }}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f1f5f9' }}>
                        {api > 0 && <div style={{ width: `${(api / total) * 100}%`, background: '#818cf8', transition: 'width 0.4s' }} />}
                        {excel > 0 && <div style={{ width: `${(excel / total) * 100}%`, background: '#fbbf24', transition: 'width 0.4s' }} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {coinRows.length === 0 && (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 24 }}>
                {coinSearch ? 'No coins match your search' : 'No coin data available'}
              </p>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, textAlign: 'right' }}>
            {coinRows.length} coins · Positive diff = more in Excel, Negative = more in API
          </div>
        </div>
      </div>
    </div>
  )
}
