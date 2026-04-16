# OTS v3 Architecture

## Overview

OTS is a cloud-first, multi-user offering tracking system. It runs as a **web app** (GitHub Pages) or an **Electron desktop app** with a bundled Python backend. All data lives in Supabase Cloud (PostgreSQL + Auth + Storage). The desktop app supports switching between production and test databases.

```mermaid
graph TB
    subgraph Electron["Electron Desktop App"]
        Main["Main Process<br/>(Node.js)"]
        Renderer["Renderer Process<br/>(React)"]
        Preload["Preload Bridge<br/>(IPC)"]
        Backend["Python Backend<br/>(PyInstaller binary)"]
        Config["~/.ots/config.json"]

        Main -->|spawns| Backend
        Main -->|loads| Renderer
        Main -->|reads/writes| Config
        Renderer <-->|contextBridge| Preload
        Preload <-->|ipcRenderer/ipcMain| Main
    end

    subgraph Browser["Web App (GitHub Pages)"]
        WebRenderer["React SPA<br/>(same codebase)"]
        EnvVars[".env / GitHub Vars"]
        WebRenderer -->|reads| EnvVars
    end

    subgraph Supabase["Supabase Cloud"]
        Auth["Auth<br/>(Google OAuth)"]
        DB["PostgreSQL<br/>(offerings, checks,<br/>users, settings)"]
        Storage["Storage<br/>(images, PDFs)"]
    end

    subgraph External["External Services"]
        Claude["Claude AI<br/>(Bedrock / Anthropic)"]
        Drive["Google Drive<br/>(service account)"]
        Gmail["Gmail SMTP"]
    end

    Renderer -->|supabase-js| Supabase
    WebRenderer -->|supabase-js| Supabase
    Backend -->|REST API| DB
    Backend --> Claude
    Backend --> Drive
    Backend --> Gmail
```

## Electron Desktop Architecture

The desktop app wraps the same React frontend in Electron, with a bundled Python backend.

```mermaid
graph LR
    subgraph Startup["App Launch Sequence"]
        direction TB
        A["app.whenReady()"] --> B["registerIpcHandlers()"]
        B --> C["loadConfig()"]
        C --> D["startBackend(env)"]
        D --> E["createWindow()"]
        E --> F{"hasConfig?"}
        F -->|No| G["Setup Wizard"]
        F -->|Yes| H["initSupabase()"]
        H --> I["Google OAuth"]
        I --> J["App Ready"]
        G -->|save config| H
    end
```

### Layer Responsibilities

| Layer | File | Role |
|-------|------|------|
| **Main Process** | `electron/main.ts` | App lifecycle, window creation, auto-updater, menu |
| **Backend Manager** | `electron/backend-manager.ts` | Spawn/kill Python binary, random port, health check |
| **Config Manager** | `electron/config-manager.ts` | Read/write `~/.ots/config.json` (0600 permissions) |
| **IPC Handlers** | `electron/ipc-handlers.ts` | Bridge: backend URL, config, version, update check |
| **Preload** | `electron/preload.ts` | Expose `window.electronAPI` via contextBridge |
| **Renderer** | `src/` (React) | UI — identical code for web and Electron |

### IPC Channels

```
Renderer → Main (invoke/handle):
  backend:getUrl        → returns http://127.0.0.1:{port}
  backend:getStatus     → health check result
  config:get            → full config object
  config:save           → merge + write config
  config:hasConfig      → boolean (prod url + key exist?)
  config:getActiveSupabase → { url, anonKey } for active env
  app:getVersion        → package.json version
  app:openExternal      → shell.openExternal(url)
  app:checkForUpdates   → GitHub API semver check

Main → Renderer (send/on):
  app:updateAvailable   → new version string
  app:updateReady       → downloaded version string
```

## Test/Prod Environment Switching

The desktop app can connect to two separate Supabase Cloud projects (e.g., one for production data, one for testing).

```mermaid
sequenceDiagram
    participant User
    participant Layout as Sidebar Badge
    participant EnvCtx as EnvContext
    participant Config as ConfigManager
    participant Supa as supabase.ts (Proxy)
    participant Backend as Python Backend
    participant TQ as TanStack Query

    User->>Layout: Click "Switch to test"
    Layout->>EnvCtx: switchEnvironment('test')
    EnvCtx->>Config: config:save({ activeEnv: 'test' })
    EnvCtx->>Config: config:getActiveSupabase()
    Config-->>EnvCtx: { url: testUrl, anonKey: testKey }
    EnvCtx->>Supa: reinitSupabase(testUrl, testKey)
    Note over Supa: Signs out old session<br/>Creates new client<br/>Proxy delegates seamlessly
    EnvCtx->>TQ: queryClient.clear()
    EnvCtx->>Backend: resetBackendUrl()
    EnvCtx->>User: window.location.reload()
    Note over User: Page reloads → fresh login<br/>against test database
```

### Config File (`~/.ots/config.json`)

```json
{
  "supabase": {
    "prod": {
      "url": "https://xxx.supabase.co",
      "anonKey": "eyJ...",
      "serviceKey": "eyJ..."
    },
    "test": {
      "url": "https://yyy.supabase.co",
      "anonKey": "eyJ...",
      "serviceKey": "eyJ..."
    }
  },
  "activeEnv": "prod",
  "bootstrapAdmin": "jerome.purushotham@gmail.com",
  "theme": "dark"
}
```

### What Happens on Switch

1. **Config saved** — `activeEnv` flips from `prod` to `test` (or vice versa)
2. **Supabase client reinitialized** — new URL + anon key, old session signed out
3. **Query cache cleared** — TanStack Query cache purged so no stale prod data shows in test
4. **Backend URL reset** — cached port cleared (backend itself doesn't restart; it uses the service key passed at spawn)
5. **Page reloads** — clean state, user must sign in again against the new Supabase project
6. **Badge updates** — sidebar shows red "PROD" or orange "TEST" badge

### Visual Indicator

- **Red badge** = Production (real data)
- **Orange badge** = Test (safe to experiment)
- Admin sees a "Switch to test/prod" button below the badge
- Operators see the badge only (no switch button)

## Supabase Client — Proxy Pattern

The Supabase client uses a Proxy so 15+ files import `{ supabase }` without knowing whether it's been initialized yet.

```mermaid
graph TD
    subgraph Importing Files
        Review["Review.tsx"]
        Offerings["Offerings.tsx"]
        Reports["Reports.tsx"]
        Auth["auth-context.tsx"]
        Others["... 11 more files"]
    end

    subgraph supabase.ts
        Proxy["Proxy object<br/>(exported as 'supabase')"]
        EnsureClient["ensureClient()"]
        RealClient["SupabaseClient instance"]

        Proxy -->|"any property access"| EnsureClient
        EnsureClient -->|"lazy init or return cached"| RealClient
    end

    Review --> Proxy
    Offerings --> Proxy
    Reports --> Proxy
    Auth --> Proxy
    Others --> Proxy

    subgraph Initialization
        BrowserInit["Browser: auto-init from<br/>VITE_SUPABASE_URL env var"]
        ElectronInit["Electron: App.tsx calls<br/>initSupabase(url, key)"]
        Reinit["Env switch: reinitSupabase()<br/>signs out + creates new client"]
    end

    BrowserInit --> RealClient
    ElectronInit --> RealClient
    Reinit --> RealClient
```

**Browser mode:** First property access triggers `ensureClient()`, which reads `VITE_SUPABASE_URL` and auto-creates the client.

**Electron mode:** `App.tsx` fetches config via IPC, calls `initSupabase(url, anonKey)` before rendering. On env switch, `reinitSupabase()` replaces the underlying client — all importing files continue working through the Proxy.

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant React as React App
    participant SupaAuth as Supabase Auth
    participant Google as Google OAuth
    participant DB as app_users table

    User->>React: Click "Sign in with Google"
    React->>SupaAuth: signInWithOAuth({ provider: 'google' })
    SupaAuth->>Google: OAuth redirect (PKCE)
    Google-->>SupaAuth: Auth token
    SupaAuth-->>React: onAuthStateChange(session)

    React->>DB: SELECT * FROM app_users WHERE email = ?

    alt User found + active
        DB-->>React: { role: 'admin' | 'operator' }
        React->>React: Render app
    else No users exist + email = bootstrap admin
        React->>DB: INSERT admin row
        DB-->>React: { role: 'admin' }
        React->>React: Render app (first-time setup)
    else User not found or deactivated
        React-->>User: "Access Denied" screen
    end
```

## Offering Scan Pipeline

```mermaid
sequenceDiagram
    participant User
    participant Upload as Upload Manager
    participant Storage as Supabase Storage
    participant DB as PostgreSQL
    participant Backend as Python Backend
    participant AI as Claude (Bedrock/Anthropic)

    User->>Upload: Drop images / Import from Drive
    Upload->>Upload: Convert HEIC → JPEG (if needed)
    Upload->>Storage: Upload image to offering-images bucket
    Upload->>DB: INSERT offering (status: pending, image_url)
    Upload->>Backend: POST /api/scan { image_url, offering_id }

    Backend->>Storage: Download image
    Backend->>Backend: HEIC → JPEG (safety check)
    Backend->>AI: Send image + structured prompt
    AI-->>Backend: JSON response (denominations, totals, checks)

    Backend->>Backend: Verify totals with Python math
    Backend->>DB: UPDATE offering SET scan_data, amounts, status=pending
    alt Bank checks detected
        Backend->>DB: INSERT offering_checks rows
    end
    Backend-->>Upload: { success, scan_data }
    Upload-->>User: Show in Review page
```

### Scan Data Model

Each offering has independent sections:
- `general_cash` — bills (100x8, 50x2, 20x5, etc.)
- `general_checks` — check amounts with contributor names
- `sunday_school_cash` — Sunday School cash
- `building_fund_checks` — Building Fund checks
- `other_checks` — Miscellaneous

Python recalculates all totals from the denomination data — Claude's arithmetic is never trusted.

## Report Export Pipeline

```mermaid
graph LR
    User -->|"select range + format"| Reports["Reports Page"]
    Reports -->|PDF| PDFGen["Backend: /api/pdf/generate<br/>(ReportLab)"]
    Reports -->|CSV| CSVGen["Browser-side<br/>CSV generation"]
    Reports -->|Email| EmailGen["Backend: /api/email/send<br/>(Gmail SMTP)"]
    Reports -->|Drive| DriveUp["Backend: /api/drive/upload-report"]

    PDFGen --> Download["Download PDF"]
    PDFGen --> DriveUp
    CSVGen --> Download2["Download CSV"]
    EmailGen --> Inbox["Recipient inbox"]
    DriveUp --> GDrive["Google Drive<br/>reports folder"]
```

## Database Schema

```mermaid
erDiagram
    offerings ||--o{ offering_checks : "has checks"
    offerings {
        uuid id PK
        date offering_date
        text image_url
        text status "pending | approved"
        jsonb scan_data
        numeric general_cash
        numeric general_checks_total
        numeric sunday_school
        numeric building_fund
        numeric other
        numeric total_amount
        boolean is_manual_entry
        timestamp created_at
    }
    offering_checks {
        uuid id PK
        uuid offering_id FK
        text contributor_name
        numeric amount
        integer check_number
        text fund_type
        date check_date
    }
    app_users {
        uuid id PK
        uuid auth_user_id
        text email
        text name
        text role "admin | operator"
        boolean is_active
        timestamp last_login
    }
    app_settings {
        uuid id PK
        text key UK
        text value
    }
    activity_log {
        uuid id PK
        text action
        text details
        text user_email
        timestamp created_at
    }
```

All tables have Row Level Security (RLS) — authenticated users can CRUD their data. Admin-only restrictions enforced in the frontend.

## Deployment Modes

```mermaid
graph TB
    subgraph Web["Web App (Browser)"]
        GHP["GitHub Pages<br/>jpurusho.github.io/ots"]
        GHA["GitHub Actions<br/>(auto-deploy on push)"]
        ViteEnv["Env vars from<br/>GitHub repo vars"]
        GHA -->|"npm run build"| GHP
        ViteEnv --> GHA
    end

    subgraph Desktop["Electron Desktop App"]
        Zip["OTS.app (zip)"]
        PyBin["Bundled ots-backend<br/>(PyInstaller)"]
        ConfigFile["~/.ots/config.json<br/>(no .env needed)"]
        Zip --- PyBin
        Zip --- ConfigFile
    end

    subgraph CI["CI/CD"]
        TagPush["git push tag v*"]
        ReleaseWF["release.yml workflow"]
        GHRelease["GitHub Release<br/>(zip artifact)"]
        TagPush --> ReleaseWF
        ReleaseWF -->|"build backend + electron"| GHRelease
    end

    subgraph Update["Auto-Update"]
        AppStart["App launches"]
        CheckAPI["GitHub Releases API"]
        Download["Download + install"]
        AppStart --> CheckAPI
        CheckAPI -->|"newer version"| Download
    end
```

### Development
```bash
npx supabase start              # Local Supabase (Docker)
cd backend && uvicorn main:app  # Python backend on :8000
npm run dev                     # Vite dev server on :5173
npm run dev:electron            # All of the above + Electron window
```

### Production Build
```bash
make build          # Build backend binary + Electron app
make build-run      # Build + launch locally
make build-push     # Build + tag + push GitHub release
```

### Web Deployment
Automatic on push to `main` via `.github/workflows/deploy.yml`. Builds React SPA, deploys to GitHub Pages at `/ots/`.

### Desktop Release
On push of a `v*` tag via `.github/workflows/release.yml`. Builds Python backend (PyInstaller) + Electron app on macOS, uploads zip to GitHub Releases.

## Cost

| Service | Cost |
|---------|------|
| Supabase Cloud (prod) | Free (500MB DB, 1GB storage) |
| Supabase Cloud (test) | Free (second project) |
| GitHub Pages | Free |
| GitHub Actions | Free (2000 min/month) |
| AI Scanning | Bedrock (dev, free) / Anthropic (~$0.01/scan) |

## Version History

- **v3.0.0** — Electron desktop app, bundled backend, config GUI, test/prod switching, light/dark theme, auto-update
- **v2.1.0** — Drive import, email, PDF reports, calendar view, expression parser, HEIC conversion
- **v2.0.0** — Cloud-first architecture with Supabase
- **v1.x** — Local-first with SQLite + PIN auth + Google Drive sync (see [ots-v0](https://github.com/jpurusho/ots-v0))
