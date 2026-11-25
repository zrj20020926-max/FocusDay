import { defineStore } from 'pinia'
import { ambientAudioService, AmbientAudioError } from '../services/audio/AmbientAudioService'
import { SettingsRepository } from '../services/database/repositories/SettingsRepository'
import { AMBIENT_SOUND_IDS, DEFAULT_AMBIENT_PREFERENCES, FOCUS_SCENE_IDS, FOCUS_SCENES, type AmbientPreferences, type AmbientSoundId, type FocusSceneId } from '../types/ambient'
import { useAppStore } from './app'

export const ambientSettingsRepository = new SettingsRepository()
const SETTINGS_ID = 'ambient-preferences'
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave = Promise.resolve()

const cloneDefaults = () => structuredClone(DEFAULT_AMBIENT_PREFERENCES)
const clamp = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

export function normalizeAmbientPreferences(value: unknown): AmbientPreferences {
  const defaults = cloneDefaults()
  if (!value || typeof value !== 'object') return defaults
  const input = value as Partial<AmbientPreferences>
  if (input.sceneId && FOCUS_SCENE_IDS.includes(input.sceneId)) defaults.sceneId = input.sceneId
  defaults.muted = Boolean(input.muted)
  defaults.fullscreenPreferred = Boolean(input.fullscreenPreferred)
  for (const soundId of AMBIENT_SOUND_IDS) {
    const sound = input.sounds?.[soundId]
    if (sound) defaults.sounds[soundId] = { enabled: Boolean(sound.enabled), volume: clamp(sound.volume, defaults.sounds[soundId].volume) }
  }
  return defaults
}

const playbackMessage = (error: unknown) => error instanceof AmbientAudioError ? error.message : '环境音播放失败，请稍后重试'

export const useAmbientStore = defineStore('ambient', {
  state: () => ({
    preferences: cloneDefaults(),
    initialized: false,
    audioActive: false,
    busySounds: [] as AmbientSoundId[],
    lastError: '',
  }),
  getters: {
    scene: state => FOCUS_SCENES[state.preferences.sceneId],
    enabledCount: state => AMBIENT_SOUND_IDS.filter(id => state.preferences.sounds[id].enabled).length,
  },
  actions: {
    async initialize() {
      if (this.initialized) return
      try { this.preferences = normalizeAmbientPreferences(await ambientSettingsRepository.get<AmbientPreferences>(SETTINGS_ID)) }
      catch { useAppStore().notify('环境音偏好读取失败，已使用默认设置') }
      this.initialized = true
    },

    async refreshFromPersistence() {
      if (!this.initialized) return
      try {
        const preferences = normalizeAmbientPreferences(await ambientSettingsRepository.get<AmbientPreferences>(SETTINGS_ID))
        this.preferences = preferences
        for (const soundId of AMBIENT_SOUND_IDS) {
          if (!preferences.sounds[soundId].enabled) ambientAudioService.disable(soundId)
          else ambientAudioService.setVolume(soundId, preferences.sounds[soundId].volume)
        }
        ambientAudioService.setMuted(preferences.muted)
        this.audioActive = AMBIENT_SOUND_IDS.some(id => ambientAudioService.isActive(id))
      } catch { useAppStore().notify('同步后的环境音偏好读取失败') }
    },

    async selectScene(sceneId: FocusSceneId, playRecommended = true) {
      if (!FOCUS_SCENE_IDS.includes(sceneId)) return
      this.preferences.sceneId = sceneId
      if (playRecommended) await this.enableSound(FOCUS_SCENES[sceneId].soundId)
      this.scheduleSave()
    },

    async enableSound(soundId: AmbientSoundId) {
      if (this.busySounds.includes(soundId)) return
      this.busySounds.push(soundId)
      try {
        await ambientAudioService.enable(soundId, this.preferences.sounds[soundId].volume)
        ambientAudioService.setMuted(this.preferences.muted)
        this.preferences.sounds[soundId].enabled = true
        this.audioActive = true; this.lastError = ''; this.scheduleSave()
      } catch (error) {
        this.lastError = playbackMessage(error); useAppStore().notify(this.lastError)
      } finally { this.busySounds = this.busySounds.filter(id => id !== soundId) }
    },

    disableSound(soundId: AmbientSoundId) {
      ambientAudioService.disable(soundId)
      this.preferences.sounds[soundId].enabled = false
      this.audioActive = AMBIENT_SOUND_IDS.some(id => ambientAudioService.isActive(id))
      this.scheduleSave()
    },

    async toggleSound(soundId: AmbientSoundId) {
      if (this.preferences.sounds[soundId].enabled) this.disableSound(soundId)
      else await this.enableSound(soundId)
    },

    setVolume(soundId: AmbientSoundId, volume: number) {
      const normalized = clamp(volume, this.preferences.sounds[soundId].volume)
      this.preferences.sounds[soundId].volume = normalized
      ambientAudioService.setVolume(soundId, normalized)
      this.scheduleSave(300)
    },

    toggleMute() {
      this.preferences.muted = !this.preferences.muted
      ambientAudioService.setMuted(this.preferences.muted)
      this.scheduleSave()
    },

    async resumeEnabled() {
      if (!this.enabledCount) return
      try {
        await ambientAudioService.restore(this.preferences)
        this.audioActive = true; this.lastError = ''
      } catch (error) {
        await ambientAudioService.dispose(); this.audioActive = false
        this.lastError = playbackMessage(error); useAppStore().notify(this.lastError)
      }
    },

    setFullscreenPreferred(value: boolean) { this.preferences.fullscreenPreferred = value; this.scheduleSave() },

    async releaseAudio() { await ambientAudioService.dispose(); this.audioActive = false },

    scheduleSave(delay = 0) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void this.flushPending().catch(() => useAppStore().notify('环境音偏好保存失败'))
      }, delay)
    },

    async flushPending() {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
        const value = normalizeAmbientPreferences(this.preferences)
        pendingSave = pendingSave.catch(() => undefined).then(() => ambientSettingsRepository.set(SETTINGS_ID, value))
      }
      await pendingSave
    },
  },
})
