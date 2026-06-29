import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, X, ArrowDownCircle, ArrowUpCircle, ArrowRightLeft, IndianRupee, Percent } from 'lucide-react'
import TransactionTable from '../components/TransactionTable'
import ImportSection from '../components/ImportSection'
import YearFilter, { allYears } from '../components/YearFilter'
import { getTransactions } from '../api/client'

const ITEMS_PER_PAGE = 10

const transactionTypes = [
  'BUY', 'P2P_BUY', 'SELL', 'P2P_SELL',
  'DEPOSIT', 'WITHDRAWAL', 'CONVERT', 'INTERNAL_TRANSFER', 'DUST',
]

const statCards = [
  { key: 'buys', label: 'Total Buys', sub: 'Buy & P2P Buy', icon: ArrowDownCircle, iconBg: '#ecfdf5', iconColor: '#10b981' },
  { key: 'sells', label: 'Total Sells', sub: 'Sell & P2P Sell', icon: ArrowUpCircle, iconBg: '#fff1f2', iconColor: '#f43f5e' },
  { key: 'p2pInvested', label: 'P2P Invested', sub: 'INR spent via P2P', icon: IndianRupee, iconBg: '#fff7ed', iconColor: '#f59e0b' },
  { key: 'converts', label: 'Conversions', sub: 'Asset swaps', icon: ArrowRightLeft, iconBg: '#f5f3ff', iconColor: '#8b5cf6' },
  { key: 'totalFees', label: 'Total Fees', sub: 'All fees paid', icon: Percent, iconBg: '#fef2f2', iconColor: '#ef4444' },
]

export default function Transactions({ exchange, exchangeLabel }) {
  const [selectedYears, setSelectedYears] = useState(() => allYears)
  const [transactions, setTransactions] = useState([])
  const [filterAsset, setFilterAsset] = useState('')
  const [filterType, setFilterType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [dataSource, setDataSource] = useState('excel')

  const handleImportComplete = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleSourceChange = useCallback((src) => {
    setDataSource(src)
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setTransactions([])
    async function fetchData() {
      try {
        const results = await Promise.all(
          selectedYears.map((fy) => getTransactions({ fy, source: dataSource, limit: 5000 }).catch(() => null))
        )
        if (cancelled) return
        const allTxns = results
          .filter((r) => r && r.data && Array.isArray(r.data))
          .flatMap((r) => r.data)
          .map((tx) => ({
            id: tx.id, date: tx.datetime, type: tx.type, asset: tx.asset,
            amount: tx.amount, price: tx.price || 0, value: tx.quote_amount || 0,
            fee: tx.fee || 0, feeAsset: tx.fee_asset || '',
            counterAsset: tx.counter_asset || '',
            source: tx.source_wallet || tx.exchange || '',
            txHash: tx.txhash || '',
          }))
        setTransactions(allTxns)
      } catch { /* no data */ }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedYears, exchange, refreshTrigger, dataSource])

  const uniqueAssets = useMemo(() => [...new Set(transactions.map((tx) => tx.asset))].sort(), [transactions])

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterAsset && tx.asset !== filterAsset) return false
      if (filterType && tx.type !== filterType) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return tx.asset.toLowerCase().includes(q) || tx.type.toLowerCase().includes(q) ||
          tx.source.toLowerCase().includes(q) || (tx.txHash && tx.txHash.toLowerCase().includes(q))
      }
      return true
    })
  }, [transactions, filterAsset, filterType, searchQuery])

  const stats = useMemo(() => {
    const buys = filtered.filter((tx) => tx.type === 'BUY' || tx.type === 'P2P_BUY').length
    const sells = filtered.filter((tx) => tx.type === 'SELL' || tx.type === 'P2P_SELL').length
    const converts = filtered.filter((tx) => tx.type === 'CONVERT').length

    // P2P Invested — INR spent via P2P buys
    const p2pBuys = filtered.filter((tx) => tx.type === 'P2P_BUY')
    const p2pInr = p2pBuys
      .filter((tx) => tx.counterAsset === 'INR')
      .reduce((sum, tx) => sum + parseFloat(tx.value || 0), 0)
    const p2pUsdt = p2pBuys
      .filter((tx) => tx.counterAsset !== 'INR')
      .reduce((sum, tx) => sum + parseFloat(tx.value || 0), 0)
    const p2pLabel = p2pInr > 0
      ? '₹' + p2pInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })
        + (p2pUsdt > 0 ? ` + $${p2pUsdt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '')
      : (p2pUsdt > 0 ? '$' + p2pUsdt.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '₹0')

    // Total Fees — grouped by fee asset
    const feeMap = {}
    filtered.forEach((tx) => {
      const fee = parseFloat(tx.fee || 0)
      if (fee > 0) {
        const asset = tx.feeAsset || 'UNKNOWN'
        if (!feeMap[asset]) feeMap[asset] = { amount: 0, count: 0 }
        feeMap[asset].amount += fee
        feeMap[asset].count += 1
      }
    })
    const feeList = Object.entries(feeMap)
      .map(([asset, { amount, count }]) => ({ asset, amount, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return { buys, sells, converts, p2pInvested: p2pLabel, totalFees: feeList }
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginatedTxns = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  useEffect(() => { setPage(1) }, [filterAsset, filterType, searchQuery])

  const hasActiveFilters = filterAsset || filterType || searchQuery
  const activeFilterCount = [filterAsset, filterType, searchQuery].filter(Boolean).length
  const hasData = transactions.length > 0

  const selectStyle = {
    padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    fontFamily: 'inherit', color: '#475569', background: '#fff',
    border: '1px solid #e2e8f0', outline: 'none', cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  const yearLabel = selectedYears.length === 1 ? `FY ${selectedYears[0]}` : `${selectedYears.length} years`

  return (
    <div style={{ height: '100%', background: '#f8fafc', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ padding: '32px 40px 0' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
          Transactions
        </h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
          <span style={{ color: '#6366f1', fontWeight: 600 }}>{exchangeLabel}</span>
          {' · '}{yearLabel}
          {hasData && <> — <span style={{ color: '#475569', fontWeight: 600 }}>{filtered.length}</span> records</>}
        </p>
      </div>

      {/* Import Section (sticky) */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        padding: '20px 40px 0',
        background: 'linear-gradient(to bottom, #f8fafc 92%, transparent)',
      }}>
        <ImportSection
          onImportComplete={handleImportComplete}
          selectedFY={selectedYears[0]}
          exchange={exchange}
          onSourceChange={handleSourceChange}
          onYearChange={(fy) => setSelectedYears([fy])}
        />
      </div>

      {/* Stats (only when data exists) */}
      {hasData && (
        <div style={{ padding: '24px 40px 0', display: 'flex', gap: 20 }}>
          {statCards.map((card) => {
            const Icon = card.icon
            const val = stats[card.key]
            const isFeeCard = card.key === 'totalFees'
            return (
              <div key={card.key} style={{
                flex: 1, padding: '20px 24px', borderRadius: 16,
                background: '#fff', border: '1px solid #f1f5f9',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>
                    {card.label}
                  </span>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', background: card.iconBg,
                  }}>
                    <Icon size={18} style={{ color: card.iconColor }} strokeWidth={2} />
                  </div>
                </div>
                {isFeeCard && Array.isArray(val) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {val.length === 0 && (
                      <span style={{ fontSize: 14, color: '#94a3b8' }}>None</span>
                    )}
                    {val.map((f) => (
                      <div key={f.asset} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                          {f.amount < 0.01 ? f.amount.toFixed(6) : f.amount < 1 ? f.amount.toFixed(4) : f.amount.toFixed(2)}
                          {' '}
                          <span style={{ fontWeight: 600, color: '#64748b' }}>{f.asset}</span>
                        </span>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                          {f.count} txn{f.count > 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {val}
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginTop: 8 }}>{card.sub}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filters (only when data exists) */}
      {hasData && (
        <div style={{ padding: '24px 40px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <YearFilter selectedYears={selectedYears} onChange={setSelectedYears} />

          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 340 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10,
                fontSize: 13, fontWeight: 500, fontFamily: 'inherit', color: '#1e293b',
                background: '#fff', border: '1px solid #e2e8f0', outline: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#a5b4fc'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.08)' }}
              onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
            />
          </div>

          <select value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)} style={selectStyle}>
            <option value="">All Assets</option>
            {uniqueAssets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
            <option value="">All Types</option>
            {transactionTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => { setFilterAsset(''); setFilterType(''); setSearchQuery('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', color: '#4f46e5',
                background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#e0e7ff'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#eef2ff'}
            >
              <X size={14} />
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
      )}

      {/* When no data, show year filter standalone */}
      {!hasData && (
        <div style={{ padding: '24px 40px 0' }}>
          <YearFilter selectedYears={selectedYears} onChange={setSelectedYears} />
        </div>
      )}

      {/* Table */}
      <div style={{
        margin: '24px 40px 32px', borderRadius: 16, overflow: 'hidden',
        background: '#fff', border: '1px solid #f1f5f9',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
      }}>
        <TransactionTable
          transactions={paginatedTxns}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
