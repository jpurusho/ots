import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { THEME_PRESETS } from './lib/theme-context'

// Apply stored theme preset before React renders (prevents flash)
const presetName = localStorage.getItem('ots-theme-preset') || 'default'
const preset = THEME_PRESETS[presetName] || THEME_PRESETS.default
const root = document.documentElement
root.classList.add(preset.dark ? 'dark' : 'light')
root.style.colorScheme = preset.dark ? 'dark' : 'light'
for (const [key, value] of Object.entries(preset.colors)) {
  root.style.setProperty(`--color-${key}`, value)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
