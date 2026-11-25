import type { BrowserNotificationPermission, NotificationEvent } from '../../types/notification'

export class BrowserNotificationDelivery {
  private audio: AudioContext | null = null
  private lastSoundAt = -Infinity

  permission(): BrowserNotificationPermission {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  }

  async requestPermission(): Promise<BrowserNotificationPermission> {
    return typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function'
      ? Notification.requestPermission() : this.permission()
  }

  async system(event: NotificationEvent): Promise<void> {
    if (this.permission() !== 'granted') return
    const options = { body: event.body, tag: event.id, silent: true } as const
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
    if (registration?.active) {
      await registration.showNotification(event.title, options)
      return
    }
    const notification = new Notification(event.title, options)
    notification.onclick = () => { window.focus(); notification.close() }
  }

  async unlockAudio(): Promise<void> {
    if (typeof AudioContext === 'undefined') return
    this.audio ??= new AudioContext()
    if (this.audio.state === 'suspended') await this.audio.resume()
  }

  async sound(): Promise<void> {
    const audio = this.audio
    if (!audio || audio.state !== 'running' || audio.currentTime - this.lastSoundAt < 0.6) return
    const start = audio.currentTime
    this.lastSoundAt = start
    for (const [index, frequency] of [587.33, 783.99].entries()) {
      const tone = audio.createOscillator()
      const gain = audio.createGain()
      const note = start + index * 0.13
      tone.type = 'sine'
      tone.frequency.value = frequency
      gain.gain.setValueAtTime(0.001, note)
      gain.gain.exponentialRampToValueAtTime(0.09, note + 0.035)
      gain.gain.exponentialRampToValueAtTime(0.001, note + 0.28)
      tone.connect(gain).connect(audio.destination)
      tone.start(note)
      tone.stop(note + 0.3)
      tone.onended = () => { tone.disconnect(); gain.disconnect() }
    }
  }

  releaseAudio() {
    const audio = this.audio
    this.audio = null
    this.lastSoundAt = -Infinity
    if (audio && audio.state !== 'closed') void audio.close().catch(() => undefined)
  }
}
