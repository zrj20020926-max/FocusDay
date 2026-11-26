import { describe, expect, it, vi } from 'vitest'
import type { LocalNotificationSchema, LocalNotificationsPlugin } from '@capacitor/local-notifications'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../types/notification'
import { TimerService } from '../timer/TimerService'
import { NativeNotificationScheduler, notificationMetadata } from './NativeNotificationScheduler'
import { upcomingTimerEvents } from './TimerNotificationPlan'
import { upcomingReminderEvents, type ReminderSchedule } from './ReminderScheduler'

function fixture() {
  const pending = new Map<number, LocalNotificationSchema>()
  const driver = {
    getPending: vi.fn(async () => ({ notifications: [...pending.values()] })),
    schedule: vi.fn<LocalNotificationsPlugin['schedule']>(async ({ notifications }) => {
      for (const notification of notifications) pending.set(notification.id, notification)
      return { notifications: notifications.map(({ id }) => ({ id })) }
    }),
    cancel: vi.fn<LocalNotificationsPlugin['cancel']>(async ({ notifications }) => {
      for (const { id } of notifications) pending.delete(id)
    }),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: [] })),
    removeDeliveredNotifications: vi.fn(async () => undefined),
  }
  let now = new Date(2026, 10, 26, 9).getTime()
  const timer = new TimerService({ load: () => null, save: () => undefined }, { now: () => now })
  const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, system: true }
  const scheduler = new NativeNotificationScheduler(driver, () => now)
  const update = (options: Partial<Parameters<typeof scheduler.reconcile>[0]> = {}, rearm = false) =>
    scheduler.reconcile({ scope: 'guest', state: timer.getState(), reminders: null, preferences, granted: true, exact: false, ...options }, rearm)
  return { driver, timer, update, scheduler, pending, preferences, now: () => now, advance: (by: number) => { now += by } }
}

describe('native notification scheduling', () => {
  it('uses the engine boundaries, including a long break, without changing real state', () => {
    const { timer, now } = fixture()
    timer.updateConfig({ pomodoro: { focusDuration: 60_000, longBreakDuration: 90_000, longBreakEvery: 1 } })
    const state = timer.start()
    expect(upcomingTimerEvents(state, now()).map(item => [item.kind, item.occurredAt - now()])).toEqual([
      ['POMODORO_COMPLETE', 60_000], ['LONG_BREAK_COMPLETE', 150_000], ['POMODORO_COMPLETE', 210_000],
    ])
    expect(timer.getState()).toEqual(state)
    expect(timer.getRecords()).toEqual([])
    timer.cancel()
    expect(upcomingTimerEvents(timer.start('STOPWATCH'), now())).toEqual([])
  })

  it('deduplicates updates, cancels on pause and finish, and resumes at the new timestamp with the same ID', async () => {
    const { timer, update, driver, pending, advance } = fixture()
    const first = timer.start('COUNTDOWN', { countdownDuration: 60_000 })
    await Promise.all([update(), update()])
    expect(driver.schedule).toHaveBeenCalledTimes(1)
    const [initial] = pending.values()
    expect(initial.schedule?.at?.getTime()).toBe(first.endTime)
    advance(10_000)
    timer.pause()
    await update()
    expect(pending.size).toBe(0)
    advance(15_000)
    const resumed = timer.resume()
    await update()
    expect(pending.get(initial.id)?.schedule?.at?.getTime()).toBe(resumed.endTime)
    timer.finish()
    await update()
    expect(pending.size).toBe(0)
  })

  it('cancels on denial or account change, rearms after cold start and updates permissions and sound channels', async () => {
    const { timer, driver, update, pending, preferences, scheduler } = fixture()
    timer.start()
    await update({ granted: false })
    expect(pending.size).toBe(0)
    await update()
    await update({}, true)
    expect(driver.schedule).toHaveBeenCalledTimes(2)
    await update({ exact: true, preferences: { ...preferences, sound: true, breaks: false } })
    expect([...pending.values()].every(item => item.channelId === 'focus-day-timer-sound')).toBe(true)
    expect([...pending.values()].some(item => item.title.includes('休息结束'))).toBe(false)
    await scheduler.clear('different-account')
    expect(pending.size).toBe(0)
    await update()
    timer.cancel()
    await update()
    expect(pending.size).toBe(0)
  })

  it('schedules absolute task deadlines and only eligible weekday habits, then removes changed reminders', async () => {
    const { update, pending, now } = fixture()
    const today = new Date(now()).getDay()
    const schedule: ReminderSchedule = {
      tasks: [{ target: { id: 'task', title: '私有任务', status: 'TODO', dueDate: null }, rule: { kind: 'AT', at: now() + 20_000 } }],
      habits: [{ target: { id: 'habit', name: '私有习惯', frequency: 'WEEKDAYS', startDate: '2026-01-01', status: 'ACTIVE', weekdays: [today] },
        rule: { kind: 'DAILY', time: '10:00' } }],
    }
    expect(upcomingReminderEvents(schedule, now())).toHaveLength(2)
    await update({ reminders: schedule })
    expect([...pending.values()].map(item => notificationMetadata(item)?.destination)).toEqual(['/tasks', '/habits'])
    expect([...pending.values()].every(item => !item.body.includes('私有'))).toBe(true)
    await update({ reminders: { tasks: [], habits: [] } })
    expect(pending.size).toBe(0)
  })
})
