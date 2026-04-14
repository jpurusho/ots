import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Save, Loader2, CheckCircle, TestTube, Eye, EyeOff } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

interface Setting {
  key: string
  value: string | null
  category: string | null
  label: string | null
  description: string | null
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI' },
  { id: 'drive', label: 'Google Drive' },
  { id: 'email', label: 'Email' },
  { id: 'about', label: 'About' },
]

// Fields that should use textarea (multiline)
const TEXTAREA_FIELDS = ['google_drive_credentials']
// Fields that should be masked
const SENSITIVE_FIELDS = ['google_drive_credentials', 'smtp_password']

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<{ key: string; success: boolean; message: string } | null>(null)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').order('key')
      if (error) throw error
      return data as Setting[]
    },
  })

  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {}
      for (const s of settings) vals[s.key] = s.value || ''
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

  const handleTest = async (type: 'drive' | 'email') => {
    setTestResult(null)
    try {
      if (type === 'drive') {
        // Save credentials first, then test
        await handleSave()
        const folderId = formValues['drive_images_folder_id']
        if (!folderId) {
          setTestResult({ key: 'drive', success: false, message: 'Enter an Images Folder ID to test' })
          return
        }
        const resp = await fetch(`${BACKEND_URL}/api/drive/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_id: folderId }),
        })
        const data = await resp.json()
        setTestResult({
          key: 'drive',
          success: data.success,
          message: data.success
            ? `Connected! Folder: ${data.folder_name} (${data.file_count} files)`
            : data.error || 'Connection failed',
        })
      } else if (type === 'email') {
        await handleSave()
        const resp = await fetch(`${BACKEND_URL}/api/email/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: formValues['smtp_user'] }),
        })
        const data = await resp.json()
        setTestResult({
          key: 'email',
          success: data.success,
          message: data.success ? data.message : data.error || 'Connection failed',
        })
      }
    } catch (err) {
      setTestResult({ key: type, success: false, message: err instanceof Error ? err.message : 'Test failed' })
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
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSaved(false); setTestResult(null) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Settings form */}
      {activeTab !== 'about' ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {tabSettings.map(setting => {
              const isSensitive = SENSITIVE_FIELDS.includes(setting.key)
              const isTextarea = TEXTAREA_FIELDS.includes(setting.key)
              const isVisible = !isSensitive || showSensitive[setting.key]

              return (
                <div key={setting.key} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{setting.label || setting.key}</label>
                    {isSensitive && (
                      <button onClick={() => setShowSensitive(s => ({ ...s, [setting.key]: !s[setting.key] }))}
                        className="text-xs text-muted hover:text-foreground cursor-pointer flex items-center gap-1">
                        {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {isVisible ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                  {setting.description && (
                    <p className="text-xs text-muted mt-0.5">{setting.description}</p>
                  )}
                  {setting.key === 'use_bedrock' ? (
                    <select value={formValues[setting.key] || 'false'}
                      onChange={e => setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                      className="mt-2 w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background">
                      <option value="false">Anthropic API (Direct)</option>
                      <option value="true">AWS Bedrock</option>
                    </select>
                  ) : isTextarea ? (
                    <textarea
                      value={isVisible ? (formValues[setting.key] || '') : (formValues[setting.key] ? '••••••••' : '')}
                      onChange={e => isVisible && setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                      readOnly={!isVisible}
                      rows={4}
                      placeholder={setting.key}
                      className="mt-2 w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background resize-none font-mono"
                    />
                  ) : (
                    <input
                      type={isSensitive && !isVisible ? 'password' : 'text'}
                      value={formValues[setting.key] || ''}
                      onChange={e => setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                      placeholder={setting.key}
                      className="mt-2 w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Test + Save bar */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(activeTab === 'drive' || activeTab === 'email') && (
                <button onClick={() => handleTest(activeTab as 'drive' | 'email')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
                  <TestTube className="w-4 h-4" /> Test Connection
                </button>
              )}
              {testResult && (
                <span className={`text-xs ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                  {testResult.message}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <CheckCircle className="w-4 h-4" /> Saved
                </span>
              )}
              <button onClick={handleSave} disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
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
