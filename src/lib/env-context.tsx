import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import { reinitSupabase } from '@/lib/supabase'
import { resetBackendUrl } from '@/lib/backend'

type EnvMode = 'prod' | 'test'

interface EnvState {
  activeEnv: EnvMode
  hasTestDb: boolean
  hasProdDb: boolean
  switching: boolean
  switchEnvironment: (env: EnvMode) => Promise<void>
}

const EnvContext = createContext<EnvState>({
  activeEnv: 'prod',
  hasTestDb: false,
  hasProdDb: false,
  switching: false,
  switchEnvironment: async () => {},
})

export function EnvProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [activeEnv, setActiveEnv] = useState<EnvMode>('prod')
  const [hasTestDb, setHasTestDb] = useState(false)
  const [hasProdDb, setHasProdDb] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    const api = getElectronAPI()
    if (!api) return

    api.config.get().then(config => {
      const hasProd = !!(config.supabase?.prod?.url && config.supabase?.prod?.anonKey)
      const hasTest = !!(config.supabase?.test?.url && config.supabase?.test?.anonKey)
      setHasProdDb(hasProd)
      setHasTestDb(hasTest)

      // Auto-correct: if activeEnv points to an env with no credentials, fall back
      let env: EnvMode = config.activeEnv || 'prod'
      if (env === 'prod' && !hasProd && hasTest) env = 'test'
      else if (env === 'test' && !hasTest && hasProd) env = 'prod'
      setActiveEnv(env)

      // Persist correction if needed
      if (env !== config.activeEnv) api.config.save({ activeEnv: env })
    })
  }, [])

  const switchEnvironment = async (env: EnvMode) => {
    if (!isElectron || env === activeEnv) return

    const api = getElectronAPI()
    if (!api) return

    setSwitching(true)
    try {
      // Update config
      await api.config.save({ activeEnv: env })

      // Get new Supabase credentials
      const config = await api.config.getActiveSupabase()
      if (!config) throw new Error('No config for ' + env)

      // Reinit Supabase client (signs out old session)
      await reinitSupabase(config.url, config.anonKey)

      // Clear all cached queries
      queryClient.clear()

      // Restart backend with new env credentials
      resetBackendUrl()
      if (api.backend.restart) {
        await api.backend.restart()
      }

      setActiveEnv(env)

      // Reload the page to restart everything cleanly
      window.location.reload()
    } catch (err) {
      console.error('[Env] Switch failed:', err)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <EnvContext.Provider value={{ activeEnv, hasTestDb, hasProdDb, switching, switchEnvironment }}>
      {children}
    </EnvContext.Provider>
  )
}

export function useEnv() {
  return useContext(EnvContext)
}
