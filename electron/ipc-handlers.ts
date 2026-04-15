import { app, ipcMain, shell } from 'electron'
import { getBackendUrl } from './backend-manager'

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
}
