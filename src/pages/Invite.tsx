import { useState } from 'react'
import { Download, Copy, Check, Terminal, Rocket } from 'lucide-react'

/** Decode invite code from URL hash */
function decodeInvite(hash: string): { url: string; env: string } | null {
  try {
    const code = hash.replace('#', '')
    if (!code) return null
    const json = JSON.parse(atob(code))
    if (json.url && json.app === 'ots') {
      return { url: json.url, env: json.env || 'prod' }
    }
  } catch { /* invalid */ }
  return null
}

export function InvitePage() {
  const [copied, setCopied] = useState(false)
  const inviteCode = window.location.hash.replace('#', '')
  const decoded = decodeInvite(window.location.hash)

  // Get latest release URL
  const downloadUrl = 'https://github.com/jpurusho/ots/releases/latest'

  const copyCode = async () => {
    if (inviteCode) {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <Rocket className="w-12 h-12 mx-auto text-primary mb-3" />
          <h1 className="text-2xl font-bold">You're Invited to OTS</h1>
          <p className="text-muted text-sm mt-1">Offering Tracking System</p>
          {decoded && (
            <p className="mt-2 text-xs">
              Environment: <span className={`font-semibold ${decoded.env === 'prod' ? 'text-destructive' : 'text-warning'}`}>{decoded.env.toUpperCase()}</span>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          {/* Step 1: Download */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Download OTS</p>
              <p className="text-xs text-muted mt-0.5">Get the latest release from GitHub</p>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                <Download className="w-4 h-4" /> Download
              </a>
            </div>
          </div>

          {/* Step 2: Unzip + xattr */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Install</p>
              <p className="text-xs text-muted mt-0.5">Unzip the download, then run this command in Terminal:</p>
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border font-mono text-xs">
                <Terminal className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                <code className="flex-1">xattr -rc OTS.app</code>
              </div>
              <p className="text-xs text-muted mt-1">Then move OTS.app to your Applications folder.</p>
            </div>
          </div>

          {/* Step 3: Launch + paste code */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Launch & Connect</p>
              <p className="text-xs text-muted mt-0.5">Open OTS, choose "I have an invite code", and paste this code:</p>
              {inviteCode && (
                <div className="mt-2">
                  <div className="flex gap-2">
                    <input type="text" readOnly value={inviteCode}
                      className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background truncate" />
                    <button onClick={copyCode}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 cursor-pointer">
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Sign in */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
            <div className="flex-1">
              <p className="text-sm font-medium">Sign in with Google</p>
              <p className="text-xs text-muted mt-0.5">Use the Google account your admin registered for you.</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Questions? Contact your OTS administrator.
        </p>
      </div>
    </div>
  )
}
