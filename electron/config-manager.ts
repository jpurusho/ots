import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceKey?: string
}

export interface OTSConfig {
  supabase: {
    prod?: SupabaseConfig
    test?: SupabaseConfig
  }
  activeEnv: 'prod' | 'test'
  bootstrapAdmin?: string
  theme?: 'light' | 'dark' | 'system'
}

const CONFIG_DIR = path.join(app.getPath('home'), '.ots')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: OTSConfig = {
  supabase: {},
  activeEnv: 'prod',
  bootstrapAdmin: '',
  theme: 'system',
}

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function loadConfig(): OTSConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const saved = JSON.parse(raw)
      return { ...DEFAULT_CONFIG, ...saved }
    }
  } catch (err) {
    console.error('[Config] Failed to load:', err)
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(partial: Partial<OTSConfig>): OTSConfig {
  const current = loadConfig()
  const merged = { ...current, ...partial }
  if (partial.supabase) {
    merged.supabase = { ...current.supabase, ...partial.supabase }
  }
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 })
  } catch (err) {
    console.error('[Config] Failed to save:', err)
  }
  return merged
}

export function hasConfig(): boolean {
  const config = loadConfig()
  return !!(config.supabase.prod?.url && config.supabase.prod?.anonKey)
}

export function getActiveSupabase(): SupabaseConfig | null {
  const config = loadConfig()
  return config.supabase[config.activeEnv] || null
}

export function getServiceKey(): string {
  const config = loadConfig()
  const active = config.supabase[config.activeEnv]
  return active?.serviceKey || ''
}
