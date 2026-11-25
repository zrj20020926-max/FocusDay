export const AMBIENT_SOUND_IDS = ['RAIN', 'FOREST', 'OCEAN', 'CAFE'] as const
export type AmbientSoundId = (typeof AMBIENT_SOUND_IDS)[number]

export const FOCUS_SCENE_IDS = ['RAIN_STUDY', 'FOREST_MORNING', 'OCEAN_TIME', 'AFTERNOON_CAFE'] as const
export type FocusSceneId = (typeof FOCUS_SCENE_IDS)[number]

export interface AmbientSoundPreference {
  enabled: boolean
  volume: number
}

export interface AmbientPreferences {
  version: 1
  sceneId: FocusSceneId
  sounds: Record<AmbientSoundId, AmbientSoundPreference>
  muted: boolean
  fullscreenPreferred: boolean
}

export interface FocusSceneDefinition {
  id: FocusSceneId
  name: string
  description: string
  soundId: AmbientSoundId
  accent: string
  textColor: string
  softTextColor: string
}

export const FOCUS_SCENES: Record<FocusSceneId, FocusSceneDefinition> = {
  RAIN_STUDY: { id: 'RAIN_STUDY', name: '雨夜书房', description: '雨落窗前，灯影安静', soundId: 'RAIN', accent: '#9ab3b4', textColor: '#eef4f1', softTextColor: '#bdcbc8' },
  FOREST_MORNING: { id: 'FOREST_MORNING', name: '森林晨光', description: '树影摇曳，清晨苏醒', soundId: 'FOREST', accent: '#9eb58e', textColor: '#f2f4e9', softTextColor: '#cad2bd' },
  OCEAN_TIME: { id: 'OCEAN_TIME', name: '海边时光', description: '潮汐舒展，呼吸放慢', soundId: 'OCEAN', accent: '#8eb6bf', textColor: '#eff8f7', softTextColor: '#c3d9da' },
  AFTERNOON_CAFE: { id: 'AFTERNOON_CAFE', name: '午后咖啡馆', description: '杯盏轻响，暖意漫开', soundId: 'CAFE', accent: '#c39a72', textColor: '#fff5e9', softTextColor: '#ddc7ad' },
}

export const DEFAULT_AMBIENT_PREFERENCES: AmbientPreferences = {
  version: 1,
  sceneId: 'RAIN_STUDY',
  sounds: {
    RAIN: { enabled: false, volume: 0.42 },
    FOREST: { enabled: false, volume: 0.36 },
    OCEAN: { enabled: false, volume: 0.46 },
    CAFE: { enabled: false, volume: 0.32 },
  },
  muted: false,
  fullscreenPreferred: false,
}
