import 'fake-indexeddb/auto'
import { expect, describe, it, vi } from 'vitest'
import paletteCss from '../../themes.css?raw'
import { DatabaseService } from '../database/DatabaseService'
import { SettingsRepository } from '../database/repositories/SettingsRepository'
import { resolveTheme, THEME_KEY, ThemeService, themePreference } from './ThemeService'

function browserFixture() {
  const values = new Map<string, string>()
  const cache = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const classes = new Set<string>()
  const root = { dataset: {}, classList: { add: vi.fn((name: string) => classes.add(name)), remove: vi.fn((name: string) => classes.delete(name)) } }
  return { root, classes, values, cache }
}

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const expanded = hex.length === 4 ? hex.slice(1).replace(/./g, value => value + value) : hex.slice(1)
    const linear = [0, 2, 4].map(index => parseInt(expanded.slice(index, index + 2), 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
  }
  const [low, high] = [luminance(a), luminance(b)].sort((left, right) => left - right)
  return (high + .05) / (low + .05)
}

describe('ThemeService', () => {
  it('保存主题并能从 IndexedDB 重新载入，启动缓存保留原始偏好', async () => {
    const database = new DatabaseService(`theme-${crypto.randomUUID()}`)
    const { root, cache } = browserFixture()
    const theme = new ThemeService(root, () => false, () => true, cache)
    try {
      await new SettingsRepository(database).set(THEME_KEY, 'salt')
      const preference = themePreference(await new SettingsRepository(database).get(THEME_KEY))
      expect(theme.apply(preference)).toBe('salt')
      expect(root.dataset).toEqual({ theme: 'salt' })
      expect(new ThemeService(root, () => true, () => true, cache).cached()).toBe('salt')
    } finally { await database.delete() }
  })

  it('无需刷新即可切换主题，跟随系统并尊重减少动态效果', () => {
    let dark = false
    const { root, cache } = browserFixture()
    const theme = new ThemeService(root, () => dark, () => true, cache)
    expect(theme.apply('system')).toBe('paper')
    dark = true
    expect(theme.apply('system')).toBe('night')
    expect(theme.cached()).toBe('system')
    expect(theme.apply('forest')).toBe('forest')
    expect(root.dataset).toEqual({ theme: 'forest' })
    expect(root.classList.add).not.toHaveBeenCalled()
    expect(resolveTheme('salt', true)).toBe('salt')
    expect(themePreference('invalid')).toBe('paper')
  })

  it('为主题切换提供过渡，并在结束后恢复', () => {
    vi.useFakeTimers()
    try {
      const { root, classes } = browserFixture()
      const theme = new ThemeService(root, () => false, () => false)
      theme.apply('paper', false)
      theme.apply('night')
      expect(classes.has('theme-changing')).toBe(true)
      vi.advanceTimersByTime(220)
      expect(classes.has('theme-changing')).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it.each(['paper', 'forest', 'night', 'salt'])('%s 主题的主要文本、次级文本、按钮及徽章满足 4.5:1', theme => {
    const block = paletteCss.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1] ?? ''
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{3,6})\s*;/gi)].map(([, name, color]) => [name, color]))
    for (const [text, background] of [
      ['text', 'bg'], ['text', 'card'], ['text', 'panel'], ['muted', 'card'], ['muted', 'bg'], ['muted', 'well'],
      ['green-dark', 'tint'], ['action-text', 'action'], ['on-accent', 'green'], ['on-inverse', 'inverse'],
      ['amber', 'amber-tint'], ['blue', 'blue-tint'], ['plum', 'plum-tint'], ['danger', 'danger-tint'],
    ]) {
      expect(tokens[text], text).toBeDefined()
      expect(tokens[background], background).toBeDefined()
      expect(contrast(tokens[text], tokens[background]), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
