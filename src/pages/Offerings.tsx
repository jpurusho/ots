import { useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useUploadManager } from '@/lib/upload-manager'
import { Link } from 'react-router-dom'
import {
  Upload, X, FileImage, FileText, CheckCircle, XCircle,
  ArrowRight, ImagePlus, Sparkles, CloudDownload, Loader2,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export function OfferingsPage() {
  const { appUser } = useAuth()
  const { state: uploadState, startUpload, clearResults } = useUploadManager()
  const [files, setFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
      /\.(jpe?g|png|heic|heif|pdf)$/i.test(f.name)
    )
    if (droppedFiles.length > 0) {
      setFiles(prev => [...prev, ...droppedFiles])
      clearResults()
    }
  }, [clearResults])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
      clearResults()
    }
  }

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index))

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const handleUpload = () => {
    if (files.length === 0 || uploadState.uploading) return
    startUpload(files, appUser?.email || null)
    setFiles([])
  }

  const results = uploadState.results
  const successCount = results.filter(r => r.success).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Offerings</h1>
        <p className="text-muted mt-1">Upload offering slip images for AI scanning</p>
      </div>

      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        } ${uploadState.uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.heic,.heif,.pdf"
          onChange={handleFileInput}
          className="hidden"
        />
        <ImagePlus className={`w-12 h-12 mx-auto mb-3 ${dragActive ? 'text-primary' : 'text-muted'}`} />
        <p className="font-medium">{dragActive ? 'Drop files here' : 'Drag and drop files here'}</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click() }}
          disabled={uploadState.uploading}
          className="mt-2 px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          Browse Files
        </button>
        <p className="text-xs text-muted mt-2">JPEG, PNG, HEIC, PDF</p>
      </div>

      {/* Upload progress */}
      {uploadState.uploading && (
        <div className="rounded-xl border border-primary/30 bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Uploading & Scanning...
            </span>
            <span className="text-xs text-muted">{uploadState.current} / {uploadState.total}</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(uploadState.current / uploadState.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted truncate">{uploadState.currentFile}</p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && !uploadState.uploading && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-card border-b border-border">
            <h3 className="font-medium text-sm">Selected Files ({files.length})</h3>
          </div>
          <div className="divide-y divide-border">
            {files.map((file, index) => (
              <div key={index} className="px-4 py-3 flex items-center gap-3">
                {file.type === 'application/pdf' ? (
                  <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                ) : (
                  <FileImage className="w-5 h-5 text-blue-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted">{formatSize(file.size)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(index) }}
                  className="text-muted hover:text-destructive cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-card border-t border-border flex justify-end gap-2">
            <button onClick={() => setFiles([])}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 transition-colors cursor-pointer">
              Clear All
            </button>
            <button onClick={handleUpload}
              className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload {files.length} File{files.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && !uploadState.uploading && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-card border-b border-border flex items-center justify-between">
            <h3 className="font-medium text-sm">
              Upload Results — {successCount} of {results.length} successful
            </h3>
            <button onClick={clearResults} className="text-xs text-muted hover:text-foreground cursor-pointer">
              Clear
            </button>
          </div>
          <div className="divide-y divide-border">
            {results.map((result, index) => (
              <div key={index} className={`px-4 py-3 ${result.success ? 'bg-success/5' : 'bg-destructive/5'}`}>
                <div className="flex items-center gap-3">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{result.filename}</p>
                    {result.error && <p className="text-xs text-destructive mt-0.5">{result.error}</p>}
                    {result.success && result.scanned && (
                      <p className="text-xs text-success mt-0.5">Scanned — ${result.scan_total?.toFixed(2)} total</p>
                    )}
                    {result.success && !result.scanned && (
                      <p className="text-xs text-warning mt-0.5">Uploaded — scan pending</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {successCount > 0 && (
            <div className="px-4 py-3 bg-card border-t border-border">
              <Link to="/review"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">
                Go to Review <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Import from Google Drive */}
      <DriveImportSection />

      {/* Empty state */}
      {files.length === 0 && results.length === 0 && !uploadState.uploading && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <h3 className="font-medium mb-2">How it works</h3>
          <ol className="space-y-1.5 text-sm text-muted">
            <li>1. Drop or select offering slip images, or import from Google Drive</li>
            <li>2. Images are automatically scanned with AI</li>
            <li>3. Go to <strong>Review</strong> to approve the scanned offerings</li>
          </ol>
        </div>
      )}
    </div>
  )
}

function DriveImportSection() {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    imported: number; skipped: number; errors: number; total: number;
    results: Array<{ name: string; status: string; reason?: string }>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setImporting(true)
    setResult(null)
    setError(null)
    try {
      const resp = await fetch(`${BACKEND_URL}/api/drive/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_scan: true }),
      })
      const data = await resp.json()
      if (data.detail) throw new Error(data.detail)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudDownload className="w-4 h-4 text-muted" />
          <div>
            <p className="text-sm font-medium">Import from Google Drive</p>
            <p className="text-[10px] text-muted">Pull new images from shared Drive folder</p>
          </div>
        </div>
        <button onClick={handleImport} disabled={importing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
          {importing ? 'Importing...' : 'Import'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 border-t border-border bg-destructive/5 text-destructive text-xs">
          {error}
        </div>
      )}

      {result && (
        <div className="px-4 py-3 border-t border-border">
          <div className="flex gap-4 text-xs mb-2">
            <span className="text-success">Imported: <strong>{result.imported}</strong></span>
            <span className="text-muted">Skipped: <strong>{result.skipped}</strong></span>
            {result.errors > 0 && <span className="text-destructive">Errors: <strong>{result.errors}</strong></span>}
            <span className="text-muted">Total: {result.total}</span>
          </div>
          {result.results.length > 0 && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {result.results.map((r, i) => (
                <div key={i} className={`text-[10px] flex items-center gap-1 ${
                  r.status === 'imported' ? 'text-success' : r.status === 'error' ? 'text-destructive' : 'text-muted'
                }`}>
                  {r.status === 'imported' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {r.name} {r.reason && `— ${r.reason}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
