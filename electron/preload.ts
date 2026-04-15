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
}

contextBridge.exposeInMainWorld('electronAPI', api)
