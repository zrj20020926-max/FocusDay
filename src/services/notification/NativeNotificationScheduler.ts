import type { Channel, LocalNotificationsPlugin, LocalNotificationSchema, PendingLocalNotificationSchema } from '@capacitor/local-notifications'
import type { NotificationEvent, NotificationPreferences } from '../../types/notification'
import type { TimerState } from '../../types/timer'
import { allowsNotification } from './NotificationService'
import { upcomingReminderEvents, type ReminderSchedule } from './ReminderScheduler'
import { upcomingTimerEvents } from './TimerNotificationPlan'

export const NOTIFICATION_SOURCE = 'focus-day'
const SOUND = 'focus_day_chime.wav'
const ID_PREFIX = 0x40000000
const ID_MASK = 0x3fffffff
// Leave room under the iOS pending limit of 64 and prioritize the timer.
const REMINDER_LIMIT = 56

export const notificationChannels: Channel[] = ['timer', 'reminder'].flatMap((group, index) => {
  const name = index === 0 ? '专注与休息' : '任务和习惯'
  return [
    { id: `focus-day-${group}-sound`, name, importance: 3, visibility: 0, sound: SOUND },
    { id: `focus-day-${group}-silent`, name: name + '（静音）', importance: 2, visibility: 0 },
  ]
})

interface NotificationMetadata {
  source: typeof NOTIFICATION_SOURCE
  scope: string
  key: string
  signature: string
  destination: '/focus' | '/tasks' | '/habits'
}

export function notificationMetadata(notification: { extra?: unknown }): NotificationMetadata | undefined {
  const extra = notification.extra as Partial<NotificationMetadata> | undefined
  if (extra?.source !== NOTIFICATION_SOURCE || typeof extra.scope !== 'string' || typeof extra.key !== 'string' ||
    typeof extra.signature !== 'string' || !['/focus', '/tasks', '/habits'].includes(extra.destination ?? '')) return
  return extra as NotificationMetadata
}

export function stableNotificationId(key: string) {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
  return ID_PREFIX | (hash & ID_MASK)
}

function managedId(id: number) { return Number.isInteger(id) && id >= ID_PREFIX && id <= 0x7fffffff }

function notificationFor(event: NotificationEvent, scope: string, sound: boolean, exact: boolean): LocalNotificationSchema {
  const timer = event.id.startsWith('timer:')
  const destination = timer ? '/focus' : event.kind === 'TASK_DUE' ? '/tasks' : '/habits'
  const group = timer ? 'timer' : 'reminder'
  const key = scope + ':' + event.id
  return {
    id: stableNotificationId(key),
    title: event.title,
    // Keep task and habit names out of the lock screen and native alarm storage.
    body: timer ? event.body : '打开 Focus Day 查看提醒。',
    channelId: `focus-day-${group}-${sound ? 'sound' : 'silent'}`,
    sound: sound ? SOUND : undefined,
    schedule: { at: new Date(event.occurredAt), allowWhileIdle: timer },
    extra: { source: NOTIFICATION_SOURCE, scope, key, signature: `1:${event.occurredAt}:${sound}:${exact}`, destination } satisfies NotificationMetadata,
  }
}

interface ScheduleInput {
  scope: string
  state: TimerState | null
  reminders: ReminderSchedule | null
  preferences: NotificationPreferences
  granted: boolean
  exact: boolean
}

type Driver = Pick<LocalNotificationsPlugin, 'schedule' | 'cancel' | 'getPending' | 'getDeliveredNotifications' | 'removeDeliveredNotifications'>

export class NativeNotificationScheduler {
  private pending: Promise<unknown> = Promise.resolve()

  constructor(private readonly driver: Driver, private readonly now = () => Date.now()) {}

  private serialize(operation: () => Promise<void>): Promise<void> {
    const result = this.pending.then(operation)
    this.pending = result.catch(() => undefined)
    return result
  }

  reconcile(input: ScheduleInput, rearm = false): Promise<void> {
    return this.serialize(async () => {
      const now = this.now()
      const { scope, state, reminders, preferences, granted, exact } = input
      const desired = new Map<number, LocalNotificationSchema>()
      if (granted && preferences.enabled && preferences.system) {
        const events = upcomingTimerEvents(state, now).filter(event => allowsNotification(event, preferences))
        if (reminders) events.push(...upcomingReminderEvents(reminders, now)
          .filter(event => allowsNotification(event, preferences)).slice(0, REMINDER_LIMIT))
        for (const event of events) {
          const notification = notificationFor(event, scope, preferences.sound, exact)
          while (desired.has(notification.id)) notification.id = ID_PREFIX | ((notification.id + 1) & ID_MASK)
          desired.set(notification.id, notification)
        }
      }
      const pending = (await this.driver.getPending()).notifications.filter(item => managedId(item.id))
      const obsolete = pending.filter(item => {
        const replacement = desired.get(item.id)
        return !replacement || notificationMetadata(item)?.key !== notificationMetadata(replacement)?.key
      })
      await this.cancel(obsolete)
      const installed = new Map(pending.map(item => [item.id, notificationMetadata(item)]))
      const updates = [...desired.values()].filter(item => {
        const current = installed.get(item.id)
        const next = notificationMetadata(item)
        return rearm || current?.key !== next?.key || current?.signature !== next?.signature
      })
      if (updates.length) await this.driver.schedule({ notifications: updates })
    })
  }

  clear(scope?: string): Promise<void> {
    return this.serialize(async () => {
      const pending = (await this.driver.getPending()).notifications.filter(item =>
        managedId(item.id) && (scope === undefined || notificationMetadata(item)?.scope !== scope))
      await this.cancel(pending)
      if (scope !== undefined) return
      const delivered = (await this.driver.getDeliveredNotifications()).notifications.filter(item => managedId(item.id))
      if (delivered.length) await this.driver.removeDeliveredNotifications({ notifications: delivered })
    })
  }

  private async cancel(items: PendingLocalNotificationSchema[]) {
    if (items.length) await this.driver.cancel({ notifications: items.map(({ id }) => ({ id })) })
  }
}
