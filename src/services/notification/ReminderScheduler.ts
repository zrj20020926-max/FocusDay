import type { Habit } from '../../types/habit'
import { localDateKey, type Task } from '../../types/task'
import type { HabitReminder, NotificationEvent, TaskReminder } from '../../types/notification'
import type { NotificationService } from './NotificationService'

export interface ReminderSchedule {
  tasks: { target: Pick<Task, 'id' | 'title' | 'status' | 'dueDate'>; rule: TaskReminder }[]
  habits: { target: Pick<Habit, 'id' | 'name' | 'frequency' | 'startDate' | 'status' | 'weekdays'>; rule: HabitReminder }[]
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const REMINDER_MAX_DELAY = 60 * 60_000

export function isTaskReminder(value: unknown): value is TaskReminder {
  if (!value || typeof value !== 'object') return false
  if ('kind' in value && value.kind === 'AT' && 'at' in value) {
    return typeof value.at === 'number' && Number.isSafeInteger(value.at) && value.at > 0 && !Number.isNaN(new Date(value.at).getTime())
  }
  return 'kind' in value && value.kind === 'BEFORE_DUE' && 'minutes' in value
    && typeof value.minutes === 'number' && Number.isInteger(value.minutes) && value.minutes >= 0 && value.minutes <= 7 * 24 * 60
}

export function isHabitReminder(value: unknown): value is HabitReminder {
  return !!value && typeof value === 'object' && 'kind' in value && value.kind === 'DAILY'
    && 'time' in value && typeof value.time === 'string' && TIME.test(value.time)
}

function taskEvents(schedule: ReminderSchedule): NotificationEvent[] {
  const events: NotificationEvent[] = []

  for (const { target, rule } of schedule.tasks) {
    if (target.status === 'COMPLETED') continue
    let at: number
    if (rule.kind === 'AT') at = rule.at
    else {
      if (!target.dueDate) continue
      // The task stores a calendar date, so its deadline is the end of that local day.
      const deadline = new Date(`${target.dueDate}T00:00:00`)
      deadline.setDate(deadline.getDate() + 1)
      at = deadline.getTime() - rule.minutes * 60_000
    }
    if (!Number.isFinite(at)) continue
    const suffix = rule.kind === 'AT' ? `at:${at}` : `due:${target.dueDate}:${rule.minutes}`
    events.push({
      id: `task:${target.id}:${suffix}`, kind: 'TASK_DUE',
      title: rule.kind === 'AT' ? '任务提醒' : '任务截止提醒', body: target.title, occurredAt: at,
    })
  }

  return events
}

function habitEvents(schedule: ReminderSchedule, day: Date): NotificationEvent[] {
  const events: NotificationEvent[] = []
  const dateKey = localDateKey(day)
  for (const { target, rule } of schedule.habits) {
    if (target.status !== 'ACTIVE' || dateKey < target.startDate) continue
    if (target.frequency === 'WEEKDAYS' && !target.weekdays.includes(day.getDay())) continue
    const [hours, minutes] = rule.time.split(':').map(Number)
    // setHours follows the device time zone, advancing nonexistent DST wall times.
    const at = new Date(day).setHours(hours, minutes, 0, 0)
    events.push({
      id: `habit:${target.id}:${dateKey}`, kind: 'HABIT_DAILY',
      title: '习惯提醒', body: target.name, occurredAt: at,
    })
  }
  return events
}

export function reminderEvents(schedule: ReminderSchedule, now: number): NotificationEvent[] {
  const today = new Date(now)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  return [...taskEvents(schedule), ...habitEvents(schedule, yesterday), ...habitEvents(schedule, today)]
    .filter(event => event.occurredAt <= now && now - event.occurredAt <= REMINDER_MAX_DELAY)
    .sort((a, b) => a.occurredAt - b.occurredAt)
}

export function upcomingReminderEvents(schedule: ReminderSchedule, now: number): NotificationEvent[] {
  const events = taskEvents(schedule)
  const day = new Date(now)
  for (let index = 0; index < 7; index++) {
    events.push(...habitEvents(schedule, day))
    day.setDate(day.getDate() + 1)
  }
  return events.filter(event => event.occurredAt > now).sort((a, b) => a.occurredAt - b.occurredAt)
}

export class ReminderScheduler {
  private schedule: ReminderSchedule | null = null
  private running: Promise<void> | null = null
  private needsCheck = false

  constructor(private readonly notifications: Pick<NotificationService, 'publish'>, private readonly now = () => Date.now()) {}

  replace(schedule: ReminderSchedule | null) {
    this.schedule = schedule
    return this.check()
  }

  check(): Promise<void> {
    this.needsCheck = true
    if (!this.running) this.running = this.drain().finally(() => {
      this.running = null
      if (this.needsCheck) void this.check()
    })
    return this.running
  }

  private async drain() {
    while (this.needsCheck) {
      this.needsCheck = false
      const schedule = this.schedule
      if (!schedule) continue
      for (const event of reminderEvents(schedule, this.now())) {
        if (this.schedule !== schedule) break
        await this.notifications.publish(event, () => this.schedule === schedule).catch(() => undefined)
      }
    }
  }
}
