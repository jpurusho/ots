import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useUploadManager } from '@/lib/upload-manager'
import { useEnv } from '@/lib/env-context'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import {
  LayoutDashboard, Upload, ClipboardCheck, FileText,
  Settings, Users, Activity, LogOut, PenLine, Receipt,
  Loader2, Sparkles, ArrowDownCircle, Download, CheckCircle, X,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/offerings', icon: Upload, label: 'Offerings' },
  { to: '/manual-entry', icon: PenLine, label: 'Manual Entry' },
  { to: '/review', icon: ClipboardCheck, label: 'Review' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/checks', icon: Receipt, label: 'Checks' },
]

const adminItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/activity', icon: Activity, label: 'Activity' },
]

export function Layout() {
  const { appUser, user, signOut } = useAuth()
  const { state: uploadState } = useUploadManager()
  const { activeEnv, hasTestDb, switchEnvironment } = useEnv()
  const isAdmin = appUser?.role === 'admin'
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadDone, setDownloadDone] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    const api = getElectronAPI()
    const cleanupAvailable = api?.update.onUpdateAvailable((version) => {
      setUpdateAvailable(version)
    })
    const cleanupProgress = api?.update.onDownloadProgress((p) => {
      setDownloadProgress(p.percent)
    })
    return () => { cleanupAvailable?.(); cleanupProgress?.() }
  }, [])

  const handleDownloadUpdate = async () => {
    if (!updateAvailable) return
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadDone(false)
    try {
      const api = getElectronAPI()
      const zipUrl = `https://github.com/jpurusho/ots/releases/download/v${updateAvailable}/OTS-${updateAvailable}-arm64-mac.zip`
      await api?.update.download(zipUrl)
      setDownloadDone(true)
    } catch {
      setDownloadDone(false)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — entire sidebar is draggable in Electron, buttons opt out */}
      <aside className="w-56 border-r border-border bg-card flex flex-col"
        style={isElectron ? { WebkitAppRegion: 'drag' } as React.CSSProperties : undefined}>
        {isElectron && <div className="h-7 flex-shrink-0" />}
        <div className={`px-4 ${isElectron ? 'pb-4' : 'p-4'} border-b border-border`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">OTS</h1>
              {updateAvailable ? (
                <button onClick={() => setShowUpdateModal(true)}
                  className="flex items-center gap-1 text-[10px] text-warning animate-pulse cursor-pointer"
                  style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
                  <ArrowDownCircle className="w-3 h-3" /> v{updateAvailable} available
                </button>
              ) : (
                <p className="text-xs text-muted">v3.3.1</p>
              )}
            </div>
            {isElectron && hasTestDb && (
              <div className="flex flex-col items-end gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  activeEnv === 'prod'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-warning/10 text-warning'
                }`}>
                  {activeEnv}
                </span>
                {isAdmin && (
                  <button onClick={() => switchEnvironment(activeEnv === 'prod' ? 'test' : 'prod')}
                    className="text-[9px] text-muted hover:text-foreground cursor-pointer">
                    Switch to {activeEnv === 'prod' ? 'test' : 'prod'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted hover:bg-muted-foreground/10 hover:text-foreground'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
              {/* Show upload count badge on Offerings nav item */}
              {item.to === '/offerings' && uploadState.uploading && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {uploadState.current}/{uploadState.total}
                </span>
              )}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Admin
                </p>
              </div>
              {adminItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted hover:bg-muted-foreground/10 hover:text-foreground'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Global upload progress (visible from any page) */}
        {uploadState.uploading && (
          <div className="px-3 pb-2" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-medium text-primary">Uploading & Scanning</span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadState.total > 0 ? (uploadState.current / uploadState.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted truncate">
                {uploadState.current}/{uploadState.total} — {uploadState.currentFile}
              </p>
            </div>
          </div>
        )}

        {/* User section */}
        <div className="p-3 border-t border-border" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
          <div className="flex items-center gap-3 px-3 py-2">
            {user?.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {(appUser?.name || user?.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {appUser?.name || user?.email}
              </p>
              <p className="text-[10px] text-muted capitalize">{appUser?.role}</p>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 text-muted hover:text-destructive transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative">
        {isElectron && (
          <div className="sticky top-0 z-10 h-7 w-full bg-background" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        )}
        <div className={`${isElectron ? 'px-6 pb-6' : 'p-6'}`}>
          <Outlet />
        </div>
      </main>

      {/* Update modal — shown for both admin and operator */}
      {showUpdateModal && updateAvailable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !downloading && setShowUpdateModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Update Available</h2>
              {!downloading && (
                <button onClick={() => setShowUpdateModal(false)} className="p-1 text-muted hover:text-foreground cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium">OTS v{updateAvailable}</p>
              <p className="text-xs text-muted mt-1">A new version is available for download.</p>
            </div>

            {!downloadDone ? (
              <>
                <button onClick={handleDownloadUpdate} disabled={downloading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                  {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {downloading ? `Downloading... ${downloadProgress}%` : 'Download Update'}
                </button>
                {downloading && (
                  <div className="h-2 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${downloadProgress}%` }} />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Downloaded to ~/Downloads</span>
                </div>
                <div className="rounded-lg bg-background p-3 text-xs text-muted space-y-1.5">
                  <p className="font-medium text-foreground">To install the update:</p>
                  <p>1. Quit OTS</p>
                  <p>2. Open <strong>~/Downloads</strong> and unzip the new version</p>
                  <p>3. Replace OTS.app in Applications with the new one</p>
                  <p>4. Run: <code className="px-1 py-0.5 rounded bg-muted-foreground/10">xattr -rc /Applications/OTS.app</code></p>
                  <p>5. Launch OTS</p>
                </div>
                <button onClick={() => setShowUpdateModal(false)}
                  className="w-full px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted-foreground/10 cursor-pointer">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
