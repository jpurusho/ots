import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'
import { useUploadManager } from '@/lib/upload-manager'
import {
  LayoutDashboard, Upload, ClipboardCheck, FileText,
  Settings, Users, Activity, LogOut, PenLine, Receipt,
  Loader2, Sparkles,
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
  const isAdmin = appUser?.role === 'admin'

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold">OTS</h1>
          <p className="text-xs text-muted">v2.0.0</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
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
          <div className="px-3 pb-2">
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
        <div className="p-3 border-t border-border">
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
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
