import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logActivity } from '@/lib/activity'
import {
  Upload, X, FileImage, FileText, CheckCircle, XCircle,
  ArrowRight, ImagePlus, Sparkles,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

interface UploadResult {
  filename: string
  success: boolean
  offering_id?: number
  scanned?: boolean
  scan_total?: number
  error?: string
}

export function OfferingsPage() {
  const { appUser } = useAuth()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [results, setResults] = useState<UploadResult[]>([])
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
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
      setResults([])
    }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
      setResults([])
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    // Refresh session to ensure valid JWT (prevents RLS errors after token expiry)
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
      console.error('[Upload] Session refresh failed:', refreshError)
    }

    setUploading(true)
    setResults([])
    setUploadCurrent(0)

    const allResults: UploadResult[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadCurrent(i + 1)

      try {
        // Generate unique filename with timestamp
        const timestamp = Date.now()
        const storagePath = `${new Date().getFullYear()}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

        // Upload to Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('offering-images')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          })

        if (storageError) throw storageError

        // Create offering record
        const { data: offering, error: dbError } = await supabase
          .from('offerings')
          .insert({
            filename: file.name,
            file_hash: `${timestamp}`,
            image_path: storagePath,
            status: 'uploaded',
            source_type: 'scanned',
            created_by_email: appUser?.email || null,
          })
          .select('id')
          .single()

        if (dbError) throw dbError

        // Auto-scan via backend
        let scanned = false
        let scanTotal = 0
        try {
          const scanResp = await fetch(`${BACKEND_URL}/api/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offering_id: offering.id }),
          })
          const scanData = await scanResp.json()
          scanned = scanData.success === true
          scanTotal = scanData.total || 0
        } catch {
          // Scan failed but upload succeeded — user can rescan from Review
        }

        logActivity(appUser?.email || null, 'upload',
          `Uploaded ${file.name}${scanned ? ` — scanned $${scanTotal.toFixed(2)}` : ''}`,
          'offering', offering.id)

        allResults.push({
          filename: file.name,
          success: true,
          offering_id: offering.id,
          scanned,
          scan_total: scanTotal,
        })
      } catch (err) {
        allResults.push({
          filename: file.name,
          success: false,
          error: err instanceof Error ? err.message : 'Upload failed',
        })
      }

      setResults([...allResults])
    }

    // Invalidate queries so dashboard/review picks up new offerings
    queryClient.invalidateQueries({ queryKey: ['offerings'] })
    setUploading(false)
    setFiles([])
  }

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
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
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
          disabled={uploading}
          className="mt-2 px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          Browse Files
        </button>
        <p className="text-xs text-muted mt-2">JPEG, PNG, HEIC, PDF</p>
      </div>

      {/* Upload progress */}
      {uploading && files.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Uploading & Scanning...
            </span>
            <span className="text-xs text-muted">{uploadCurrent} / {files.length}</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(uploadCurrent / files.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && !uploading && (
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
            <button
              onClick={() => setFiles([])}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 transition-colors cursor-pointer"
            >
              Clear All
            </button>
            <button
              onClick={handleUpload}
              className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Upload {files.length} File{files.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-card border-b border-border">
            <h3 className="font-medium text-sm">
              Upload Results — {successCount} of {results.length} successful
            </h3>
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
                    {result.error && (
                      <p className="text-xs text-destructive mt-0.5">{result.error}</p>
                    )}
                    {result.success && result.scanned && (
                      <p className="text-xs text-success mt-0.5">
                        Scanned — ${result.scan_total?.toFixed(2)} total
                      </p>
                    )}
                    {result.success && !result.scanned && (
                      <p className="text-xs text-warning mt-0.5">
                        Uploaded — scan pending (try from Review)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {successCount > 0 && (
            <div className="px-4 py-3 bg-card border-t border-border">
              <a
                href="/review"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                Go to Review <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && results.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <h3 className="font-medium mb-2">How it works</h3>
          <ol className="space-y-1.5 text-sm text-muted">
            <li>1. Drop or select offering slip images (JPEG, PNG, HEIC, PDF)</li>
            <li>2. Click <strong>Upload</strong> to save images to the system</li>
            <li>3. Images are scanned with AI to extract dates and amounts</li>
            <li>4. Go to <strong>Review</strong> to approve the scanned offerings</li>
          </ol>
        </div>
      )}
    </div>
  )
}
