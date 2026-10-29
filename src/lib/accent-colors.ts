import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AccentColors {
  report: string
  card: string
}

function getThemeColor(): string {
  // Get the primary color from the current theme
  const root = document.documentElement
  const primaryColor = root.style.getPropertyValue('--color-primary')
  return primaryColor || '#4f46e5' // fallback if theme not loaded
}

export function useAccentColors(): AccentColors {
  const { data } = useQuery({
    queryKey: ['settings', 'accent-colors'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('key, value')
        .in('key', ['report_accent_color', 'card_accent_color'])
      const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
      const themeColor = getThemeColor()
      return {
        report: (map.report_accent_color && map.report_accent_color.trim()) || themeColor,
        card: (map.card_accent_color && map.card_accent_color.trim()) || themeColor,
      }
    },
  })
  const themeColor = getThemeColor()
  return data || { report: themeColor, card: themeColor }
}
