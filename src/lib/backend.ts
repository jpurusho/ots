/**
 * Centralized backend URL resolution.
 * - In Electron: gets the URL from IPC (dynamically assigned port)
 * - In browser: uses VITE_BACKEND_URL env var or defaults to localhost:8000
 */

import { getElectronAPI } from '@/lib/electron-compat'

let cachedUrl: string | null = null

export async function getBackendUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl

  const api = getElectronAPI()
  if (api) {
    const url = await api.backend.getUrl()
    if (url) {
      cachedUrl = url
      return url
    }
    return '' // Backend not ready yet
  }

  // Browser fallback
  cachedUrl = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'
  return cachedUrl
}

/**
 * Reset cached URL (needed when backend restarts, e.g., on env switch)
 */
export function resetBackendUrl(): void {
  cachedUrl = null
}
