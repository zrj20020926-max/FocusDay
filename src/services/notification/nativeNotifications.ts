import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { TimerState } from '../../types/timer'
import { DEFAULT_NOTIFICATION_PREFERENCES, type BrowserNotificationPermission } from '../../types/notification'
import { ReminderRepository } from '../database/repositories/ReminderRepository'
import { NativeNotificationScheduler, notificationChannels, notificationMetadata, stableNotificationId } from './NativeNotificationScheduler'
import type { ReminderSchedule } from './ReminderScheduler'

export const usesNativeNotifications = Capacitor.isNativePlatform()
export const usesExactAlarmPermission = Capacitor.getPlatform() === 'android'
let permission: BrowserNotificationPermission = 'default'
let permissionDeniedByRequest = false
let exact = false
interface NativeRuntime {
  update(): Promise<void>
  refresh(): Promise<void>
  stop(): void
}
let runtime: NativeRuntime | undefined
let channelsCreated = false
let reportedFailure = false

const plugin = () => import('@capacitor/local-notifications')
let scheduler: Promise<NativeNotificationScheduler> | undefined
function getScheduler() {
  scheduler ??= plugin().then(({ LocalNotifications }) => new NativeNotificationScheduler(LocalNotifications))
  return scheduler
}

function asPermission(display: string, enabled: boolean): BrowserNotificationPermission {
  if (display === 'granted') return enabled ? 'granted' : 'denied'
  return display === 'prompt' && !permissionDeniedByRequest ? 'default' : 'denied'
}

export function nativeNotificationPermission() { return permission }

export async function readNativeNotificationPermissions() {
  if (!usesNativeNotifications) return { permission: 'unsupported' as const, exact: false }
  try {
    const { LocalNotifications } = await plugin()
    const [display, enabled, alarm] = await Promise.all([
      LocalNotifications.checkPermissions(), LocalNotifications.areEnabled(),
      usesExactAlarmPermission ? LocalNotifications.checkExactNotificationSetting() : undefined,
    ])
    if (display.display === 'granted') permissionDeniedByRequest = false
    permission = asPermission(display.display, enabled.value)
    exact = alarm?.exact_alarm === 'granted'
  } catch { permission = 'unsupported'; exact = false }
  return { permission, exact }
}

export async function requestNativeNotificationPermission() {
  const { LocalNotifications } = await plugin()
  const result = await LocalNotifications.requestPermissions()
  permissionDeniedByRequest = result.display === 'denied'
  return (await readNativeNotificationPermissions()).permission
}

export async function openExactAlarmSettings() {
  const { LocalNotifications } = await plugin()
  if (usesExactAlarmPermission) await LocalNotifications.changeExactNotificationSetting()
  const result = await readNativeNotificationPermissions()
  await runtime?.refresh()
  return result
}

export async function clearNativeNotifications() {
  if (!usesNativeNotifications) return
  runtime?.stop()
  await (await getScheduler()).clear()
}

export async function wasNativeNotificationDelivered(scope: string, key: string) {
  if (!usesNativeNotifications) return false
  const { LocalNotifications } = await plugin()
  const id = stableNotificationId(scope + ':' + key)
  return (await LocalNotifications.getDeliveredNotifications()).notifications.some(item => item.id === id)
}

interface NativeRuntimeOptions {
  scope: string
  state(): TimerState | null | undefined
  open(path: '/focus' | '/tasks' | '/habits'): Promise<void>
  notify(message: string): void
}

export function startNativeNotifications({ scope, state, open, notify }: NativeRuntimeOptions): NativeRuntime {
  const repository = new ReminderRepository()
  let preferences: typeof DEFAULT_NOTIFICATION_PREFERENCES | undefined
  let reminders: ReminderSchedule | null | undefined
  let stopped = false
  let bootstrapped = false
  let armed = false
  let dirty = false
  let running: Promise<void> | undefined
  const listeners: PluginListenerHandle[] = []

  const noteDelivery = async (notification: { extra?: unknown }) => {
    const metadata = notificationMetadata(notification)
    if (stopped || metadata?.scope !== scope) return
    await repository.claim(metadata.key.slice(scope.length + 1), Date.now()).catch(() => undefined)
    return metadata.destination
  }

  const reconcile = async () => {
    while (dirty && !stopped) {
      dirty = false
      const timer = state()
      if (!bootstrapped || !preferences || reminders === undefined || timer === undefined) continue
      try {
        const current = await getScheduler()
        if (permission === 'granted' && preferences.enabled && preferences.system && usesExactAlarmPermission && !channelsCreated) {
          const { LocalNotifications } = await plugin()
          // Android below API 26 has no concept of notification channels.
          const result = await Promise.allSettled(notificationChannels.map(channel => LocalNotifications.createChannel(channel)))
          channelsCreated = result.every(item => item.status === 'fulfilled' || /not available|unavailable/i.test(String(item.reason?.message)))
          if (!channelsCreated) throw new Error('无法配置通知渠道')
        }
        if (stopped) return
        await current.reconcile({ scope, state: timer, reminders, preferences, granted: permission === 'granted', exact }, !armed)
        armed = true
        reportedFailure = false
      } catch {
        if (!reportedFailure && !stopped) notify('系统提醒未更新，应用内提醒仍可使用。')
        reportedFailure = true
      }
    }
  }
  const request = () => {
    if (stopped) return Promise.resolve()
    dirty = true
    return running ??= reconcile().finally(() => { running = undefined; if (dirty) void request() })
  }
  const subscriptions = [
    repository.observePreferences().subscribe({
      next: value => { preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...value }; void request() },
      error: () => { preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false }; void request() },
    }),
    repository.observeSchedule().subscribe({
      next: value => { reminders = value; void request() },
      error: () => { reminders = null; void request() },
    }),
  ]
  const refresh = async () => {
    await readNativeNotificationPermissions()
    await request()
  }
  void (async () => {
    const { LocalNotifications } = await plugin()
    listeners.push(await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      void noteDelivery(notification).then(destination => {
        if (destination && !stopped) return open(destination)
      }).catch(() => undefined)
    }))
    listeners.push(await LocalNotifications.addListener('localNotificationReceived', notification => { void noteDelivery(notification) }))
    if (stopped) { await Promise.all(listeners.map(listener => listener.remove())); return }
    await (await getScheduler()).clear(scope)
    bootstrapped = true
    await refresh()
  })().catch(() => { if (!stopped) notify('系统通知不可用，应用内提醒仍可使用。') })
  runtime = {
    update: request,
    refresh,
    stop() {
      stopped = true
      for (const subscription of subscriptions) subscription.unsubscribe()
      for (const listener of listeners) void listener.remove()
      runtime = undefined
    },
  }
  return runtime
}
