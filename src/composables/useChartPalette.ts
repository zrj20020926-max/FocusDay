import { computed } from 'vue'
import { useThemeStore } from '../stores/themeStore'

export function useChartPalette() {
  const theme = useThemeStore()
  return computed(() => {
    // ECharts draws on a canvas so it needs resolved colors instead of CSS var() expressions.
    void theme.applied
    const root = getComputedStyle(document.documentElement)
    const color = (name: string) => root.getPropertyValue(name).trim()
    return {
      card: color('--card'), label: color('--muted'), grid: color('--line'),
      accent: color('--green'), accentStrong: color('--green-dark'), amber: color('--amber'),
      tooltip: color('--inverse'), tooltipText: color('--on-inverse'),
    }
  })
}
