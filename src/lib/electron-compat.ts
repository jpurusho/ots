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
    focus: () => Promise<void>
  }
  update: {
    check: () => Promise<{ status: string; version?: string; url?: string; notes?: string; message?: string }>
    download: (url: string) => Promise<{ success: boolean; path?: string; size?: number }>
    onUpdateAvailable: (cb: (version: string) => void) => () => void
    onDownloadProgress: (cb: (progress: { downloaded: number; total: number; percent: number }) => void) => () => void
  }
  backend: {
    getUrl: () => Promise<string>
    getStatus: () => Promise<{ status: string; scanner?: string }>
    restart: () => Promise<{ url: string }>
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
