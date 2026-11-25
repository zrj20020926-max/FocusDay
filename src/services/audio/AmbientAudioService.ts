import { AMBIENT_SOUND_IDS, type AmbientPreferences, type AmbientSoundId } from '../../types/ambient'

export interface AmbientAudioEngine {
  start(soundId: AmbientSoundId, volume: number): Promise<void>
  stop(soundId: AmbientSoundId): void
  setVolume(soundId: AmbientSoundId, volume: number): void
  setMuted(muted: boolean): void
  dispose(): Promise<void> | void
}

export class AmbientAudioError extends Error {
  constructor(message: string, public readonly code: 'PLAYBACK_BLOCKED' | 'UNSUPPORTED' | 'PLAYBACK_FAILED') {
    super(message)
    this.name = 'AmbientAudioError'
  }
}

type AudioContextConstructor = new () => AudioContext
type Channel = { source: AudioBufferSourceNode; gain: GainNode; modulators: OscillatorNode[] }

export class WebAudioAmbientEngine implements AmbientAudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private readonly channels = new Map<AmbientSoundId, Channel>()

  constructor(private readonly contextFactory: () => AudioContext = () => {
    const Constructor = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
    if (!Constructor) throw new AmbientAudioError('当前浏览器不支持环境音播放', 'UNSUPPORTED')
    return new Constructor()
  }) {}

  async start(soundId: AmbientSoundId, volume: number): Promise<void> {
    if (this.channels.has(soundId)) { this.setVolume(soundId, volume); return }
    const context = this.ensureContext()
    try {
      if (context.state !== 'running') await context.resume()
      if (context.state !== 'running') throw new AmbientAudioError('请点击页面后再播放环境音', 'PLAYBACK_BLOCKED')
      const channel = this.createChannel(soundId, volume)
      this.channels.set(soundId, channel)
      channel.source.start()
      channel.modulators.forEach(item => item.start())
    } catch (error) {
      if (error instanceof AmbientAudioError) throw error
      throw new AmbientAudioError('环境音播放失败，请检查浏览器音频权限', 'PLAYBACK_FAILED')
    }
  }

  stop(soundId: AmbientSoundId): void {
    const channel = this.channels.get(soundId)
    if (!channel) return
    try { channel.source.stop() } catch { /* already stopped */ }
    channel.modulators.forEach(item => { try { item.stop() } catch { /* already stopped */ } })
    channel.source.disconnect(); channel.gain.disconnect(); this.channels.delete(soundId)
  }

  setVolume(soundId: AmbientSoundId, volume: number): void {
    const channel = this.channels.get(soundId)
    if (!channel || !this.context) return
    channel.gain.gain.setTargetAtTime(clamp(volume), this.context.currentTime, .035)
  }

  setMuted(muted: boolean): void {
    if (!this.master || !this.context) return
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, .04)
  }

  async dispose(): Promise<void> {
    for (const soundId of [...this.channels.keys()]) this.stop(soundId)
    const context = this.context
    this.context = null; this.master = null; this.noiseBuffer = null
    if (context && context.state !== 'closed') await context.close()
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = this.contextFactory()
      this.master = this.context.createGain(); this.master.connect(this.context.destination)
    }
    return this.context
  }

  private createChannel(soundId: AmbientSoundId, volume: number): Channel {
    const context = this.ensureContext()
    const source = context.createBufferSource(); source.buffer = this.getNoiseBuffer(context); source.loop = true
    const filter = context.createBiquadFilter()
    const texture = context.createGain()
    const gain = context.createGain(); gain.gain.value = clamp(volume)
    const modulators: OscillatorNode[] = []
    if (soundId === 'RAIN') { filter.type = 'highpass'; filter.frequency.value = 1250; filter.Q.value = .45; texture.gain.value = .7 }
    if (soundId === 'FOREST') { filter.type = 'bandpass'; filter.frequency.value = 2100; filter.Q.value = .32; texture.gain.value = .28 }
    if (soundId === 'OCEAN') {
      filter.type = 'lowpass'; filter.frequency.value = 720; filter.Q.value = .5; texture.gain.value = .55
      const lfo = context.createOscillator(); const depth = context.createGain()
      lfo.frequency.value = .085; depth.gain.value = .32; lfo.connect(depth); depth.connect(texture.gain); modulators.push(lfo)
    }
    if (soundId === 'CAFE') { filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = .28; texture.gain.value = .34 }
    source.connect(filter); filter.connect(texture); texture.connect(gain); gain.connect(this.master!)
    return { source, gain, modulators }
  }

  private getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const length = context.sampleRate * 6
    const buffer = context.createBuffer(2, length, context.sampleRate)
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel); let brown = 0
      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1
        brown = (brown + .018 * white) / 1.018
        data[index] = (white * .58 + brown * 2.3) * .38
      }
    }
    this.noiseBuffer = buffer
    return buffer
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

export class AmbientAudioService {
  private engine: AmbientAudioEngine
  private readonly active = new Set<AmbientSoundId>()

  constructor(private readonly engineFactory: () => AmbientAudioEngine = () => new WebAudioAmbientEngine()) { this.engine = engineFactory() }

  async enable(soundId: AmbientSoundId, volume: number): Promise<void> {
    await this.engine.start(soundId, clamp(volume)); this.active.add(soundId)
  }
  disable(soundId: AmbientSoundId): void { this.engine.stop(soundId); this.active.delete(soundId) }
  setVolume(soundId: AmbientSoundId, volume: number): void { this.engine.setVolume(soundId, clamp(volume)) }
  setMuted(muted: boolean): void { this.engine.setMuted(muted) }
  isActive(soundId: AmbientSoundId): boolean { return this.active.has(soundId) }

  async restore(preferences: AmbientPreferences): Promise<void> {
    for (const soundId of AMBIENT_SOUND_IDS) {
      const preference = preferences.sounds[soundId]
      if (preference.enabled) await this.enable(soundId, preference.volume)
      else this.disable(soundId)
    }
    this.setMuted(preferences.muted)
  }

  async dispose(): Promise<void> {
    await this.engine.dispose(); this.active.clear(); this.engine = this.engineFactory()
  }
}

export const ambientAudioService = new AmbientAudioService()
