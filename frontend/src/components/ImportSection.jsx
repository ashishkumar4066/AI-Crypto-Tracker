import { useState, useEffect, useCallback } from 'react'
import { Upload, Database, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import FileDropZone from './FileDropZone'
import { importExcel, syncData, getSyncStatus } from '../api/client'
import { mockFinancialYears } from '../data/mockData'

const txnTypes = [
  { value: '', label: 'All Types' },
  { value: 'C2C', label: 'C2C' },
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'TRADE', label: 'Trade' },
  { value: 'CONVERT', label: 'Convert' },
  { value: 'DUST_CONVERSION', label: 'Dust Conversion' },
  { value: 'INTERNAL_TRANSFER', label: 'Internal Transfer' },
]

const selectStyle = {
  padding: '9px 32px 9px 12px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  color: '#475569',
  background: '#fff',
  border: '1px solid #e2e8f0',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
}

export default function ImportSection({ onImportComplete, selectedFY, exchange, onSourceChange, onYearChange }) {
  const [source, setSource] = useState('upload')
  const [txnType, setTxnType] = useState('')
  const [year, setYear] = useState(selectedFY)
  const [fetchAllYears, setFetchAllYears] = useState(false)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => { setYear(selectedFY) }, [selectedFY])

  const handleUpload = useCallback(async () => {
    if (!files.length) return
    setLoading(true)
    setStatus(null)
    try {
      const data = await importExcel(files)
      setStatus({
        type: 'success',
        message: `Imported ${data.files_processed} file${data.files_processed > 1 ? 's' : ''}`,
        details: data,
      })
      setFiles([])
      onImportComplete()
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Upload failed',
      })
    } finally {
      setLoading(false)
    }
  }, [files, onImportComplete])

  const handleFetch = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    const years = fetchAllYears
      ? mockFinancialYears.map((f) => f.fy)
      : [year]

    try {
      let totalInserted = 0
      for (const fy of years) {
        try {
          await syncData(fy)
          await new Promise((r) => setTimeout(r, 1500))
          try {
            const s = await getSyncStatus(fy)
            if (s && s.total_inserted) totalInserted += s.total_inserted
          } catch { /* status endpoint may not exist yet */ }
        } catch (err) {
          if (err.response?.status === 409) continue
          throw err
        }
      }
      setStatus({
        type: 'success',
        message: fetchAllYears
          ? `Fetched data for ${years.length} financial years`
          : `Fetched data for FY ${year}`,
        details: totalInserted > 0 ? { inserted: totalInserted } : null,
      })
      onImportComplete()
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.detail || err.message || 'Fetch failed',
      })
    } finally {
      setLoading(false)
    }
  }, [year, fetchAllYears, onImportComplete])

  const handleAction = source === 'upload' ? handleUpload : handleFetch

  const actionDisabled = loading || (source === 'upload' && !files.length)
  const actionLabel = loading
    ? (source === 'upload' ? `Importing ${files.length} file${files.length > 1 ? 's' : ''}...` : (fetchAllYears ? 'Fetching All...' : `Fetching FY ${year}...`))
    : (source === 'upload' ? (files.length > 1 ? `Upload ${files.length} Files` : 'Upload Excel') : (fetchAllYears ? 'Fetch All Years' : 'Fetch Data'))

  return (
    <div style={{
      padding: '24px 28px',
      borderRadius: 16,
      background: '#fff',
      border: '1px solid #f1f5f9',
      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
    }}>
      {/* Row 1: Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Source toggle */}
        <div style={{
          display: 'inline-flex', borderRadius: 10, background: '#f1f5f9', padding: 3,
        }}>
          {[
            { id: 'upload', label: 'Upload Excel', icon: Upload },
            { id: 'api', label: 'Fetch API', icon: Database },
          ].map((s) => {
            const active = source === s.id
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSource(s.id)
                  setStatus(null)
                  if (onSourceChange) onSourceChange(s.id === 'upload' ? 'excel' : 'api')
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? '#6366f1' : 'transparent',
                  color: active ? '#fff' : '#64748b',
                  boxShadow: active ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
                }}
              >
                <Icon size={14} strokeWidth={2} />
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Transaction type */}
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Type
          </label>
          <select
            value={txnType}
            onChange={(e) => setTxnType(e.target.value)}
            disabled={source === 'api'}
            style={{
              ...selectStyle,
              opacity: source === 'api' ? 0.4 : 1,
              cursor: source === 'api' ? 'not-allowed' : 'pointer',
            }}
          >
            {txnTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Year
          </label>
          <select
            value={year}
            onChange={(e) => { setYear(e.target.value); if (onYearChange) onYearChange(e.target.value) }}
            disabled={fetchAllYears}
            style={{
              ...selectStyle,
              opacity: fetchAllYears ? 0.4 : 1,
              cursor: fetchAllYears ? 'not-allowed' : 'pointer',
            }}
          >
            {mockFinancialYears.map((fy) => (
              <option key={fy.fy} value={fy.fy}>FY {fy.fy}</option>
            ))}
          </select>
        </div>

        {/* Fetch All Years */}
        {source === 'api' && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, fontWeight: 500, color: '#475569', cursor: 'pointer',
            alignSelf: 'flex-end', paddingBottom: 2,
          }}>
            <input
              type="checkbox"
              checked={fetchAllYears}
              onChange={(e) => setFetchAllYears(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
            />
            Fetch All Years
          </label>
        )}

        {/* Action button */}
        <button
          onClick={handleAction}
          disabled={actionDisabled}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 24px', borderRadius: 10, border: 'none',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            cursor: actionDisabled ? 'not-allowed' : 'pointer',
            opacity: actionDisabled ? 0.5 : 1,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
            transition: 'opacity 0.2s, box-shadow 0.2s',
            marginLeft: 'auto',
            alignSelf: 'flex-end',
          }}
        >
          {loading && (
            <span style={{ display: 'inline-flex', animation: 'spin 0.8s linear infinite' }}>
              <Loader2 size={14} strokeWidth={2.5} />
            </span>
          )}
          {actionLabel}
        </button>
      </div>

      {/* File drop zone (upload mode only) */}
      {source === 'upload' && (
        <div style={{ marginTop: 16 }}>
          <FileDropZone
            files={files}
            onFilesChange={(f) => { setFiles(f); setStatus(null) }}
            disabled={loading}
          />
        </div>
      )}

      {/* Status notification */}
      {status && (
        <div style={{
          marginTop: 14,
          padding: '12px 16px',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: status.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${status.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {status.type === 'success'
            ? <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
            : <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
          }
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: 13, fontWeight: 600, margin: 0,
              color: status.type === 'success' ? '#047857' : '#be123c',
            }}>
              {status.message}
            </p>
            {status.details && (
              <div style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0', lineHeight: 1.6 }}>
                {status.details.total_inserted != null && (
                  <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
                    Total: {status.details.total_parsed} parsed · {status.details.total_inserted} inserted · {status.details.total_skipped} skipped
                  </p>
                )}
                {status.details.results && status.details.results.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                    borderTop: i > 0 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: r.status === 'success' ? '#10b981' : '#ef4444',
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.file}
                    </span>
                    {r.status === 'success' ? (
                      <span style={{ flexShrink: 0, color: '#64748b' }}>
                        {r.type_detected} · {r.inserted} new
                      </span>
                    ) : (
                      <span style={{ flexShrink: 0, color: '#ef4444' }}>{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setStatus(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: status.type === 'success' ? '#6ee7b7' : '#fca5a5',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
