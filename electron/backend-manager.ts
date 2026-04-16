import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as net from 'net'
import * as http from 'http'

const isDev = !app.isPackaged
let backendProcess: ChildProcess | null = null
let backendPort: number = 0

/**
 * Find a random available port
 */
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Could not find available port')))
      }
    })
    server.on('error', reject)
  })
}

/**
 * Poll the backend health endpoint until it responds
 */
function waitForHealth(port: number, maxRetries: number = 60): Promise<boolean> {
  return new Promise((resolve) => {
    let retries = 0
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true)
        } else if (retries < maxRetries) {
          retries++
          setTimeout(check, 500)
        } else {
          resolve(false)
        }
      })
      req.on('error', () => {
        if (retries < maxRetries) {
          retries++
          setTimeout(check, 500)
        } else {
          resolve(false)
        }
      })
      req.setTimeout(1000, () => {
        req.destroy()
        if (retries < maxRetries) {
          retries++
          setTimeout(check, 500)
        } else {
          resolve(false)
        }
      })
    }
    check()
  })
}

/**
 * Start the Python backend
 */
export async function startBackend(env?: Record<string, string>): Promise<number> {
  if (backendProcess) {
    console.log('[Backend] Already running on port', backendPort)
    return backendPort
  }

  backendPort = await findAvailablePort()
  console.log(`[Backend] Starting on port ${backendPort}...`)

  const spawnEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PYTHONUNBUFFERED: '1',
    // pyiceberg (transitive dep of storage3) needs a valid HOME and config dir
    PYICEBERG_HOME: app.getPath('temp'),
    HOME: process.env.HOME || app.getPath('home'),
    ...(env || {}),
  }

  if (isDev) {
    // Dev mode: run from source with Python
    // __dirname is dist/electron/electron/ — go up to project root
    const projectRoot = path.join(__dirname, '..', '..', '..')
    const backendDir = path.join(projectRoot, 'backend')
    const venvPython = path.join(backendDir, '.venv', 'bin', 'python')

    backendProcess = spawn(venvPython, [
      '-m', 'uvicorn', 'main:app',
      '--host', '127.0.0.1',
      '--port', String(backendPort),
    ], {
      cwd: backendDir,
      env: spawnEnv,
    })
  } else {
    // Production: run PyInstaller binary from resources
    const binaryName = process.platform === 'win32' ? 'ots-backend.exe' : 'ots-backend'
    const binaryPath = path.join(process.resourcesPath, binaryName)

    backendProcess = spawn(binaryPath, [
      '--host', '127.0.0.1',
      '--port', String(backendPort),
    ], {
      env: spawnEnv,
    })
  }

  // Log backend output
  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Backend] ${data.toString().trim()}`)
  })
  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[Backend] ${data.toString().trim()}`)
  })
  backendProcess.on('exit', (code) => {
    console.log(`[Backend] Process exited with code ${code}`)
    backendProcess = null
  })

  // Wait for health check
  const healthy = await waitForHealth(backendPort)
  if (!healthy) {
    console.error('[Backend] Failed to start (health check timeout)')
    stopBackend()
    throw new Error('Backend failed to start')
  }

  console.log(`[Backend] Ready on port ${backendPort}`)
  return backendPort
}

/**
 * Stop the Python backend
 */
export function stopBackend(): void {
  if (!backendProcess) return

  console.log('[Backend] Stopping...')
  const pid = backendProcess.pid

  try {
    backendProcess.kill('SIGTERM')
  } catch {
    // Process may already be dead
  }

  // Force kill after 3 seconds if still running
  setTimeout(() => {
    try {
      if (pid) process.kill(pid, 'SIGKILL')
    } catch {
      // Already dead
    }
  }, 3000)

  backendProcess = null
}

/**
 * Get the running backend port
 */
export function getBackendPort(): number {
  return backendPort
}

/**
 * Get the full backend URL
 */
export function getBackendUrl(): string {
  return backendPort ? `http://127.0.0.1:${backendPort}` : ''
}
