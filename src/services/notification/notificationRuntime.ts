import { ReminderRepository } from '../database/repositories/ReminderRepository'
import { NotificationService } from './NotificationService'
import { BrowserNotificationDelivery } from './BrowserNotificationDelivery'
import { ReminderScheduler } from './ReminderScheduler'
import type { TimerPhaseCompletion } from '../../types/timer'

export const reminderRepository = new ReminderRepository()
export const browserNotifications = new BrowserNotificationDelivery()
const seen = new Set<string>()
let showToast: ((message: string) => void) | null = null

export const notificationService = new NotificationService(reminderRepository, {
  async claim(id, now) {
    if (seen.has(id)) return false
    const first = await reminderRepository.claim(id, now)
    seen.add(id)
    if (seen.size > 1000) seen.delete(seen.values().next().value!)
    return first
  },
  toast: event => showToast?.(`${event.title} · ${event.body}`),
  permission: () => browserNotifications.permission(),
  requestPermission: () => browserNotifications.requestPermission(),
  system: event => browserNotifications.system(event),
  sound: () => browserNotifications.sound(),
})

export function startNotifications(
  notify: (message: string) => void,
  refreshTimer: () => void,
  subscribeTimer: (listener: (phases: readonly TimerPhaseCompletion[]) => void) => () => void,
) {
  const scheduler = new ReminderScheduler(notificationService)
  let soundEnabled = false
  const queue: string[] = []
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  const showNextToast = () => {
    const message = queue.shift()
    if (!message) { toastTimer = undefined; return }
    notify(message)
    toastTimer = setTimeout(showNextToast, 2650)
  }
  showToast = message => { queue.push(message); if (toastTimer === undefined) showNextToast() }
  const unsubscribeTimer = subscribeTimer(phases => {
    void notificationService.timerCompleted(phases).catch(() => undefined)
  })

  const schedules = reminderRepository.observeSchedule().subscribe({
    next: schedule => { void scheduler.replace(schedule) },
    error: () => { void scheduler.replace(null) },
  })
  const settings = reminderRepository.observePreferences().subscribe({
    next: preferences => {
      soundEnabled = preferences?.enabled !== false && preferences?.sound === true
      void scheduler.check()
    },
    error: () => { soundEnabled = false },
  })
  const poll = () => { void scheduler.check() }
  const resume = () => { refreshTimer(); poll() }
  const unlock = () => { if (soundEnabled) void browserNotifications.unlockAudio().catch(() => undefined) }
  const interval = window.setInterval(poll, 15_000)
  window.addEventListener('focus', resume)
  window.addEventListener('pageshow', resume)
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  void reminderRepository.prune().catch(() => undefined)

  return () => {
    window.clearInterval(interval)
    window.removeEventListener('focus', resume)
    window.removeEventListener('pageshow', resume)
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    schedules.unsubscribe()
    settings.unsubscribe()
    unsubscribeTimer()
    void scheduler.replace(null)
    clearTimeout(toastTimer)
    showToast = null
    browserNotifications.releaseAudio()
  }
}
