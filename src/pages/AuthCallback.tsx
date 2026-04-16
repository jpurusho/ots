import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import { Loader2 } from 'lucide-react'

/**
 * Handles the OAuth PKCE callback.
 * Supabase redirects here with ?code=xxx after Google auth.
 * We exchange the code for a session, then navigate to the app.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setError('No authorization code received')
      return
    }

    supabase.auth.exchangeCodeForSession(code)
      .then(({ error: authError }) => {
        if (authError) {
          setError(authError.message)
        } else {
          // Bring Electron window to front (auth happened in system browser)
          if (isElectron) {
            getElectronAPI()?.app.focus?.()
          }
          navigate('/', { replace: true })
        }
      })
  }, [searchParams, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm p-8">
          <h2 className="text-xl font-bold text-destructive mb-2">Authentication Failed</h2>
          <p className="text-muted text-sm mb-4">{error}</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-muted text-sm">Completing sign in...</p>
      </div>
    </div>
  )
}
