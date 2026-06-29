import { useState, useCallback } from 'react'
import { Upload, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import FileDropZone from './FileDropZone'
import { importExcel } from '../api/client'

export default function ImportSection({ onImportComplete }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)

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

  const actionDisabled = loading || !files.length
  const actionLabel = loading
    ? `Importing ${files.length} file${files.length > 1 ? 's' : ''}...`
    : (files.length > 1 ? `Upload ${files.length} Files` : 'Upload Excel')

  return (
    <div style={{
      padding: '24px 28px',
      borderRadius: 16,
      background: '#fff',
      border: '1px solid #f1f5f9',
      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Upload size={16} style={{ color: '#6366f1' }} strokeWidth={2} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Upload Excel</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>— Binance Data Download Center exports</span>
        </div>

        <button
          onClick={handleUpload}
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
            transition: 'opacity 0.2s',
            marginLeft: 'auto',
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

      <FileDropZone
        files={files}
        onFilesChange={(f) => { setFiles(f); setStatus(null) }}
        disabled={loading}
      />

      {status && (
        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          display: 'flex', alignItems: 'flex-start', gap: 10,
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
