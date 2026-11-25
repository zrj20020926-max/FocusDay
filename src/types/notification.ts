export interface NotificationPreferences {
  enabled: boolean
  system: boolean
  sound: boolean
  tasks: boolean
  habits: boolean
  breaks: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true, system: false, sound: false, tasks: true, habits: true, breaks: true,
}

export const NOTIFICATION_SETTINGS_KEY = 'notifications'
export const REMINDER_PREFIX = 'reminder:'

export type TaskReminder = { kind: 'AT'; at: number } | { kind: 'BEFORE_DUE'; minutes: number }
export interface HabitReminder { kind: 'DAILY'; time: string }
export type ReminderTarget = 'task' | 'habit'
export type ReminderRule = TaskReminder | HabitReminder

export const reminderKey = (target: ReminderTarget, id: string) => `${REMINDER_PREFIX}${target}:${id}`

export type NotificationKind = 'POMODORO_COMPLETE' | 'COUNTDOWN_COMPLETE' | 'SHORT_BREAK_COMPLETE' | 'LONG_BREAK_COMPLETE' | 'TASK_DUE' | 'HABIT_DAILY'
export interface NotificationEvent {
  id: string
  kind: NotificationKind
  title: string
  body: string
  occurredAt: number
}

export type BrowserNotificationPermission = NotificationPermission | 'unsupported'
