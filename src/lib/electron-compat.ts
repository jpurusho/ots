/**
 * Electron compatibility layer.
 * Detects whether running in Electron or browser.
 * Provides typed access to window.electronAPI.
 */

export const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

interface SupabaseConfig {
  url: string
  anonKey: string
  serviceKey?: string
}

interface OTSConfig {
  supabase: {
    prod?: SupabaseConfig
    test?: SupabaseConfig
  }
  activeEnv: 'prod' | 'test'
  bootstrapAdmin?: string
  theme?: 'light' | 'dark' | 'system'
}

interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
    openExternal: (url: string) => Promise<void>
  }
  backend: {
    getUrl: () => Promise<string>
    getStatus: () => Promise<{ status: string; scanner?: string }>
  }
  config: {
    get: () => Promise<OTSConfig>
    save: (partial: Partial<OTSConfig>) => Promise<OTSConfig>
    hasConfig: () => Promise<boolean>
    getActiveSupabase: () => Promise<SupabaseConfig | null>
  }
}

export function getElectronAPI(): ElectronAPI | null {
  if (isElectron) {
    return (window as any).electronAPI as ElectronAPI
  }
  return null
}
