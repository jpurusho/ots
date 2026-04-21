import { getBackendUrl } from '@/lib/backend'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Save, Loader2, CheckCircle, TestTube, Eye, EyeOff, FolderOpen, X, Copy, Check } from 'lucide-react'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { useTheme } from '@/lib/theme-context'
import { useAccentColors } from '@/lib/accent-colors'


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
  { id: 'themes', label: 'Themes' },
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
// Filename template fields (custom rendering with live preview)
const FILENAME_TEMPLATE_FIELDS = ['filename_template_report', 'filename_template_cards']
const FILENAME_TEMPLATE_DEFAULTS: Record<string, string> = {
  filename_template_report: '{church}_Report_{period}_{date}',
  filename_template_cards: '{church}_Cards_{period}_{date}',
}
const FILENAME_TEMPLATE_VARS = ['{church}', '{period}', '{date}', '{year}', '{month}']

function resolveFilenamePreview(template: string, churchName: string): string {
  const today = new Date()
  const church = (churchName || 'Church').replace(/\s+/g, '_').replace(/[^\w\-]/g, '')
  const name = template
    .replace(/\{church\}/g, church)
    .replace(/\{period\}/g, 'April_2026')
    .replace(/\{date\}/g, today.toISOString().split('T')[0])
    .replace(/\{year\}/g, String(today.getFullYear()))
    .replace(/\{month\}/g, today.toLocaleString('default', { month: 'long' }))
  return name.endsWith('.pdf') ? name : name + '.pdf'
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<{ key: string; success: boolean; message: string } | null>(null)
  const [folderPicker, setFolderPicker] = useState<string | null>(null) // which field's picker is open
  const [folderPaths, setFolderPaths] = useState<Record<string, string>>({})
  const [folderDisplayMode, setFolderDisplayMode] = useState<'name' | 'id'>(() =>
    (localStorage.getItem('ots:drive_folder_display') as 'name' | 'id') || 'name'
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [resolvingPaths, setResolvingPaths] = useState<Set<string>>(new Set())

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

  // Auto-resolve folder IDs → names when Drive tab is active
  useEffect(() => {
    if (activeTab !== 'drive' || !formValues) return
    const toResolve: string[] = []
    for (const key of FOLDER_PICKER_FIELDS) {
      const id = formValues[key]
      if (!id) continue
      // Check localStorage cache first
      const cached = localStorage.getItem('ots:folder_path:' + id)
      if (cached) {
        setFolderPaths(p => ({ ...p, [key]: cached }))
      } else {
        toResolve.push(key)
      }
    }
    if (toResolve.length === 0) return

    setResolvingPaths(new Set(toResolve))
    ;(async () => {
      const resolved: Record<string, string> = {}
      for (const key of toResolve) {
        const id = formValues[key]
        if (!id) continue
        try {
          const url = (await getBackendUrl()) + '/api/drive/folder-info?folder_id=' + encodeURIComponent(id)
          const resp = await fetch(url)
          if (resp.ok) {
            const data = await resp.json()
            if (data.path) {
              resolved[key] = data.path
              localStorage.setItem('ots:folder_path:' + id, data.path)
            }
          }
        } catch { /* backend unavailable — silently skip */ }
      }
      setFolderPaths(p => ({ ...p, ...resolved }))
      setResolvingPaths(new Set())
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, formValues['drive_images_folder_id'], formValues['drive_reports_folder_id']])

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
      {/* Themes tab */}
      {activeTab === 'themes' ? (
        <ThemesTab />
      ) : (
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
                  ) : FILENAME_TEMPLATE_FIELDS.includes(setting.key) ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        value={formValues[setting.key] || ''}
                        onChange={e => setFormValues(v => ({ ...v, [setting.key]: e.target.value }))}
                        placeholder={FILENAME_TEMPLATE_DEFAULTS[setting.key]}
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background font-mono"
                      />
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="shrink-0">Preview:</span>
                        <code className="text-[11px] bg-muted/30 px-2 py-0.5 rounded truncate">
                          {resolveFilenamePreview(
                            formValues[setting.key] || FILENAME_TEMPLATE_DEFAULTS[setting.key],
                            formValues['church_name'] || ''
                          )}
                        </code>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                        <span>Insert:</span>
                        {FILENAME_TEMPLATE_VARS.map(v => (
                          <button key={v} type="button"
                            onClick={() => setFormValues(prev => ({
                              ...prev,
                              [setting.key]: (prev[setting.key] || FILENAME_TEMPLATE_DEFAULTS[setting.key]) + v,
                            }))}
                            className="font-mono bg-muted/20 hover:bg-primary/10 hover:text-primary border border-border/60 px-1.5 py-0.5 rounded cursor-pointer transition-colors">
                            {v}
                          </button>
                        ))}
                        <button type="button"
                          onClick={() => setFormValues(prev => ({
                            ...prev,
                            [setting.key]: FILENAME_TEMPLATE_DEFAULTS[setting.key],
                          }))}
                          className="ml-1 text-muted hover:text-foreground cursor-pointer underline">
                          Reset default
                        </button>
                      </div>
                    </div>
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
                    <div className="mt-2 space-y-1.5">
                      {/* Name / ID display toggle — shown once per field, persisted */}
                      <div className="flex gap-1 w-fit rounded-md border border-border p-0.5 bg-muted/20 mb-2">
                        {(['name', 'id'] as const).map(mode => (
                          <button key={mode} onClick={() => {
                            setFolderDisplayMode(mode)
                            localStorage.setItem('ots:drive_folder_display', mode)
                          }}
                          className={`px-2.5 py-0.5 text-[11px] font-medium rounded cursor-pointer transition-colors ${
                            folderDisplayMode === mode
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted hover:text-foreground'
                          }`}>
                            {mode === 'name' ? 'Show Name' : 'Show ID'}
                          </button>
                        ))}
                      </div>
                      {/* Main row: input + actions */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input type="text" readOnly
                            value={
                              folderDisplayMode === 'name'
                                ? folderPaths[setting.key]
                                  || (resolvingPaths.has(setting.key) ? 'Resolving…' : '')
                                  || formValues[setting.key]
                                  || ''
                                : formValues[setting.key] || ''
                            }
                            placeholder="Select a folder…"
                            title={
                              folderDisplayMode === 'name'
                                ? folderPaths[setting.key] || formValues[setting.key] || ''
                                : formValues[setting.key] || ''
                            }
                            className={`w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background cursor-default truncate ${
                              resolvingPaths.has(setting.key) && folderDisplayMode === 'name' ? 'text-muted italic' : ''
                            }`}
                          />
                        </div>
                        <button onClick={() => setFolderPicker(folderPicker === setting.key ? null : setting.key)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer whitespace-nowrap">
                          <FolderOpen className="w-4 h-4" /> Browse
                        </button>
                        {formValues[setting.key] && (
                          <button onClick={() => {
                            setFormValues(v => ({ ...v, [setting.key]: '' }))
                            setFolderPaths(p => ({ ...p, [setting.key]: '' }))
                          }} className="p-1.5 rounded hover:bg-destructive/10 text-muted hover:text-destructive cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Secondary row: the other value (ID or name) + copy */}
                      {formValues[setting.key] && (
                        <div className="flex items-center gap-1.5 pl-0.5">
                          {folderDisplayMode === 'name' ? (
                            <>
                              <span className="text-[11px] text-muted font-mono truncate max-w-[260px]">
                                {formValues[setting.key]}
                              </span>
                              <button
                                onClick={async () => {
                                  await navigator.clipboard.writeText(formValues[setting.key])
                                  setCopiedField(setting.key)
                                  setTimeout(() => setCopiedField(f => f === setting.key ? null : f), 1500)
                                }}
                                title="Copy folder ID"
                                className="text-muted hover:text-foreground cursor-pointer flex-shrink-0">
                                {copiedField === setting.key
                                  ? <Check className="w-3 h-3 text-success" />
                                  : <Copy className="w-3 h-3" />}
                              </button>
                              {copiedField === setting.key && (
                                <span className="text-[10px] text-success">Copied</span>
                              )}
                            </>
                          ) : (
                            <>
                              {folderPaths[setting.key] && (
                                <span className="text-[11px] text-muted truncate max-w-[300px]">
                                  📁 {folderPaths[setting.key]}
                                </span>
                              )}
                              {resolvingPaths.has(setting.key) && !folderPaths[setting.key] && (
                                <span className="text-[11px] text-muted italic flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Resolving name…
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Folder picker */}
                      {folderPicker === setting.key && (
                        <DriveFolderPicker
                          onSelect={(id, path) => {
                            setFormValues(v => ({ ...v, [setting.key]: id }))
                            setFolderPaths(p => ({ ...p, [setting.key]: path }))
                            localStorage.setItem('ots:folder_path:' + id, path)
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
      )}
    </div>
  )
}

const COLOR_PRESETS = [
  { value: '#16a34a', label: 'Green' },
  { value: '#4f46e5', label: 'Purple' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#dc2626', label: 'Red' },
  { value: '#0891b2', label: 'Teal' },
  { value: '#d97706', label: 'Amber' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#0d9488', label: 'Emerald' },
]

function ColorPicker({ label, description, value, onChange }: {
  label: string; description: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-[10px] text-muted mb-2">{description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {COLOR_PRESETS.map(p => (
          <button key={p.value} onClick={() => onChange(p.value)}
            title={p.label}
            className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
              value === p.value ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
            }`}
            style={{ backgroundColor: p.value }}
          />
        ))}
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded-full border border-border cursor-pointer" title="Custom color" />
        <span className="text-xs text-muted font-mono ml-1">{value}</span>
      </div>
    </div>
  )
}

function ThemesTab() {
  const { preset, setPreset, presets } = useTheme()
  const queryClient = useQueryClient()
  const accentColors = useAccentColors()

  const [reportColor, setReportColor] = useState(accentColors.report)
  const [cardColor, setCardColor] = useState(accentColors.card)
  const [colorSaved, setColorSaved] = useState(false)

  useEffect(() => {
    setReportColor(accentColors.report)
    setCardColor(accentColors.card)
  }, [accentColors.report, accentColors.card])

  const hasColorChanges = reportColor !== accentColors.report || cardColor !== accentColors.card

  const saveColors = async () => {
    await supabase.from('app_settings').update({ value: reportColor }).eq('key', 'report_accent_color')
    await supabase.from('app_settings').update({ value: cardColor }).eq('key', 'card_accent_color')
    queryClient.invalidateQueries({ queryKey: ['settings'] })
    setColorSaved(true)
    setTimeout(() => setColorSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      {/* Theme presets */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5">
          <h3 className="text-sm font-medium mb-4">App Theme</h3>
          <p className="text-xs text-muted mb-4">Choose a theme for all users in this environment.</p>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(presets).map(([key, p]) => (
              <button key={key} onClick={() => setPreset(key)}
                className={`rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${
                  preset === key ? 'border-primary ring-1 ring-primary scale-[1.02]' : 'border-border hover:border-primary/30'
                }`}>
                {/* Color preview swatch */}
                <div className="h-12 relative" style={{ backgroundColor: p.colors.background }}>
                  <div className="absolute inset-x-2 top-2 h-3 rounded" style={{ backgroundColor: p.colors.card }} />
                  <div className="absolute left-3 bottom-2 w-8 h-2 rounded" style={{ backgroundColor: p.colors.primary }} />
                  <div className="absolute right-3 bottom-2 w-4 h-2 rounded" style={{ backgroundColor: p.colors.border }} />
                </div>
                <div className="px-2 py-1.5 text-center" style={{ backgroundColor: p.colors.card }}>
                  <p className="text-[10px] font-medium" style={{ color: p.colors['card-foreground'] }}>{p.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Report accent colors */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5 space-y-5">
          <h3 className="text-sm font-medium">Report Colors</h3>
          <ColorPicker
            label="Monthly Report"
            description="Header and footer color for offering report PDFs and emails"
            value={reportColor}
            onChange={setReportColor}
          />
          <ColorPicker
            label="Weekly Cards & Checks"
            description="Accent color for weekly cards, check contributions, and year-end PDFs"
            value={cardColor}
            onChange={setCardColor}
          />
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            {colorSaved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle className="w-4 h-4" /> Saved
              </span>
            )}
            <button onClick={saveColors} disabled={!hasColorChanges}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
              <Save className="w-4 h-4" />
              {hasColorChanges ? 'Save Colors' : 'Saved'}
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] text-muted">Preview:</span>
              <div className="flex gap-1">
                <div className="w-10 h-5 rounded text-[8px] text-white font-bold flex items-center justify-center" style={{ backgroundColor: reportColor }}>RPT</div>
                <div className="w-10 h-5 rounded text-[8px] text-white font-bold flex items-center justify-center" style={{ backgroundColor: cardColor }}>CARD</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
