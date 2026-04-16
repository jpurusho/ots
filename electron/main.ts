import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import { startBackend, stopBackend } from './backend-manager'
import { startRendererServer, stopRendererServer, setAuthCallbackHandler } from './renderer-server'
import { registerIpcHandlers } from './ipc-handlers'
import { loadConfig, getServiceKey, getActiveSupabase } from './config-manager'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let rendererPort = 0

function createWindow(): void {
  nativeTheme.themeSource = 'dark'

  mainWindow = new BrowserWindow({
    title: 'OTS',
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, '../resources/icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#111827',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL(`http://localhost:${rendererPort}`)
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function setupAutoUpdater(): void {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'jpurusho',
    repo: 'ots',
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[Update] New version available: ${info.version}`)
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:updateAvailable', info.version)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Update] Downloaded: ${info.version}`)
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:updateReady', info.version)
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[Update] Error:', err?.message)
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[Update] Check failed:', err?.message)
  })
}

app.setName('OTS')

app.whenReady().then(async () => {
  registerIpcHandlers()
  createMenu()

  // In production, serve renderer via local HTTP server (avoids file:// issues)
  if (!isDev) {
    const rendererDir = path.join(__dirname, '../../renderer')
    rendererPort = await startRendererServer(rendererDir)

    // When system browser redirects to /auth/callback?code=xxx,
    // forward the code to the Electron window via executeJavaScript.
    // This avoids a full page navigation — the Supabase client in the
    // Electron window has the PKCE code_verifier in its localStorage.
    setAuthCallbackHandler((callbackUrl) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const parsed = new URL(callbackUrl, `http://localhost:${rendererPort}`)
        const code = parsed.searchParams.get('code')
        if (code) {
          console.log('[Auth] Received OAuth code, exchanging in Electron window')
          mainWindow.webContents.executeJavaScript(`
            window.__otsAuthCode = ${JSON.stringify(code)};
            window.dispatchEvent(new CustomEvent('ots-auth-callback', { detail: { code: ${JSON.stringify(code)} } }));
          `)
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })
  }

  createWindow()

  // Start Python backend in background
  try {
    const active = getActiveSupabase()
    const serviceKey = getServiceKey()
    const backendEnv: Record<string, string> = {}
    if (active) backendEnv.SUPABASE_URL = active.url
    if (serviceKey) backendEnv.SUPABASE_SERVICE_KEY = serviceKey
    startBackend(backendEnv).catch(err => {
      console.error('[App] Backend failed to start:', err)
    })
  } catch (err) {
    console.error('[App] Backend config error:', err)
  }

  // Auto-update check (production only)
  if (!isDev) {
    setupAutoUpdater()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  stopBackend()
  stopRendererServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
