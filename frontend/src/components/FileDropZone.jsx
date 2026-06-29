import { useRef } from 'react'
import { Upload, FileSpreadsheet, X } from 'lucide-react'

export default function FileDropZone({ files = [], onFilesChange, disabled }) {
  const fileRef = useRef()

  const addFiles = (newFiles) => {
    const valid = Array.from(newFiles).filter(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    )
    if (!valid.length) return
    const existing = new Set(files.map((f) => f.name))
    const deduped = valid.filter((f) => !existing.has(f.name))
    onFilesChange([...files, ...deduped])
  }

  const removeFile = (index) => {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    if (disabled) return
    addFiles(e.dataTransfer.files)
  }

  const handleSelect = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0)

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !disabled && fileRef.current?.click()}
        style={{
          border: files.length ? '2px dashed #a5b4fc' : '2px dashed #e2e8f0',
          borderRadius: 12,
          padding: files.length ? '14px 18px' : '28px 20px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: files.length ? '#eef2ff' : '#fafbfc',
          transition: 'all 0.2s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={handleSelect}
          style={{ display: 'none' }}
        />
        {files.length === 0 ? (
          <>
            <Upload size={24} style={{ color: '#94a3b8', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748b', margin: 0 }}>
              Drop .xlsx files here or click to browse
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
              Select multiple files at once — C2C, Deposit, Withdraw, Spot, Transaction History
            </p>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={18} style={{ color: '#6366f1', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>
              {files.length} file{files.length > 1 ? 's' : ''} selected
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              ({(totalSize / 1024).toFixed(1)} KB) — click to add more
            </span>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{
          marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {files.map((f, i) => (
            <div
              key={f.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8, background: '#f8fafc',
                border: '1px solid #f1f5f9',
              }}
            >
              <FileSpreadsheet size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 12, fontWeight: 500, color: '#334155',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {f.name}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                {(f.size / 1024).toFixed(1)} KB
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', padding: 2, display: 'flex',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
