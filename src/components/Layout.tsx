import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useUploadManager } from '@/lib/upload-manager'
import { useEnv } from '@/lib/env-context'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import {
  LayoutDashboard, Upload, ClipboardCheck, FileText,
  Settings, Users, Activity, LogOut, PenLine, Receipt,
  Loader2, Sparkles, ArrowDownCircle,
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

  useEffect(() => {
    if (!isElectron) return
    const cleanup = getElectronAPI()?.update.onUpdateAvailable((version) => {
      setUpdateAvailable(version)
    })
    return () => { cleanup?.() }
  }, [])

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
                isAdmin ? (
                  <NavLink to="/settings" className="flex items-center gap-1 text-[10px] text-warning animate-pulse"
                    style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
                    <ArrowDownCircle className="w-3 h-3" /> v{updateAvailable} available
                  </NavLink>
                ) : (
                  <button onClick={() => getElectronAPI()?.app.openExternal(`https://github.com/jpurusho/ots/releases/latest`)}
                    className="flex items-center gap-1 text-[10px] text-warning animate-pulse cursor-pointer"
                    style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
                    <ArrowDownCircle className="w-3 h-3" /> v{updateAvailable} available
                  </button>
                )
              ) : (
                <p className="text-xs text-muted">v3.3.0</p>
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
    </div>
  )
}
