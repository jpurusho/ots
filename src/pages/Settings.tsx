import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Save, Loader2, CheckCircle } from 'lucide-react'

interface Setting {
  key: string
  value: string | null
  category: string | null
  label: string | null
  description: string | null
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI Configuration' },
  { id: 'about', label: 'About' },
]

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('key')
      if (error) throw error
      return data as Setting[]
    },
  })

  // Initialize form values from DB
  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {}
      for (const s of settings) {
        vals[s.key] = s.value || ''
      }
      setFormValues(vals)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      for (const [key, value] of Object.entries(updates)) {
        const { error } = await supabase
          .from('app_settings')
          .update({ value, modified_at: new Date().toISOString() })
          .eq('key', key)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSave = () => {
    // Only save changed values
    if (!settings) return
    const updates: Record<string, string> = {}
    for (const s of settings) {
      if (s.category === activeTab && formValues[s.key] !== (s.value || '')) {
        updates[s.key] = formValues[s.key]
      }
    }
    if (Object.keys(updates).length > 0) {
      saveMutation.mutate(updates)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const tabSettings = settings?.filter(s => s.category === activeTab) || []

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted text-sm">Configure system settings (admin only)</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSaved(false) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Settings form */}
      {activeTab !== 'about' ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {tabSettings.map(setting => (
              <div key={setting.key} className="px-5 py-4">
                <label className="text-sm font-medium">{setting.label || setting.key}</label>
                {setting.description && (
                  <p className="text-xs text-muted mt-0.5">{setting.description}</p>
                )}
                {setting.key === 'use_bedrock' ? (
                  <select
                    value={formValues[setting.key] || 'false'}
                    onChange={e => setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                    className="mt-2 w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
                  >
                    <option value="false">Anthropic API (Direct)</option>
                    <option value="true">AWS Bedrock</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formValues[setting.key] || ''}
                    onChange={e => setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                    placeholder={setting.key}
                    className="mt-2 w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle className="w-4 h-4" /> Saved
              </span>
            )}
            <button onClick={handleSave} disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>
          </div>
        </div>
      ) : (
        /* About tab */
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div>
            <p className="text-sm text-muted">Version</p>
            <p className="text-lg font-bold">2.0.0</p>
          </div>
          <div>
            <p className="text-sm text-muted">Architecture</p>
            <p className="text-sm">Supabase (PostgreSQL + Auth + Storage) + React + TanStack Query</p>
          </div>
          <div>
            <p className="text-sm text-muted">AI Scanner</p>
            <p className="text-sm">Claude via {formValues['use_bedrock'] === 'true' ? 'AWS Bedrock' : 'Anthropic API'}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Previous Version</p>
            <a href="https://github.com/jpurusho/ots-v0" target="_blank" rel="noreferrer"
              className="text-sm text-primary hover:underline">github.com/jpurusho/ots-v0</a>
          </div>
        </div>
      )}
    </div>
  )
}
