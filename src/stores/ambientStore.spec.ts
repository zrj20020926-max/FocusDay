import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ambientAudioService } from '../services/audio/AmbientAudioService'
import { DEFAULT_AMBIENT_PREFERENCES } from '../types/ambient'
import { ambientSettingsRepository, normalizeAmbientPreferences, useAmbientStore } from './ambientStore'

describe('ambientStore', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('读取并校验持久化偏好，非法音量回退默认值', async () => {
    vi.spyOn(ambientSettingsRepository, 'get').mockResolvedValue({ ...DEFAULT_AMBIENT_PREFERENCES, sceneId: 'OCEAN_TIME', sounds: {
      ...DEFAULT_AMBIENT_PREFERENCES.sounds, RAIN: { enabled: true, volume: 4 },
    } })
    const store = useAmbientStore(); await store.initialize()
    expect(store.preferences.sceneId).toBe('OCEAN_TIME')
    expect(store.preferences.sounds.RAIN).toEqual({ enabled: true, volume: 1 })
    expect(normalizeAmbientPreferences(null)).toEqual(DEFAULT_AMBIENT_PREFERENCES)
  })

  it('切换场景会启用对应声音并保存偏好', async () => {
    vi.spyOn(ambientSettingsRepository, 'get').mockResolvedValue(null)
    const save = vi.spyOn(ambientSettingsRepository, 'set').mockResolvedValue()
    const enable = vi.spyOn(ambientAudioService, 'enable').mockResolvedValue()
    vi.spyOn(ambientAudioService, 'setMuted').mockImplementation(() => {})
    const store = useAmbientStore(); await store.initialize(); await store.selectScene('FOREST_MORNING', true)
    expect(store.preferences.sceneId).toBe('FOREST_MORNING')
    expect(store.preferences.sounds.FOREST.enabled).toBe(true)
    expect(enable).toHaveBeenCalledWith('FOREST', DEFAULT_AMBIENT_PREFERENCES.sounds.FOREST.volume)
    await vi.runAllTimersAsync(); expect(save).toHaveBeenCalled()
  })

  it('支持音量、静音与组件销毁后的音频释放', async () => {
    vi.spyOn(ambientSettingsRepository, 'get').mockResolvedValue(null)
    vi.spyOn(ambientSettingsRepository, 'set').mockResolvedValue()
    const volume = vi.spyOn(ambientAudioService, 'setVolume').mockImplementation(() => {})
    const mute = vi.spyOn(ambientAudioService, 'setMuted').mockImplementation(() => {})
    const dispose = vi.spyOn(ambientAudioService, 'dispose').mockResolvedValue()
    const store = useAmbientStore(); await store.initialize()
    store.setVolume('OCEAN', .73); store.toggleMute(); await store.releaseAudio()
    expect(volume).toHaveBeenCalledWith('OCEAN', .73)
    expect(mute).toHaveBeenCalledWith(true)
    expect(dispose).toHaveBeenCalledOnce()
    expect(store.audioActive).toBe(false)
  })

  it('播放失败时保持关闭并显示可理解错误', async () => {
    vi.spyOn(ambientSettingsRepository, 'get').mockResolvedValue(null)
    vi.spyOn(ambientAudioService, 'enable').mockRejectedValue(new Error('denied'))
    const store = useAmbientStore(); await store.initialize(); await store.enableSound('RAIN')
    expect(store.preferences.sounds.RAIN.enabled).toBe(false)
    expect(store.lastError).toBe('环境音播放失败，请稍后重试')
  })
})
