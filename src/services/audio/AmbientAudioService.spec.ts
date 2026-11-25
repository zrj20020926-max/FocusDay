import { describe, expect, it, vi } from 'vitest'
import { AmbientAudioError, AmbientAudioService, type AmbientAudioEngine } from './AmbientAudioService'
import type { AmbientSoundId } from '../../types/ambient'

class FakeEngine implements AmbientAudioEngine {
  started: Array<{ id: AmbientSoundId; volume: number }> = []
  stopped: AmbientSoundId[] = []
  volumes: Array<{ id: AmbientSoundId; volume: number }> = []
  muted = false
  disposed = false
  reject: AmbientSoundId | null = null
  async start(id: AmbientSoundId, volume: number) {
    if (this.reject === id) throw new AmbientAudioError('blocked', 'PLAYBACK_BLOCKED')
    this.started.push({ id, volume })
  }
  stop(id: AmbientSoundId) { this.stopped.push(id) }
  setVolume(id: AmbientSoundId, volume: number) { this.volumes.push({ id, volume }) }
  setMuted(muted: boolean) { this.muted = muted }
  dispose() { this.disposed = true }
}

describe('AmbientAudioService', () => {
  it('支持多个环境音同时播放、独立音量和一键静音', async () => {
    const engine = new FakeEngine()
    const service = new AmbientAudioService(() => engine)
    await service.enable('RAIN', .42); await service.enable('FOREST', .3)
    service.setVolume('RAIN', 2); service.setMuted(true)
    expect(engine.started).toEqual([{ id: 'RAIN', volume: .42 }, { id: 'FOREST', volume: .3 }])
    expect(engine.volumes).toContainEqual({ id: 'RAIN', volume: 1 })
    expect(engine.muted).toBe(true)
    expect(service.isActive('RAIN')).toBe(true)
    expect(service.isActive('FOREST')).toBe(true)
  })

  it('可以独立关闭声音并在销毁时释放全部资源', async () => {
    const engines: FakeEngine[] = []
    const service = new AmbientAudioService(() => { const engine = new FakeEngine(); engines.push(engine); return engine })
    await service.enable('OCEAN', .5); service.disable('OCEAN')
    expect(engines[0].stopped).toEqual(['OCEAN'])
    await service.enable('CAFE', .2); await service.dispose()
    expect(engines[0].disposed).toBe(true)
    expect(service.isActive('CAFE')).toBe(false)
    expect(engines).toHaveLength(2)
  })

  it('恢复偏好时只播放已启用的声音并保留混音音量', async () => {
    const engine = new FakeEngine()
    const service = new AmbientAudioService(() => engine)
    await service.restore({ version: 1, sceneId: 'RAIN_STUDY', muted: true, fullscreenPreferred: false, sounds: {
      RAIN: { enabled: true, volume: .4 }, FOREST: { enabled: false, volume: .3 }, OCEAN: { enabled: true, volume: .6 }, CAFE: { enabled: false, volume: .2 },
    } })
    expect(engine.started).toEqual([{ id: 'RAIN', volume: .4 }, { id: 'OCEAN', volume: .6 }])
    expect(engine.stopped).toEqual(['FOREST', 'CAFE'])
    expect(engine.muted).toBe(true)
  })

  it('浏览器拒绝播放时不会错误标记声音为活动状态', async () => {
    const engine = new FakeEngine(); engine.reject = 'RAIN'
    const service = new AmbientAudioService(() => engine)
    await expect(service.enable('RAIN', .4)).rejects.toMatchObject({ code: 'PLAYBACK_BLOCKED' })
    expect(service.isActive('RAIN')).toBe(false)
  })
})
