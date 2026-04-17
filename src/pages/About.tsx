import { useState, useEffect } from 'react'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import {
  Upload, Sparkles, ClipboardCheck, CheckCircle, FileText, Mail,
  ArrowRight, RefreshCw, Loader2, Download,
} from 'lucide-react'

const WORKFLOW_STEPS = [
  { icon: Upload, label: 'Upload', desc: 'Drag & drop offering slip images or import from Google Drive' },
  { icon: Sparkles, label: 'AI Scan', desc: 'Claude AI reads each slip and extracts denominations and amounts' },
  { icon: ClipboardCheck, label: 'Review', desc: 'Verify scanned data, edit line items, approve offerings' },
  { icon: CheckCircle, label: 'Approve', desc: 'Lock approved offerings — they appear in reports' },
  { icon: FileText, label: 'Report', desc: 'Monthly/yearly reports as PDF, CSV, or Google Drive' },
  { icon: Mail, label: 'Share', desc: 'Email weekly cards and reports to your team' },
]

export function AboutPage() {
  const [appVersion, setAppVersion] = useState('3.3.2')
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ status: string; version?: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadDone, setDownloadDone] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    getElectronAPI()?.app.getVersion().then(v => setAppVersion(v))
    const cleanup = getElectronAPI()?.update.onDownloadProgress((p) => setDownloadProgress(p.percent))
    return () => { cleanup?.() }
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    setUpdateInfo(null)
    try {
      const result = await getElectronAPI()?.update.check()
      if (result) setUpdateInfo(result)
    } catch {
      setUpdateInfo({ status: 'error' })
    } finally {
      setChecking(false)
    }
  }

  const handleDownload = async () => {
    if (!updateInfo?.version) return
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadDone(false)
    try {
      const zipUrl = `https://github.com/jpurusho/ots/releases/download/v${updateInfo.version}/OTS-${updateInfo.version}-arm64-mac.zip`
      await getElectronAPI()?.update.download(zipUrl)
      setDownloadDone(true)
    } catch { /* */ }
    finally { setDownloading(false) }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <img src="/icon.png" alt="OTS" className="w-16 h-16 rounded-2xl" onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none'
        }} />
        <div>
          <h1 className="text-2xl font-bold">OTS</h1>
          <p className="text-muted text-sm">Offering Tracking System &middot; v{appVersion}</p>
        </div>
      </div>

      <p className="text-sm text-muted">
        Cloud-first system for tracking church offerings. Upload offering slip images, let AI scan them,
        review and approve, then generate reports to share with your team.
      </p>

      {/* Workflow */}
      <div className="rounded-xl border border-indigo-500/20 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-indigo-500/20 bg-indigo-500/5">
          <h3 className="text-sm font-medium text-indigo-400">How It Works</h3>
        </div>
        <div className="p-5">
          <div className="space-y-0">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-start gap-3 relative">
                {/* Connector line */}
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="absolute left-[15px] top-9 w-px h-[calc(100%-12px)] bg-border" />
                )}
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 z-10">
                  <step.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="pb-4">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    {step.label}
                    {i < WORKFLOW_STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-muted" />}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Update check */}
      {isElectron && (
        <div className="rounded-xl border border-emerald-500/20 bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-emerald-500/20 bg-emerald-500/5">
            <h3 className="text-sm font-medium text-emerald-400">Updates</h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <button onClick={handleCheck} disabled={checking}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer disabled:opacity-50">
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Check for Updates
              </button>
              {updateInfo?.status === 'latest' && (
                <span className="text-sm text-success">You're on the latest version</span>
              )}
              {updateInfo?.status === 'error' && (
                <span className="text-sm text-destructive">Check failed</span>
              )}
            </div>

            {updateInfo?.status === 'available' && !downloadDone && (
              <>
                <button onClick={handleDownload} disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                  {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {downloading ? `Downloading v${updateInfo.version}... ${downloadProgress}%` : `Download v${updateInfo.version}`}
                </button>
                {downloading && (
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${downloadProgress}%` }} />
                  </div>
                )}
              </>
            )}

            {downloadDone && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Downloaded to ~/Downloads</span>
                </div>
                <div className="rounded-lg bg-background p-3 text-xs text-muted space-y-1.5">
                  <p className="font-medium text-foreground">To install:</p>
                  <p>1. Quit OTS</p>
                  <p>2. Unzip the downloaded file</p>
                  <p>3. Replace OTS.app in Applications</p>
                  <p>4. Run: <code className="px-1 py-0.5 rounded bg-muted-foreground/10">xattr -rc /Applications/OTS.app</code></p>
                  <p>5. Launch OTS</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tech details */}
      <div className="rounded-xl border border-slate-500/20 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-500/20 bg-slate-500/5">
          <h3 className="text-sm font-medium text-slate-400">Technical Details</h3>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted text-xs">Frontend</p>
            <p>React + TypeScript + Tailwind</p>
          </div>
          <div>
            <p className="text-muted text-xs">Database</p>
            <p>Supabase (PostgreSQL)</p>
          </div>
          <div>
            <p className="text-muted text-xs">AI Scanner</p>
            <p>Claude (Anthropic API)</p>
          </div>
          <div>
            <p className="text-muted text-xs">Desktop</p>
            <p>Electron + PyInstaller</p>
          </div>
        </div>
      </div>

      {/* Author */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Built by Jerome Purushotham</p>
            <p className="text-xs text-muted mt-0.5">Christ Church of India, San Ramon</p>
          </div>
          <a href="https://github.com/jpurusho/ots" target="_blank" rel="noreferrer"
            className="text-xs text-primary hover:underline">
            github.com/jpurusho/ots
          </a>
        </div>
      </div>
    </div>
  )
}
