import type { Habit, HabitRepositoryPort } from '../../../types/habit'
import type { HabitEntityRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SyncQueueService } from '../../sync/SyncQueueService'

const clone = <T>(value: T): T => structuredClone(value)
const toHabit = (record: HabitEntityRecord): Habit => { const { syncStatus: _, version: _v, ...habit } = record; return clone(habit) }

export class HabitRepository implements HabitRepositoryPort {
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }
  async list(includeDeleted = false): Promise<Habit[]> {
    await this.database.initialize()
    return (await this.database.db.habits.toArray()).filter(item => includeDeleted || !item.deletedAt).map(toHabit).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  async findById(id: string): Promise<Habit | null> {
    await this.database.initialize(); const record = await this.database.db.habits.get(id)
    return !record || record.deletedAt ? null : toHabit(record)
  }
  async upsert(habit: Habit): Promise<Habit> {
    await this.database.transaction(async () => {
      const previous = await this.database.db.habits.get(habit.id)
      if (previous?.deletedAt) throw new Error('习惯已删除，无法编辑')
      const record: HabitEntityRecord = { ...clone(habit), syncStatus: 'PENDING', version: (previous?.version ?? 0) + 1 }
      await this.database.db.habits.put(record)
      await this.queue.enqueueWithinTransaction({ entityType: 'HABIT', entityId: habit.id, operation: previous ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: previous?.version ?? 0, baseUpdatedAt: previous?.updatedAt ?? null })
    })
    return clone(habit)
  }
  async softDelete(id: string): Promise<boolean> {
    return this.database.transaction(async () => {
      const previous = await this.database.db.habits.get(id)
      if (!previous || previous.deletedAt) return false
      const now = new Date().toISOString()
      const record: HabitEntityRecord = { ...previous, deletedAt: now, updatedAt: now, syncStatus: 'PENDING', version: previous.version + 1 }
      await this.database.db.habits.put(record)
      await this.queue.enqueueWithinTransaction({ entityType: 'HABIT', entityId: id, operation: 'DELETE', payload: record,
        baseVersion: previous.version, baseUpdatedAt: previous.updatedAt })
      return true
    })
  }
}
