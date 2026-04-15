import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  resolved: 'light' | 'dark' // actual applied theme
}

const ThemeContext = createContext<ThemeState>({
  theme: 'system',
  setTheme: () => {},
  resolved: 'dark',
})

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): 'light' | 'dark' {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = (localStorage.getItem('ots-theme') as Theme) || 'system'
  const [theme, setThemeState] = useState<Theme>(stored)
  const [resolved, setResolved] = useState<'light' | 'dark'>(applyTheme(stored))

  const setTheme = (t: Theme) => {
    localStorage.setItem('ots-theme', t)
    setThemeState(t)
    setResolved(applyTheme(t))
  }

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setResolved(applyTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
