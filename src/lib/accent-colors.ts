import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AccentColors {
  report: string
  card: string
}

const DEFAULTS: AccentColors = {
  report: '#16a34a',
  card: '#4f46e5',
}

export function useAccentColors(): AccentColors {
  const { data } = useQuery({
    queryKey: ['settings', 'accent-colors'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('key, value')
        .in('key', ['report_accent_color', 'card_accent_color'])
      const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
      return {
        report: map.report_accent_color || DEFAULTS.report,
        card: map.card_accent_color || DEFAULTS.card,
      }
    },
  })
  return data || DEFAULTS
}
