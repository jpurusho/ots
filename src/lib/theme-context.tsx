import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ThemeColors {
  background: string
  foreground: string
  card: string
  'card-foreground': string
  primary: string
  'primary-foreground': string
  muted: string
  'muted-foreground': string
  border: string
  destructive: string
  success: string
  warning: string
}

export interface ThemePreset {
  label: string
  dark: boolean
  colors: ThemeColors
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  default: {
    label: 'Default',
    dark: true,
    colors: {
      background: '#111827', foreground: '#f9fafb',
      card: '#1f2937', 'card-foreground': '#f9fafb',
      primary: '#818cf8', 'primary-foreground': '#ffffff',
      muted: '#9ca3af', 'muted-foreground': '#6b7280',
      border: '#374151',
      destructive: '#f87171', success: '#4ade80', warning: '#fbbf24',
    },
  },
  midnight: {
    label: 'Midnight',
    dark: true,
    colors: {
      background: '#020617', foreground: '#e2e8f0',
      card: '#0f172a', 'card-foreground': '#e2e8f0',
      primary: '#60a5fa', 'primary-foreground': '#ffffff',
      muted: '#94a3b8', 'muted-foreground': '#64748b',
      border: '#1e293b',
      destructive: '#fb7185', success: '#34d399', warning: '#fbbf24',
    },
  },
  ocean: {
    label: 'Ocean',
    dark: true,
    colors: {
      background: '#042f2e', foreground: '#ccfbf1',
      card: '#134e4a', 'card-foreground': '#ccfbf1',
      primary: '#22d3ee', 'primary-foreground': '#ffffff',
      muted: '#99f6e4', 'muted-foreground': '#5eead4',
      border: '#115e59',
      destructive: '#fb7185', success: '#4ade80', warning: '#fbbf24',
    },
  },
  forest: {
    label: 'Forest',
    dark: true,
    colors: {
      background: '#052e16', foreground: '#dcfce7',
      card: '#14532d', 'card-foreground': '#dcfce7',
      primary: '#4ade80', 'primary-foreground': '#052e16',
      muted: '#86efac', 'muted-foreground': '#4ade80',
      border: '#166534',
      destructive: '#fca5a5', success: '#86efac', warning: '#fde68a',
    },
  },
  rose: {
    label: 'Rose',
    dark: true,
    colors: {
      background: '#1c1017', foreground: '#fce7f3',
      card: '#2a1520', 'card-foreground': '#fce7f3',
      primary: '#fb7185', 'primary-foreground': '#ffffff',
      muted: '#f9a8d4', 'muted-foreground': '#ec4899',
      border: '#3b1a2a',
      destructive: '#fca5a5', success: '#86efac', warning: '#fde68a',
    },
  },
  amber: {
    label: 'Amber',
    dark: true,
    colors: {
      background: '#1c1917', foreground: '#fef3c7',
      card: '#292524', 'card-foreground': '#fef3c7',
      primary: '#fbbf24', 'primary-foreground': '#1c1917',
      muted: '#d6d3d1', 'muted-foreground': '#a8a29e',
      border: '#44403c',
      destructive: '#fca5a5', success: '#86efac', warning: '#fde68a',
    },
  },
  lavender: {
    label: 'Lavender',
    dark: false,
    colors: {
      background: '#f5f3ff', foreground: '#1e1b4b',
      card: '#ffffff', 'card-foreground': '#1e1b4b',
      primary: '#8b5cf6', 'primary-foreground': '#ffffff',
      muted: '#7c3aed', 'muted-foreground': '#a78bfa',
      border: '#ddd6fe',
      destructive: '#ef4444', success: '#22c55e', warning: '#f59e0b',
    },
  },
  slate: {
    label: 'Slate',
    dark: false,
    colors: {
      background: '#f8fafc', foreground: '#0f172a',
      card: '#ffffff', 'card-foreground': '#0f172a',
      primary: '#475569', 'primary-foreground': '#ffffff',
      muted: '#64748b', 'muted-foreground': '#94a3b8',
      border: '#e2e8f0',
      destructive: '#ef4444', success: '#22c55e', warning: '#f59e0b',
    },
  },
}

const STORAGE_KEY = 'ots-theme-preset'

function applyPreset(name: string): void {
  const preset = THEME_PRESETS[name] || THEME_PRESETS.default
  const root = document.documentElement

  // Set dark/light class
  root.classList.remove('light', 'dark')
  root.classList.add(preset.dark ? 'dark' : 'light')
  root.style.colorScheme = preset.dark ? 'dark' : 'light'

  // Apply all CSS variables
  for (const [key, value] of Object.entries(preset.colors)) {
    root.style.setProperty(`--color-${key}`, value)
  }
}

interface ThemeState {
  preset: string
  setPreset: (name: string) => Promise<void>
  presets: Record<string, ThemePreset>
}

const ThemeContext = createContext<ThemeState>({
  preset: 'default',
  setPreset: async () => {},
  presets: THEME_PRESETS,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Apply cached preset immediately (prevents flash)
  const cached = localStorage.getItem(STORAGE_KEY) || 'default'
  applyPreset(cached)

  const [preset, setPresetState] = useState(cached)
  const queryClient = useQueryClient()

  // Load from DB (overrides localStorage if different)
  const { data: dbPreset } = useQuery({
    queryKey: ['settings', 'app_theme'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'app_theme').maybeSingle()
      return data?.value || 'default'
    },
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (dbPreset && dbPreset !== preset) {
      setPresetState(dbPreset)
      localStorage.setItem(STORAGE_KEY, dbPreset)
      applyPreset(dbPreset)
    }
  }, [dbPreset])

  const setPreset = async (name: string) => {
    setPresetState(name)
    localStorage.setItem(STORAGE_KEY, name)
    applyPreset(name)
    await supabase.from('app_settings').update({ value: name }).eq('key', 'app_theme')
    queryClient.invalidateQueries({ queryKey: ['settings', 'app_theme'] })
  }

  return (
    <ThemeContext.Provider value={{ preset, setPreset, presets: THEME_PRESETS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
