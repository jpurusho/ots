import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
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

/** Check for updates via GitHub API on launch, notify renderer if available */
async function checkForUpdatesOnLaunch(): Promise<void> {
  try {
    const https = await import('https')
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
          else reject(new Error(`HTTP ${res.statusCode}`))
        })
      }).on('error', reject)
    })
    const latestVersion = release.tag_name?.replace(/^v/, '') || ''
    const current = app.getVersion().split('.').map(Number)
    const latest = latestVersion.split('.').map(Number)
    const isNewer = latest[0] > current[0]
      || (latest[0] === current[0] && latest[1] > current[1])
      || (latest[0] === current[0] && latest[1] === current[1] && latest[2] > current[2])
    if (isNewer) {
      console.log(`[Update] New version available: ${latestVersion}`)
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('app:updateAvailable', latestVersion)
      }
    }
  } catch (err: any) {
    console.error('[Update] Check failed:', err?.message)
  }
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

  // Check for updates (production only)
  if (!isDev) {
    checkForUpdatesOnLaunch()
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
