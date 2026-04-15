import { app, ipcMain, shell } from 'electron'
import { getBackendUrl } from './backend-manager'
import { loadConfig, saveConfig, hasConfig, getActiveSupabase } from './config-manager'

export function registerIpcHandlers(): void {
  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getPlatform', () => process.platform)
  ipcMain.handle('app:openExternal', (_event, url: string) => shell.openExternal(url))

  // Backend
  ipcMain.handle('backend:getUrl', () => getBackendUrl())
  ipcMain.handle('backend:getStatus', async () => {
    const url = getBackendUrl()
    if (!url) return { status: 'stopped' }
    try {
      const http = require('http') as typeof import('http')
      return new Promise((resolve) => {
        http.get(`${url}/health`, (res: any) => {
          let data = ''
          res.on('data', (chunk: string) => { data += chunk })
          res.on('end', () => {
            try { resolve(JSON.parse(data)) }
            catch { resolve({ status: 'unknown' }) }
          })
        }).on('error', () => resolve({ status: 'error' }))
      })
    } catch {
      return { status: 'error' }
    }
  })

  // Update check (manual, via GitHub API — works for unsigned apps)
  ipcMain.handle('app:checkForUpdates', async () => {
    const currentVersion = app.getVersion()
    try {
      const https = require('https') as typeof import('https')
      const release: any = await new Promise((resolve, reject) => {
        https.get({
          hostname: 'api.github.com',
          path: '/repos/jpurusho/ots/releases/latest',
          headers: { 'User-Agent': 'ots-updater' },
        }, (res: any) => {
          let data = ''
          res.on('data', (chunk: string) => { data += chunk })
          res.on('end', () => {
            if (res.statusCode === 200) resolve(JSON.parse(data))
            else if (res.statusCode === 404) reject(new Error('No releases found'))
            else reject(new Error(`HTTP ${res.statusCode}`))
          })
        }).on('error', (err: any) => reject(err))
      })
      const latestVersion = release.tag_name?.replace(/^v/, '') || ''
      const current = currentVersion.split('.').map(Number)
      const latest = latestVersion.split('.').map(Number)
      const isNewer = latest[0] > current[0]
        || (latest[0] === current[0] && latest[1] > current[1])
        || (latest[0] === current[0] && latest[1] === current[1] && latest[2] > current[2])
      if (isNewer) {
        return { status: 'available', version: latestVersion, url: release.html_url, notes: release.body }
      }
      return { status: 'latest', version: currentVersion }
    } catch (err: any) {
      return { status: 'error', message: err?.message || 'Check failed' }
    }
  })

  // Config
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:save', (_event, partial: any) => saveConfig(partial))
  ipcMain.handle('config:hasConfig', () => hasConfig())
  ipcMain.handle('config:getActiveSupabase', () => getActiveSupabase())
}
