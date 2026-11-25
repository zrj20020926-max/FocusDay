import type { HabitRecord, HabitRecordRepositoryPort } from '../../../types/habit'
import type { HabitRecordEntity } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SyncQueueService } from '../../sync/SyncQueueService'

const clone = <T>(value: T): T => structuredClone(value)
const toDomain = (record: HabitRecordEntity): HabitRecord => { const { syncStatus: _, version: _v, ...value } = record; return clone(value) }

export class HabitRecordRepository implements HabitRecordRepositoryPort {
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }
  async listByHabit(habitId: string, includeDeleted = false): Promise<HabitRecord[]> {
    await this.database.initialize(); return (await this.database.db.habitRecords.where('habitId').equals(habitId).toArray())
      .filter(item => includeDeleted || !item.deletedAt).map(toDomain).sort((a, b) => b.recordDate.localeCompare(a.recordDate))
  }
  async listRange(startDate: string, endDate: string): Promise<HabitRecord[]> {
    await this.database.initialize(); return (await this.database.db.habitRecords.where('recordDate').between(startDate, endDate, true, true).toArray())
      .filter(item => !item.deletedAt).map(toDomain)
  }
  async findByHabitDate(habitId: string, recordDate: string): Promise<HabitRecord | null> {
    await this.database.initialize(); const record = await this.database.db.habitRecords.where('[habitId+recordDate]').equals([habitId, recordDate]).first()
    return !record || record.deletedAt ? null : toDomain(record)
  }
  async upsert(value: HabitRecord): Promise<HabitRecord> {
    return this.database.transaction(async () => {
      const habit = await this.database.db.habits.get(value.habitId)
      if (!habit || habit.deletedAt) throw new Error('习惯已删除，无法打卡')
      if (habit.status === 'PAUSED' && value.manualValue > 0) throw new Error('习惯已暂停，无法打卡')
      const previous = await this.database.db.habitRecords.where('[habitId+recordDate]').equals([value.habitId, value.recordDate]).first()
      if (previous && !previous.deletedAt && previous.manualValue === value.manualValue) return toDomain(previous)
      const id = previous?.id ?? value.id
      const record: HabitRecordEntity = { ...clone(value), id, createdAt: previous?.createdAt ?? value.createdAt,
        syncStatus: 'PENDING', version: (previous?.version ?? 0) + 1 }
      await this.database.db.habitRecords.put(record)
      await this.queue.enqueueWithinTransaction({ entityType: 'HABIT_RECORD', entityId: id, operation: previous ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: previous?.version ?? 0, baseUpdatedAt: previous?.updatedAt ?? null })
      return toDomain(record)
    })
  }
  async bulkUpsert(values: HabitRecord[]): Promise<HabitRecord[]> {
    return this.database.transaction(async () => {
      const results: HabitRecord[] = []
      for (const value of values) results.push(await this.upsert(value))
      return results
    })
  }
  async softDelete(id: string): Promise<boolean> {
    return this.database.transaction(async () => {
      const previous = await this.database.db.habitRecords.get(id)
      if (!previous || previous.deletedAt) return false
      const now = new Date().toISOString()
      const record: HabitRecordEntity = { ...previous, deletedAt: now, updatedAt: now, syncStatus: 'PENDING', version: previous.version + 1 }
      await this.database.db.habitRecords.put(record)
      await this.queue.enqueueWithinTransaction({ entityType: 'HABIT_RECORD', entityId: id, operation: 'DELETE', payload: record,
        baseVersion: previous.version, baseUpdatedAt: previous.updatedAt })
      return true
    })
  }
}
