import { NOTIFICATION_SETTINGS_KEY, REMINDER_PREFIX, reminderKey, type NotificationPreferences, type ReminderRule, type ReminderTarget } from '../../../types/notification'
import { isHabitReminder, isTaskReminder, type ReminderSchedule } from '../../notification/ReminderScheduler'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SettingsRepository } from './SettingsRepository'

const DELIVERY_PREFIX = 'notification:delivered:'
const RECEIPT_RETENTION = 7 * 24 * 60 * 60_000

export class ReminderRepository {
  private readonly settings: SettingsRepository

  constructor(private readonly database: DatabaseService = databaseService) {
    this.settings = new SettingsRepository(database)
  }

  read() { return this.settings.get<Partial<NotificationPreferences>>(NOTIFICATION_SETTINGS_KEY) }
  write(value: NotificationPreferences) { return this.settings.set(NOTIFICATION_SETTINGS_KEY, value) }

  observePreferences() { return this.database.observe(['userSettings'], () => this.read()) }

  observeRule(target: ReminderTarget, id: string) {
    return this.database.observe(['userSettings'], async () => {
      const rule = await this.settings.get<unknown>(reminderKey(target, id))
      return (target === 'task' ? isTaskReminder(rule) : isHabitReminder(rule)) ? rule as ReminderRule : null
    })
  }

  async saveRule(target: ReminderTarget, id: string, rule: ReminderRule | null): Promise<void> {
    const key = reminderKey(target, id)
    if (!rule) { await this.settings.delete(key); return }
    if (!(target === 'task' ? isTaskReminder(rule) : isHabitReminder(rule))) throw new Error('提醒时间无效')
    await this.settings.set(key, rule)
  }

  observeSchedule() { return this.database.observe(['userSettings', 'tasks', 'habits'], () => this.schedule()) }

  async schedule(): Promise<ReminderSchedule> {
    await this.database.initialize()
    return this.database.read(['userSettings', 'tasks', 'habits'], async db => {
      const settings = await db.userSettings.where('id').startsWith(REMINDER_PREFIX).filter(row => !row.deletedAt).toArray()
      const tasks: ReminderSchedule['tasks'] = []
      const habits: ReminderSchedule['habits'] = []
      for (const setting of settings) {
        if (setting.id.startsWith('reminder:task:') && isTaskReminder(setting.value)) {
          const target = await db.tasks.get(setting.id.slice('reminder:task:'.length))
          if (target && !target.deletedAt) tasks.push({ target, rule: setting.value })
        }
        if (setting.id.startsWith('reminder:habit:') && isHabitReminder(setting.value)) {
          const target = await db.habits.get(setting.id.slice('reminder:habit:'.length))
          if (target && !target.deletedAt) habits.push({ target, rule: setting.value })
        }
      }
      return { tasks, habits }
    })
  }

  async claim(id: string, now: number): Promise<boolean> {
    await this.database.initialize()
    const timestamp = new Date(now).toISOString()
    try {
      // Local receipt and unique primary key. Two tabs cannot both claim an event.
      await this.database.db.syncMetadata.add({
        id: DELIVERY_PREFIX + id, value: null, cursor: null, lastSyncedAt: null,
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, syncStatus: 'LOCAL', version: 1,
      })
      return true
    } catch (error) {
      if (error instanceof Error && error.name === 'ConstraintError') return false
      throw error
    }
  }

  async prune(now = Date.now()): Promise<void> {
    await this.database.initialize()
    const cutoff = new Date(now - RECEIPT_RETENTION).toISOString()
    await this.database.db.syncMetadata.where('id').startsWith(DELIVERY_PREFIX).filter(row => row.createdAt < cutoff).delete()
  }
}
