import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { UserPlus, Shield, ShieldOff, Loader2, Trash2, Users } from 'lucide-react'
import type { AppUser } from '@/types/database'

export function UsersPage() {
  const { appUser } = useAuth()
  const queryClient = useQueryClient()
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'operator' | 'admin'>('operator')

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
                <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                <p className="text-xs text-muted truncate">{user.email}</p>
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
    </div>
  )
}
