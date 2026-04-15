import { contextBridge, ipcRenderer } from 'electron'

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  },
  backend: {
    getUrl: () => ipcRenderer.invoke('backend:getUrl'),
    getStatus: () => ipcRenderer.invoke('backend:getStatus'),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (partial: any) => ipcRenderer.invoke('config:save', partial),
    hasConfig: () => ipcRenderer.invoke('config:hasConfig'),
    getActiveSupabase: () => ipcRenderer.invoke('config:getActiveSupabase'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
