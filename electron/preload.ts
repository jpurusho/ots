import { contextBridge, ipcRenderer } from 'electron'

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    focus: () => ipcRenderer.invoke('app:focus'),
  },
  backend: {
    getUrl: () => ipcRenderer.invoke('backend:getUrl'),
    getStatus: () => ipcRenderer.invoke('backend:getStatus'),
    restart: () => ipcRenderer.invoke('backend:restart'),
  },
  update: {
    check: () => ipcRenderer.invoke('app:checkForUpdates'),
    download: (url: string) => ipcRenderer.invoke('app:downloadUpdate', url),
    onUpdateAvailable: (cb: (version: string) => void) => {
      const handler = (_e: any, v: string) => cb(v)
      ipcRenderer.on('app:updateAvailable', handler)
      return () => ipcRenderer.removeListener('app:updateAvailable', handler)
    },
    onDownloadProgress: (cb: (progress: { downloaded: number; total: number; percent: number }) => void) => {
      const handler = (_e: any, p: any) => cb(p)
      ipcRenderer.on('app:downloadProgress', handler)
      return () => ipcRenderer.removeListener('app:downloadProgress', handler)
    },
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (partial: any) => ipcRenderer.invoke('config:save', partial),
    hasConfig: () => ipcRenderer.invoke('config:hasConfig'),
    getActiveSupabase: () => ipcRenderer.invoke('config:getActiveSupabase'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
