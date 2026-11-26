import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { databaseService } from '../services/database/DatabaseService'
import { SettingsRepository } from '../services/database/repositories/SettingsRepository'
import { ThemeService, THEME_KEY, themePreference, type ThemeId, type ThemePreference } from '../services/theme/ThemeService'

const repository = new SettingsRepository()
const darkMode = () => window.matchMedia('(prefers-color-scheme: dark)')
let service: ThemeService | undefined
let stop: (() => void) | undefined

function browserTheme() {
  if (!service) {
    let cache: Pick<Storage, 'getItem' | 'setItem'> | undefined
    try {
      if (!Capacitor.isNativePlatform()) {
        const prefix = databaseService.owner ?? 'guest'
        cache = {
          getItem: key => window.localStorage.getItem(prefix + ':' + key),
          setItem: (key, value) => window.localStorage.setItem(prefix + ':' + key, value),
        }
      }
    } catch { /* Optional startup cache. */ }
    service = new ThemeService(document.documentElement, () => darkMode().matches,
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, cache)
  }
  return service
}

export function primeTheme() {
  const theme = browserTheme()
  theme.apply(theme.cached(), false)
}

export const useThemeStore = defineStore('theme', {
  state: () => ({ preference: 'paper' as ThemePreference, applied: 'paper' as ThemeId, ready: false, saving: false, error: '' }),
  actions: {
    start() {
      if (stop) return
      this.apply(browserTheme().cached(), false)
      const media = darkMode()
      const systemChanged = () => { if (this.preference === 'system') this.apply('system') }
      media.addEventListener('change', systemChanged)
      const subscription = databaseService.observe(['userSettings'], () => repository.get(THEME_KEY)).subscribe({
        next: value => { this.apply(themePreference(value), this.ready); this.ready = true },
        error: () => { this.error = '无法载入主题偏好。' },
      })
      stop = () => { subscription.unsubscribe(); media.removeEventListener('change', systemChanged) }
    },
    stop() { stop?.(); stop = undefined },
    apply(preference: ThemePreference, animate = true) {
      this.preference = preference
      this.applied = browserTheme().apply(preference, animate)
    },
    async choose(preference: ThemePreference) {
      if (!this.ready || this.saving || this.preference === preference) return
      this.saving = true
      this.error = ''
      try {
        await repository.set(THEME_KEY, preference)
        this.apply(preference)
      } catch { this.error = '主题未保存，请重试。' }
      finally { this.saving = false }
    },
  },
})
