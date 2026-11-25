import {
  DEFAULT_NOTIFICATION_PREFERENCES, type BrowserNotificationPermission, type NotificationEvent, type NotificationPreferences,
} from '../../types/notification'
import type { TimerPhaseCompletion } from '../../types/timer'

export interface NotificationSettings {
  read(): Promise<Partial<NotificationPreferences> | null>
  write(preferences: NotificationPreferences): Promise<void>
}

export interface NotificationDelivery {
  claim(id: string, now: number): Promise<boolean>
  toast(event: NotificationEvent): void
  permission(): BrowserNotificationPermission
  requestPermission(): Promise<BrowserNotificationPermission>
  system(event: NotificationEvent): Promise<void>
  sound(): Promise<void>
}

function allows(event: NotificationEvent, preferences: NotificationPreferences): boolean {
  if (!preferences.enabled) return false
  switch (event.kind) {
    case 'TASK_DUE': return preferences.tasks
    case 'HABIT_DAILY': return preferences.habits
    case 'SHORT_BREAK_COMPLETE':
    case 'LONG_BREAK_COMPLETE': return preferences.breaks
    default: return true
  }
}

const phaseMessages = {
  FOCUS: { kind: 'POMODORO_COMPLETE', title: '番茄钟专注完成', body: '现在可以休息一下。' },
  SHORT_BREAK: { kind: 'SHORT_BREAK_COMPLETE', title: '短休息结束', body: '新一轮专注已开始。' },
  LONG_BREAK: { kind: 'LONG_BREAK_COMPLETE', title: '长休息结束', body: '新一轮专注已开始。' },
  COUNTDOWN: { kind: 'COUNTDOWN_COMPLETE', title: '倒计时完成', body: '本次专注已结束。' },
} as const

export const TIMER_NOTIFICATION_MAX_DELAY = 10 * 60_000

export class NotificationService {
  private settingsWrite: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly settings: NotificationSettings,
    private readonly delivery: NotificationDelivery,
    private readonly now = () => Date.now(),
  ) {}

  async preferences(): Promise<NotificationPreferences> {
    const value = await this.settings.read()
    const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES }
    for (const key of Object.keys(preferences) as (keyof NotificationPreferences)[]) {
      if (typeof value?.[key] === 'boolean') preferences[key] = value[key]
    }
    return preferences
  }

  updatePreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const update = this.settingsWrite.catch(() => undefined).then(async () => {
      const preferences = { ...await this.preferences(), ...patch }
      await this.settings.write(preferences)
      return preferences
    })
    this.settingsWrite = update
    return update
  }

  permission() { return this.delivery.permission() }

  // Called exclusively from the explicit system-notification control.
  async enableSystem(): Promise<BrowserNotificationPermission> {
    let permission = this.permission()
    if (permission === 'default') {
      try { permission = await this.delivery.requestPermission() }
      catch { permission = this.permission() }
    }
    if (permission === 'granted') await this.updatePreferences({ system: true })
    return permission
  }

  async publish(event: NotificationEvent, current = () => true): Promise<boolean> {
    const preferences = await this.preferences()
    if (!current() || !allows(event, preferences)) return false
    if (!await this.delivery.claim(event.id, this.now()) || !current()) return false
    this.delivery.toast(event)
    const effects: Promise<void>[] = []
    if (preferences.system && this.permission() === 'granted') effects.push(Promise.resolve().then(() => this.delivery.system(event)))
    if (preferences.sound) effects.push(Promise.resolve().then(() => this.delivery.sound()))
    await Promise.allSettled(effects)
    return true
  }

  async timerCompleted(phases: readonly TimerPhaseCompletion[]): Promise<boolean> {
    // On resume only report the latest phase rather than replaying a series of old rounds.
    const phase = phases[phases.length - 1]
    if (!phase || this.now() - phase.completedAt > TIMER_NOTIFICATION_MAX_DELAY) return false
    return this.publish({
      id: `timer:${phase.sessionId}:${phase.phaseSequence}`,
      ...phaseMessages[phase.mode === 'COUNTDOWN' ? 'COUNTDOWN' : phase.phase],
      occurredAt: phase.completedAt,
    })
  }
}
