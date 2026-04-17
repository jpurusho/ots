import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { getBackendUrl, stopBackend, startBackend } from './backend-manager'
import { loadConfig, saveConfig, hasConfig, getActiveSupabase, getServiceKey } from './config-manager'

export function registerIpcHandlers(): void {
  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getPlatform', () => process.platform)
  ipcMain.handle('app:openExternal', (_event, url: string) => shell.openExternal(url))
  ipcMain.handle('app:focus', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) { win.show(); win.focus() }
  })

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

  // Download update zip with progress
  ipcMain.handle('app:downloadUpdate', async (_event, downloadUrl: string) => {
    const https = require('https') as typeof import('https')
    const os = require('os') as typeof import('os')
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const dir = path.join(os.homedir(), 'Downloads')
    const fileName = downloadUrl.split('/').pop() || 'OTS-update.zip'
    const destPath = path.join(dir, fileName)

    return new Promise((resolve, reject) => {
      const follow = (url: string) => {
        https.get(url, { headers: { 'User-Agent': 'ots-updater' } }, (res: any) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return follow(res.headers.location)
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          }
          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let downloaded = 0
          const file = fs.createWriteStream(destPath)
          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) {
                win.webContents.send('app:downloadProgress', {
                  downloaded, total: totalBytes,
                  percent: totalBytes ? Math.round((downloaded / totalBytes) * 100) : 0,
                })
              }
            }
          })
          res.pipe(file)
          file.on('finish', () => { file.close(); resolve({ success: true, path: destPath, size: downloaded }) })
          file.on('error', (err: any) => { fs.unlinkSync(destPath); reject(err) })
        }).on('error', reject)
      }
      follow(downloadUrl)
    })
  })

  // Restart backend with new env credentials
  ipcMain.handle('backend:restart', async () => {
    stopBackend()
    const active = getActiveSupabase()
    const serviceKey = getServiceKey()
    const backendEnv: Record<string, string> = {}
    if (active) backendEnv.SUPABASE_URL = active.url
    if (serviceKey) backendEnv.SUPABASE_SERVICE_KEY = serviceKey
    await startBackend(backendEnv)
    return { url: getBackendUrl() }
  })
}
