/**
 * Electron compatibility layer.
 * Detects whether running in Electron or browser.
 * Provides typed access to window.electronAPI.
 */

export const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

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
}

export function getElectronAPI(): ElectronAPI | null {
  if (isElectron) {
    return (window as any).electronAPI as ElectronAPI
  }
  return null
}
