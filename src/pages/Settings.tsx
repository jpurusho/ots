import { getBackendUrl } from '@/lib/backend'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Save, Loader2, CheckCircle, TestTube, Eye, EyeOff, FolderOpen, X } from 'lucide-react'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'


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
const SENSITIVE_FIELDS = ['google_drive_credentials', 'smtp_password', 'anthropic_api_key']
// Fields that allow file upload (read JSON file from filesystem)
const FILE_PICKER_FIELDS = ['google_drive_credentials']
// Fields that use Drive folder picker
const FOLDER_PICKER_FIELDS = ['drive_images_folder_id', 'drive_reports_folder_id']
// Read-only usage stats (shown as card, not editable)
const USAGE_FIELDS = ['api_total_input_tokens', 'api_total_output_tokens', 'api_total_scans', 'api_total_cost']

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<{ key: string; success: boolean; message: string } | null>(null)
  const [folderPicker, setFolderPicker] = useState<string | null>(null) // which field's picker is open
  const [folderPaths, setFolderPaths] = useState<Record<string, string>>({})

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
        // Save credentials first, then test both folders
        if (hasChanges) await handleSave()
        const imagesFolderId = formValues['drive_images_folder_id']
        const reportsFolderId = formValues['drive_reports_folder_id']

        if (!imagesFolderId && !reportsFolderId) {
          setTestResult({ key: 'drive', success: false, message: 'Enter at least one folder ID to test' })
          return
        }

        const results: string[] = []
        let allOk = true

        // Test images folder
        if (imagesFolderId) {
          const resp = await fetch(`${await getBackendUrl()}/api/drive/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: imagesFolderId }),
          })
          const data = await resp.json()
          if (data.success) {
            results.push(`Images: ${data.folder_name} (${data.file_count} files)`)
          } else {
            results.push(`Images: ${data.error || 'Failed'}`)
            allOk = false
          }
        }

        // Test reports folder
        if (reportsFolderId) {
          const resp = await fetch(`${await getBackendUrl()}/api/drive/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: reportsFolderId }),
          })
          const data = await resp.json()
          if (data.success) {
            results.push(`Reports: ${data.folder_name}`)
          } else {
            results.push(`Reports: ${data.error || 'Failed'}`)
            allOk = false
          }
        }

        setTestResult({
          key: 'drive',
          success: allOk,
          message: results.join(' | '),
        })
      } else if (type === 'email') {
        if (hasChanges) await handleSave()
        const resp = await fetch(`${await getBackendUrl()}/api/email/test`, {
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

  // Check if any values changed in the current tab
  const hasChanges = tabSettings.some(s => formValues[s.key] !== (s.value || ''))

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

      {/* API Usage card (AI tab only) */}
      {activeTab === 'ai' && (() => {
        const usageSettings = tabSettings.filter(s => USAGE_FIELDS.includes(s.key))
        if (usageSettings.length === 0) return null
        const scans = parseFloat(formValues['api_total_scans'] || '0')
        const inputTokens = parseFloat(formValues['api_total_input_tokens'] || '0')
        const outputTokens = parseFloat(formValues['api_total_output_tokens'] || '0')
        const cost = parseFloat(formValues['api_total_cost'] || '0')
        return (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <h3 className="text-sm font-medium mb-3">API Usage</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{scans.toFixed(0)}</p>
                <p className="text-[10px] text-muted uppercase">Scans</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{inputTokens >= 1000 ? (inputTokens / 1000).toFixed(1) + 'K' : inputTokens.toFixed(0)}</p>
                <p className="text-[10px] text-muted uppercase">Input Tokens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{outputTokens >= 1000 ? (outputTokens / 1000).toFixed(1) + 'K' : outputTokens.toFixed(0)}</p>
                <p className="text-[10px] text-muted uppercase">Output Tokens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">${cost.toFixed(4)}</p>
                <p className="text-[10px] text-muted uppercase">Est. Cost</p>
              </div>
            </div>
            <p className="text-[10px] text-muted mt-3 text-center">Sonnet pricing: $3/M input, $15/M output</p>
          </div>
        )
      })()}

      {/* Settings form */}
      {activeTab !== 'about' ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {tabSettings.filter(s => !USAGE_FIELDS.includes(s.key)).map(setting => {
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
                    <div>
                      {FILE_PICKER_FIELDS.includes(setting.key) && (
                        <div className="mt-2 mb-1 flex items-center gap-2">
                          <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
                            <FolderOpen className="w-4 h-4" />
                            Browse JSON File
                            <input type="file" accept=".json" className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const reader = new FileReader()
                                reader.onload = () => {
                                  const content = reader.result as string
                                  try {
                                    // Validate it's valid JSON with expected fields
                                    const parsed = JSON.parse(content)
                                    if (parsed.type !== 'service_account') {
                                      alert('Invalid file: expected a Google service account JSON key (type: "service_account")')
                                      return
                                    }
                                    setFormValues(v => ({ ...v, [setting.key]: content }))
                                    setShowSensitive(s => ({ ...s, [setting.key]: true }))
                                  } catch {
                                    alert('Invalid JSON file')
                                  }
                                }
                                reader.readAsText(file)
                                e.target.value = '' // reset so same file can be selected again
                              }}
                            />
                          </label>
                          {formValues[setting.key] && (() => {
                            try {
                              const parsed = JSON.parse(formValues[setting.key])
                              return (
                                <span className="text-xs text-success">
                                  {parsed.client_email || 'Valid JSON loaded'}
                                </span>
                              )
                            } catch {
                              return <span className="text-xs text-destructive">Invalid JSON</span>
                            }
                          })()}
                        </div>
                      )}
                      <textarea
                        value={isVisible ? (formValues[setting.key] || '') : (formValues[setting.key] ? '••••••••' : '')}
                        onChange={e => isVisible && setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                        readOnly={!isVisible}
                        rows={4}
                        placeholder="Paste JSON here or use Browse button above"
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background resize-none font-mono"
                      />
                    </div>
                  ) : FOLDER_PICKER_FIELDS.includes(setting.key) ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="text" readOnly
                          value={folderPaths[setting.key] || formValues[setting.key] || ''}
                          placeholder="Select a folder..."
                          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background cursor-default"
                        />
                        <button onClick={() => setFolderPicker(folderPicker === setting.key ? null : setting.key)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
                          <FolderOpen className="w-4 h-4" /> Browse
                        </button>
                        {formValues[setting.key] && (
                          <button onClick={() => { setFormValues(v => ({ ...v, [setting.key]: '' })); setFolderPaths(p => ({ ...p, [setting.key]: '' })) }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted hover:text-destructive cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {formValues[setting.key] && !folderPaths[setting.key] && (
                        <p className="text-[10px] text-muted font-mono">ID: {formValues[setting.key]}</p>
                      )}
                      {folderPicker === setting.key && (
                        <DriveFolderPicker
                          onSelect={(id, path) => {
                            setFormValues(v => ({ ...v, [setting.key]: id }))
                            setFolderPaths(p => ({ ...p, [setting.key]: path }))
                            setFolderPicker(null)
                          }}
                          onCancel={() => setFolderPicker(null)}
                        />
                      )}
                    </div>
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
              <button onClick={handleSave} disabled={saveMutation.isPending || !hasChanges}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {hasChanges ? 'Save' : 'Saved'}
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
