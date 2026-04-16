/**
 * Local HTTP server for serving the renderer in production Electron.
 * Eliminates file:// protocol issues with Supabase Auth, BrowserRouter, localStorage.
 * Binds to 127.0.0.1 only — not exposed to network.
 *
 * Also handles OAuth callback: when the system browser redirects to
 * /auth/callback?code=xxx, we return a "close this tab" page and
 * tell Electron to navigate the BrowserWindow to pick up the code.
 */

import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'

const PORT = 48600
let server: http.Server | null = null

/** Called when an OAuth callback arrives from the system browser */
let onAuthCallback: ((url: string) => void) | null = null

export function setAuthCallbackHandler(handler: (url: string) => void): void {
  onAuthCallback = handler
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const CLOSE_TAB_HTML = `<!DOCTYPE html>
<html><head><title>OTS</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111827;color:#e5e7eb">
<div style="text-align:center">
<h2>Sign in successful</h2>
<p>You can close this tab and return to the OTS app.</p>
<script>window.close()</script>
</div>
</body></html>`

export function startRendererServer(rendererDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const indexPath = path.join(rendererDir, 'index.html')

    // Read index.html once at startup (reliable with asar, avoids stream issues)
    const indexHtml = fs.readFileSync(indexPath)
    console.log(`[Renderer] index.html loaded (${indexHtml.length} bytes) from ${indexPath}`)

    server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`)
        const filePath = path.join(rendererDir, url.pathname)

        // OAuth callback from system browser: return "close tab" page,
        // forward the code to the Electron BrowserWindow
        if (url.pathname === '/auth/callback' && url.searchParams.has('code')) {
          console.log('[Renderer] OAuth callback received, forwarding to Electron window')
          if (onAuthCallback) {
            onAuthCallback(req.url || '/')
          }
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(CLOSE_TAB_HTML)
          return
        }

        // Serve static files (JS, CSS, SVG, etc.)
        if (url.pathname !== '/' && fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath)
            const ext = path.extname(filePath)
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
            res.end(content)
            return
          } catch {
            // Fall through to SPA fallback
          }
        }

        // SPA fallback: serve index.html for any route
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' })
        res.end(indexHtml)
      } catch (err) {
        console.error('[Renderer] Request error:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
      }
    })

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[Renderer] Serving on http://localhost:${PORT}`)
      resolve(PORT)
    })

    server.on('error', (err) => {
      console.error('[Renderer] Server error:', err)
      reject(err)
    })
  })
}

export function stopRendererServer(): void {
  if (server) {
    server.close()
    server = null
  }
}

export function getRendererPort(): number {
  return PORT
}
