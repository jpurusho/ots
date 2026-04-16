import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import { useEnv } from '@/lib/env-context'
import { getBackendUrl } from '@/lib/backend'
import { UserPlus, Shield, ShieldOff, Loader2, Trash2, Users, Send, Copy, Check, Clock, CheckCircle, Mail } from 'lucide-react'
import type { AppUser } from '@/types/database'

/** Invite code = base64 JSON with Supabase credentials for a given env */
interface InvitePayload {
  url: string
  anonKey: string
  serviceKey?: string
  env: 'prod' | 'test'
  app: 'ots'
}

function encodeInvite(payload: InvitePayload): string {
  return btoa(JSON.stringify(payload))
}

export function UsersPage() {
  const { appUser } = useAuth()
  const { activeEnv } = useEnv()
  const queryClient = useQueryClient()
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'operator' | 'admin'>('operator')
  const [inviteModal, setInviteModal] = useState<{ user: AppUser; env: 'prod' | 'test' } | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as AppUser[]
    },
  })

  const addUserMutation = useMutation({
    mutationFn: async ({ email, name, role }: { email: string; name: string; role: string }) => {
      const { error } = await supabase
        .from('app_users')
        .insert({ email, name: name || email.split('@')[0], role, is_active: true })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setNewEmail('')
      setNewName('')
      setNewRole('operator')
    },
  })

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const newRole = role === 'admin' ? 'operator' : 'admin'
      const { error } = await supabase
        .from('app_users')
        .update({ role: newRole })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('app_users')
        .update({ is_active: !is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('app_users').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    addUserMutation.mutate({ email: newEmail.trim(), name: newName.trim(), role: newRole })
  }

  const generateInvite = async (user: AppUser, env: 'prod' | 'test') => {
    let url = ''
    let anonKey = ''
    let serviceKey = ''

    if (isElectron) {
      const api = getElectronAPI()
      if (api) {
        const config = await api.config.get()
        const envConfig = config?.supabase?.[env]
        if (envConfig) {
          url = envConfig.url
          anonKey = envConfig.anonKey
          serviceKey = envConfig.serviceKey || ''
        }
      }
    } else {
      url = import.meta.env.VITE_SUPABASE_URL || ''
      anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    }

    if (!url || !anonKey) {
      alert(`No ${env} database configured`)
      return
    }

    const payload: InvitePayload = { url, anonKey, env, app: 'ots' }
    if (serviceKey) payload.serviceKey = serviceKey
    const code = encodeInvite(payload)
    const link = `https://jpurusho.github.io/ots/invite#${code}`

    // Mark user as invited
    await supabase
      .from('app_users')
      .update({
        invite_status: 'pending',
        invited_at: new Date().toISOString(),
        invite_env: env,
      })
      .eq('id', user.id)

    queryClient.invalidateQueries({ queryKey: ['users'] })

    setInviteCode(code)
    setInviteLink(link)
    setInviteModal({ user, env })
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendInviteEmail = async () => {
    if (!inviteModal || !inviteLink || !inviteCode) return
    setEmailSending(true)
    setEmailResult(null)
    try {
      const backendUrl = await getBackendUrl()
      if (!backendUrl) throw new Error('Backend not available')

      const env = inviteModal.env.toUpperCase()
      const userName = inviteModal.user.name || inviteModal.user.email.split('@')[0]
      const resp = await fetch(`${backendUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [inviteModal.user.email],
          subject: `OTS Invite — ${env} Environment`,
          html_body: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0">
              <h2 style="margin:0;color:#fff;font-size:18px">OTS — Offering Tracking System</h2>
              <p style="margin:4px 0 0;color:#c7d2fe;font-size:13px">You've been invited to the ${env} environment</p>
            </div>
            <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
              <p style="margin:0 0 16px;font-size:14px;color:#374151">Hi ${userName},</p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151">You've been invited to use the OTS offering tracking system. Follow these steps to get started:</p>
              <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8">
                <li>Download OTS from the <a href="${inviteLink}" style="color:#4f46e5">invite page</a></li>
                <li>Unzip and move OTS.app to Applications</li>
                <li>Run: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px">xattr -rc OTS.app</code></li>
                <li>Launch OTS and paste this invite code:</li>
              </ol>
              <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:0 0 20px;word-break:break-all;font-family:monospace;font-size:11px;color:#1e293b">${inviteCode}</div>
              <p style="margin:0 0 8px;font-size:14px;color:#374151">Then sign in with your Google account (<strong>${inviteModal.user.email}</strong>).</p>
              <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">This invite is for the <strong>${env}</strong> environment.</p>
            </div>
          </div>`,
        }),
      })
      const data = await resp.json()
      if (data.success) {
        setEmailResult({ ok: true, msg: `Sent to ${inviteModal.user.email}` })
      } else {
        setEmailResult({ ok: false, msg: data.error || data.detail || 'Failed to send' })
      }
    } catch (err) {
      setEmailResult({ ok: false, msg: err instanceof Error ? err.message : 'Failed to send' })
    } finally {
      setEmailSending(false)
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted text-sm">Manage who can access the system</p>
      </div>

      {/* Add user form */}
      <form onSubmit={handleAddUser} className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium mb-3">Add User</h3>
        <div className="flex gap-3 flex-wrap">
          <input type="email" placeholder="Email address" required
            value={newEmail} onChange={e => setNewEmail(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
          <input type="text" placeholder="Name (optional)"
            value={newName} onChange={e => setNewName(e.target.value)}
            className="w-40 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
          <select value={newRole} onChange={e => setNewRole(e.target.value as 'operator' | 'admin')}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background">
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={addUserMutation.isPending}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
            {addUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {addUserMutation.error && (
          <p className="text-xs text-destructive mt-2">{(addUserMutation.error as Error).message}</p>
        )}
      </form>

      {/* User list */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-card border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-muted" />
          <h3 className="text-sm font-medium">{users?.length || 0} Users</h3>
        </div>
        <div className="divide-y divide-border">
          {users?.map(user => (
            <div key={user.id} className={`px-4 py-3 flex items-center gap-4 ${!user.is_active ? 'opacity-50' : ''}`}>
              {/* Avatar */}
              {user.picture ? (
                <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {(user.name || user.email)[0].toUpperCase()}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                  {/* Invite status badge */}
                  {user.invite_status === 'pending' && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                      <Clock className="w-3 h-3" /> Invited
                    </span>
                  )}
                  {user.invite_status === 'accepted' && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success">
                      <CheckCircle className="w-3 h-3" /> Joined
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted truncate">
                  {user.email}
                  {user.last_login && <span className="ml-2">Last login: {new Date(user.last_login).toLocaleDateString()}</span>}
                </p>
              </div>

              {/* Role badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted-foreground/10 text-muted'
              }`}>
                {user.role}
              </span>

              {/* Actions (don't allow modifying yourself) */}
              {user.email !== appUser?.email && (
                <div className="flex items-center gap-1">
                  {/* Invite button — show for users who haven't logged in yet */}
                  {!user.last_login && (
                    <button onClick={() => generateInvite(user, activeEnv)}
                      title={`Send invite (${activeEnv})`}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-primary hover:bg-primary/10 cursor-pointer">
                      <Send className="w-3.5 h-3.5" /> Invite
                    </button>
                  )}
                  <button onClick={() => toggleRoleMutation.mutate({ id: user.id, role: user.role })}
                    title={user.role === 'admin' ? 'Demote to operator' : 'Promote to admin'}
                    className="p-1.5 rounded hover:bg-muted-foreground/10 cursor-pointer">
                    {user.role === 'admin' ? <ShieldOff className="w-4 h-4 text-muted" /> : <Shield className="w-4 h-4 text-muted" />}
                  </button>
                  <button onClick={() => toggleActiveMutation.mutate({ id: user.id, is_active: user.is_active })}
                    title={user.is_active ? 'Deactivate' : 'Activate'}
                    className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                      user.is_active ? 'text-warning hover:bg-warning/10' : 'text-success hover:bg-success/10'
                    }`}>
                    {user.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => { deleteUserMutation.mutate(user.id) }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted hover:text-destructive cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invite modal */}
      {inviteModal && inviteLink && inviteCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setInviteModal(null)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Invite {inviteModal.user.name || inviteModal.user.email}</h2>
            <p className="text-sm text-muted">
              Send this link to the user. It contains the {inviteModal.env.toUpperCase()} database connection — no secrets, just the public URL and anon key.
            </p>

            {/* Invite link */}
            <div>
              <label className="text-xs font-medium text-muted">Invite Link</label>
              <div className="flex gap-2 mt-1">
                <input type="text" readOnly value={inviteLink}
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background truncate" />
                <button onClick={() => copyToClipboard(inviteLink)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 cursor-pointer">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Invite code (for manual paste) */}
            <div>
              <label className="text-xs font-medium text-muted">Or share just the invite code</label>
              <div className="flex gap-2 mt-1">
                <input type="text" readOnly value={inviteCode}
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background truncate" />
                <button onClick={() => copyToClipboard(inviteCode)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted-foreground/10 cursor-pointer">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
            </div>

            {/* Email invite directly */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <button onClick={sendInviteEmail} disabled={emailSending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                  {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Email Invite to {inviteModal.user.email}
                </button>
              </div>
              {emailResult && (
                <p className={`text-xs mt-2 ${emailResult.ok ? 'text-success' : 'text-destructive'}`}>
                  {emailResult.msg}
                </p>
              )}
            </div>

            {/* Instructions */}
            <div className="rounded-lg bg-background p-3 text-xs text-muted space-y-1">
              <p className="font-medium text-foreground">What the user needs to do:</p>
              <p>1. Open the invite link to see download + setup instructions</p>
              <p>2. Download and unzip OTS.app</p>
              <p>3. Run: <code className="px-1 py-0.5 rounded bg-muted-foreground/10">xattr -rc OTS.app</code></p>
              <p>4. Launch OTS, paste the invite code, and sign in with Google</p>
            </div>

            <div className="flex justify-end">
              <button onClick={() => { setInviteModal(null); setEmailResult(null) }}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted-foreground/10 cursor-pointer">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
