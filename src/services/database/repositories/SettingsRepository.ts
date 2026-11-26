import type { UserSettingsRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SyncQueueService } from '../../sync/SyncQueueService'
import type { DatabaseTables } from '../DatabaseTables'

export class SettingsRepository {
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }

  async get<T>(id: string): Promise<T | null> {
    await this.database.initialize()
    const record = await this.database.db.userSettings.get(id)
    return !record || record.deletedAt ? null : structuredClone(record.value as T)
  }

  async set<T>(id: string, value: T): Promise<void> {
    await this.database.transaction(async db => {
      const current = await db.userSettings.get(id)
      const now = new Date().toISOString()
      const record: UserSettingsRecord = {
        id, value: structuredClone(value), createdAt: current?.createdAt ?? now, updatedAt: now,
        deletedAt: null, syncStatus: 'PENDING', version: (current?.version ?? 0) + 1,
      }
      await db.userSettings.put(record)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'USER_SETTING', entityId: id, operation: current ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: current?.version ?? 0, baseUpdatedAt: current?.updatedAt ?? null })
    })
  }

  async setOnce<T>(id: string, value: T, transaction?: DatabaseTables): Promise<{ value: T; created: boolean }> {
    const save = async (db: DatabaseTables) => {
      const current = await db.userSettings.get(id)
      if (current && !current.deletedAt) return { value: current.value as T, created: false }
      const now = new Date().toISOString()
      const record: UserSettingsRecord = { id, value: structuredClone(value), createdAt: current?.createdAt ?? now, updatedAt: now,
        deletedAt: null, syncStatus: 'PENDING', version: (current?.version ?? 0) + 1 }
      await db.userSettings.put(record)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'USER_SETTING', entityId: id, operation: current ? 'UPDATE' : 'INSERT',
        payload: record, baseVersion: current?.version ?? 0, baseUpdatedAt: current?.updatedAt ?? null })
      return { value, created: true }
    }
    return transaction ? save(transaction) : this.database.transaction(save)
  }

  async delete(id: string): Promise<boolean> {
    return this.database.transaction(async db => {
      const current = await db.userSettings.get(id)
      if (!current || current.deletedAt) return false
      const now = new Date().toISOString()
      const record = { ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING' as const, version: current.version + 1 }
      await db.userSettings.put(record)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'USER_SETTING', entityId: id, operation: 'DELETE', payload: record,
        baseVersion: current.version, baseUpdatedAt: current.updatedAt })
      return true
    })
  }
}
