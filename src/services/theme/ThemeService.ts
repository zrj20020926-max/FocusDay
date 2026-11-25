export const THEMES = [
  { id: 'paper', name: '暖纸白' },
  { id: 'forest', name: '森林绿' },
  { id: 'night', name: '深夜模式' },
  { id: 'salt', name: '海盐蓝' },
] as const

export type ThemeId = typeof THEMES[number]['id']
export type ThemePreference = ThemeId | 'system'
export const THEME_KEY = 'appearance-theme'
const CACHE_KEY = 'focus-day.theme'

export function themePreference(value: unknown): ThemePreference {
  return value === 'system' || THEMES.some(theme => theme.id === value) ? value as ThemePreference : 'paper'
}

export function resolveTheme(preference: ThemePreference, dark: boolean): ThemeId {
  return preference === 'system' ? (dark ? 'night' : 'paper') : preference
}

export class ThemeService {
  private animation: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly root: { dataset: DOMStringMap; classList: Pick<DOMTokenList, 'add' | 'remove'> },
    private readonly dark: () => boolean,
    private readonly reduceMotion: () => boolean,
    private readonly cache?: Pick<Storage, 'getItem' | 'setItem'>,
  ) {}

  cached(): ThemePreference {
    try { return themePreference(this.cache?.getItem(CACHE_KEY)) }
    catch { return 'paper' }
  }

  apply(preference: ThemePreference, animate = true): ThemeId {
    const next = resolveTheme(preference, this.dark())
    const previous = this.root.dataset.theme
    this.root.dataset.theme = next
    if (animate && previous && previous !== next && !this.reduceMotion()) {
      this.root.classList.add('theme-changing')
      clearTimeout(this.animation)
      this.animation = setTimeout(() => this.root.classList.remove('theme-changing'), 220)
    }
    try { this.cache?.setItem(CACHE_KEY, preference) } catch { /* Cache is optional. */ }
    return next
  }
}
