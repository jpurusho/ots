import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getElectronAPI } from '@/lib/electron-compat'
import { Loader2, CheckCircle, XCircle, ArrowRight, ArrowLeft, Database, KeyRound, Settings2 } from 'lucide-react'

interface StepProps {
  onComplete: () => void
}

/** Decode an invite code (base64 JSON) */
function decodeInvite(code: string): { url: string; anonKey: string; serviceKey?: string; env: 'prod' | 'test' } | null {
  try {
    const json = JSON.parse(atob(code.trim()))
    if (json.url && json.anonKey && json.app === 'ots') {
      return { url: json.url, anonKey: json.anonKey, serviceKey: json.serviceKey, env: json.env || 'prod' }
    }
  } catch { /* invalid code */ }
  return null
}

export function SetupPage({ onComplete }: StepProps) {
  const [mode, setMode] = useState<'choose' | 'invite' | 'manual'>('choose')
  const [step, setStep] = useState(1)

  // Invite code state
  const [inviteCode, setInviteCode] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteTesting, setInviteTesting] = useState(false)
  const [inviteTestResult, setInviteTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Manual setup state
  const [prodUrl, setProdUrl] = useState('')
  const [prodAnonKey, setProdAnonKey] = useState('')
  const [prodServiceKey, setProdServiceKey] = useState('')
  const [testUrl, setTestUrl] = useState('')
  const [testAnonKey, setTestAnonKey] = useState('')
  const [testServiceKey, setTestServiceKey] = useState('')
  const [bootstrapAdmin, setBootstrapAdmin] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const testConnection = async (url: string, key: string) => {
    setTesting(true)
    setTestResult(null)
    try {
      const client = createClient(url, key)
      const { error } = await client.from('app_settings').select('key').limit(1)
      if (error && error.code === 'PGRST204') {
        setTestResult({ success: true, message: 'Connected! Empty project — schema will be created on first use.' })
      } else if (error && (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.code === 'PGRST205' || error.code === '42P01')) {
        setTestResult({ success: true, message: 'Connected! Tables not yet created — schema will be applied automatically.' })
      } else if (error) {
        throw error
      } else {
        setTestResult({ success: true, message: 'Connected! Schema exists.' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      if (msg.includes('does not exist') || msg.includes('relation')) {
        setTestResult({ success: true, message: 'Connected! Empty project — schema will be created on first use.' })
      } else {
        setTestResult({ success: false, message: msg })
      }
    } finally {
      setTesting(false)
    }
  }

  const handleInviteSubmit = async () => {
    const decoded = decodeInvite(inviteCode)
    if (!decoded) {
      setInviteError('Invalid invite code. Ask your admin for a new one.')
      return
    }

    // Test connection first
    setInviteTesting(true)
    setInviteError(null)
    setInviteTestResult(null)
    try {
      const client = createClient(decoded.url, decoded.anonKey)
      const { error } = await client.from('app_settings').select('key').limit(1)
      if (error && !['PGRST204', 'PGRST116', 'PGRST205', '42P01'].includes(error.code || '') && !error.message?.includes('does not exist')) {
        throw error
      }
      setInviteTestResult({ success: true, message: 'Connected!' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      if (!msg.includes('does not exist') && !msg.includes('relation')) {
        setInviteError(`Connection failed: ${msg}`)
        setInviteTesting(false)
        return
      }
    }
    setInviteTesting(false)

    // Save config
    setInviteSaving(true)
    try {
      const api = getElectronAPI()
      if (api) {
        const envKey = decoded.env === 'test' ? 'test' : 'prod'
        const envConfig: Record<string, string> = { url: decoded.url, anonKey: decoded.anonKey }
        if (decoded.serviceKey) envConfig.serviceKey = decoded.serviceKey
        await api.config.save({
          supabase: {
            [envKey]: envConfig,
          },
          activeEnv: envKey,
        })
      }
      onComplete()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to save config')
    } finally {
      setInviteSaving(false)
    }
  }

  const handleManualSave = async () => {
    setSaving(true)
    try {
      const api = getElectronAPI()
      if (api) {
        await api.config.save({
          supabase: {
            prod: { url: prodUrl, anonKey: prodAnonKey, serviceKey: prodServiceKey },
            ...(testUrl && testAnonKey ? { test: { url: testUrl, anonKey: testAnonKey, serviceKey: testServiceKey } } : {}),
          },
          activeEnv: 'prod',
          bootstrapAdmin,
        })
      }
      onComplete()
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Choose mode ────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md mx-auto p-8">
          <div className="text-center mb-8">
            <Database className="w-12 h-12 mx-auto text-primary mb-3" />
            <h1 className="text-2xl font-bold">Welcome to OTS</h1>
            <p className="text-muted text-sm mt-1">How would you like to get started?</p>
          </div>

          <div className="space-y-3">
            <button onClick={() => setMode('invite')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/50 cursor-pointer transition-colors text-left">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">I have an invite code</p>
                <p className="text-xs text-muted mt-0.5">Your admin shared a code or link with you</p>
              </div>
            </button>

            <button onClick={() => setMode('manual')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/50 cursor-pointer transition-colors text-left">
              <div className="p-2.5 rounded-lg bg-muted-foreground/10">
                <Settings2 className="w-5 h-5 text-muted" />
              </div>
              <div>
                <p className="text-sm font-semibold">Set up manually</p>
                <p className="text-xs text-muted mt-0.5">Configure database credentials yourself (admin)</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Invite code entry ──────────────────────────────────
  if (mode === 'invite') {
    const decoded = inviteCode ? decodeInvite(inviteCode) : null
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md mx-auto p-8">
          <div className="text-center mb-8">
            <KeyRound className="w-12 h-12 mx-auto text-primary mb-3" />
            <h1 className="text-2xl font-bold">Enter Invite Code</h1>
            <p className="text-muted text-sm mt-1">Paste the code your admin shared with you</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Invite Code</label>
              <textarea placeholder="Paste invite code here..."
                value={inviteCode} onChange={e => { setInviteCode(e.target.value); setInviteError(null); setInviteTestResult(null) }}
                rows={3}
                className="w-full mt-1 px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background resize-none" />
            </div>

            {decoded && (
              <div className="rounded-lg bg-background p-3 text-xs space-y-1">
                <p><strong>Database:</strong> {decoded.url}</p>
                <p><strong>Environment:</strong> <span className={decoded.env === 'prod' ? 'text-destructive' : 'text-warning'}>{decoded.env.toUpperCase()}</span></p>
              </div>
            )}

            {inviteTestResult && (
              <div className={`flex items-center gap-2 text-sm ${inviteTestResult.success ? 'text-success' : 'text-destructive'}`}>
                <CheckCircle className="w-4 h-4" /> {inviteTestResult.message}
              </div>
            )}

            {inviteError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="w-4 h-4" /> {inviteError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => { setMode('choose'); setInviteCode(''); setInviteError(null) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleInviteSubmit}
                disabled={!inviteCode.trim() || inviteSaving || inviteTesting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                {(inviteSaving || inviteTesting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {inviteTesting ? 'Connecting...' : inviteSaving ? 'Saving...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Manual setup (admin) ───────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-lg mx-auto p-8">
        <div className="text-center mb-8">
          <Database className="w-12 h-12 mx-auto text-primary mb-3" />
          <h1 className="text-2xl font-bold">OTS Setup</h1>
          <p className="text-muted text-sm mt-1">Configure your database connection</p>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-2.5 h-2.5 rounded-full ${step === s ? 'bg-primary' : step > s ? 'bg-success' : 'bg-border'}`} />
          ))}
        </div>

        {/* Step 1: Production DB */}
        {step === 1 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Production Database</h2>
              <button onClick={() => { setMode('choose') }}
                className="text-xs text-muted hover:text-foreground cursor-pointer">
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />Back to start
              </button>
            </div>
            <p className="text-xs text-muted">Enter your Supabase Cloud project credentials. Find them at Settings → API in the Supabase dashboard.</p>
            <div>
              <label className="text-sm font-medium">Project URL</label>
              <input type="text" placeholder="https://xxxxx.supabase.co"
                value={prodUrl} onChange={e => setProdUrl(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Anon Key (public)</label>
              <input type="text" placeholder="eyJhbGciOiJIUzI1NiIs..."
                value={prodAnonKey} onChange={e => setProdAnonKey(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono text-xs" />
            </div>
            <div>
              <label className="text-sm font-medium">Service Role Key (private — for backend)</label>
              <input type="password" placeholder="eyJhbGciOiJIUzI1NiIs..."
                value={prodServiceKey} onChange={e => setProdServiceKey(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono text-xs" />
              <p className="text-[10px] text-muted mt-1">Used by the backend for scanning, Drive, email. Never shared with the browser.</p>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => testConnection(prodUrl, prodAnonKey)}
                disabled={!prodUrl || !prodAnonKey || testing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer disabled:opacity-50">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Test Connection
              </button>
              <button onClick={() => { setTestResult(null); setStep(2) }}
                disabled={!prodUrl || !prodAnonKey}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Test DB (optional) */}
        {step === 2 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-medium">Test Database <span className="text-xs text-muted font-normal">(optional)</span></h2>
            <p className="text-xs text-muted">Configure a separate Supabase project for testing. You can skip this and add it later in Settings.</p>
            <div>
              <label className="text-sm font-medium">Test Project URL</label>
              <input type="text" placeholder="https://xxxxx.supabase.co"
                value={testUrl} onChange={e => setTestUrl(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Test Anon Key</label>
              <input type="text" placeholder="eyJhbGciOiJIUzI1NiIs..."
                value={testAnonKey} onChange={e => setTestAnonKey(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono text-xs" />
            </div>
            <div>
              <label className="text-sm font-medium">Test Service Role Key</label>
              <input type="password" placeholder="eyJhbGciOiJIUzI1NiIs..."
                value={testServiceKey} onChange={e => setTestServiceKey(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono text-xs" />
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => { setTestResult(null); setStep(1) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              {testUrl && testAnonKey && (
                <button onClick={() => testConnection(testUrl, testAnonKey)}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer disabled:opacity-50">
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Test
                </button>
              )}
              <button onClick={() => { setTestResult(null); setStep(3) }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer">
                {testUrl ? 'Next' : 'Skip'} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Admin email + save */}
        {step === 3 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-medium">Admin Account</h2>
            <p className="text-xs text-muted">The bootstrap admin email will be the first admin user when signing in.</p>
            <div>
              <label className="text-sm font-medium">Admin Email (Google account)</label>
              <input type="email" placeholder="your.email@gmail.com"
                value={bootstrapAdmin} onChange={e => setBootstrapAdmin(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background" />
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-background p-3 space-y-1 text-xs">
              <p><strong>Production:</strong> {prodUrl || 'Not set'}</p>
              {testUrl && <p><strong>Test:</strong> {testUrl}</p>}
              <p><strong>Admin:</strong> {bootstrapAdmin || 'Not set'}</p>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-success' : 'text-destructive'}`}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => { setTestResult(null); setStep(2) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleManualSave}
                disabled={saving || !bootstrapAdmin}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save & Start
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
