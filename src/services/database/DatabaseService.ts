import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type {
  CategoryRecord,
  DatabaseExport,
  FocusSessionRecord,
  SyncMetadataRecord,
  SyncConflictRecord,
  SyncQueueRecord,
  TaskRecord,
  TimerStateRecord,
  UserSettingsRecord,
} from '../../types/database'
import { migrateLocalStorage } from './migrations/localStorageMigration'

export const DATABASE_NAME = 'focus-day'
export const DATABASE_VERSION = 4

export class FocusDayDatabase extends Dexie {
  tasks!: EntityTable<TaskRecord, 'id'>
  categories!: EntityTable<CategoryRecord, 'id'>
  focusSessions!: EntityTable<FocusSessionRecord, 'id'>
  timerStates!: EntityTable<TimerStateRecord, 'id'>
  userSettings!: EntityTable<UserSettingsRecord, 'id'>
  syncQueue!: EntityTable<SyncQueueRecord, 'id'>
  syncMetadata!: EntityTable<SyncMetadataRecord, 'id'>
  syncConflicts!: EntityTable<SyncConflictRecord, 'id'>

  constructor(name = DATABASE_NAME) {
    super(name)
    this.version(1).stores({
      tasks: 'id, status, categoryId, plannedDate, dueDate, sortOrder, updatedAt',
      categories: 'id, name, updatedAt',
      focusSessions: 'id, taskId, status, mode, startTime, endTime',
      timerStates: 'id, updatedAt',
      userSettings: 'id, updatedAt',
      syncQueue: 'id, entityType, entityId, operation, updatedAt',
      syncMetadata: 'id, updatedAt',
    })
    this.version(2).stores({
      tasks: 'id, status, categoryId, plannedDate, dueDate, sortOrder, updatedAt, deletedAt, syncStatus, [status+sortOrder]',
      categories: 'id, name, updatedAt, deletedAt, syncStatus',
      focusSessions: 'id, taskId, status, mode, startTime, endTime, createdAt, deletedAt, syncStatus, [taskId+endTime]',
      timerStates: 'id, updatedAt, deletedAt, syncStatus',
      userSettings: 'id, updatedAt, deletedAt, syncStatus',
      syncQueue: 'id, entityType, entityId, operation, updatedAt, deletedAt, syncStatus, [entityType+entityId]',
      syncMetadata: 'id, updatedAt, deletedAt, syncStatus',
    }).upgrade(async transaction => {
      const now = new Date().toISOString()
      await Promise.all([
        this.addSyncMetadata(transaction, 'tasks', now), this.addSyncMetadata(transaction, 'categories', now),
        this.addNumericSyncMetadata(transaction, 'focusSessions'), this.addSyncMetadata(transaction, 'timerStates', now),
        this.addSyncMetadata(transaction, 'userSettings', now), this.addSyncMetadata(transaction, 'syncQueue', now),
        this.addSyncMetadata(transaction, 'syncMetadata', now),
      ])
    })
    this.version(DATABASE_VERSION).stores({
      tasks: 'id, status, categoryId, plannedDate, dueDate, sortOrder, updatedAt, deletedAt, syncStatus, [status+sortOrder]',
      categories: 'id, name, updatedAt, deletedAt, syncStatus',
      focusSessions: 'id, taskId, status, mode, startTime, endTime, createdAt, deletedAt, syncStatus, [taskId+endTime]',
      timerStates: 'id, updatedAt, deletedAt, syncStatus',
      userSettings: 'id, updatedAt, deletedAt, syncStatus',
      syncQueue: 'id, entityType, entityId, operation, status, createdAt, updatedAt, deletedAt, syncStatus, nextAttemptAt, [entityType+entityId]',
      syncMetadata: 'id, updatedAt, deletedAt, syncStatus',
      syncConflicts: 'id, entityType, entityId, winner, reason, createdAt, deletedAt, [entityType+entityId]',
    }).upgrade(async transaction => {
      const now = new Date().toISOString()
      await transaction.table('syncQueue').toCollection().modify(record => {
        record.operation = record.operation === 'DELETE' ? 'DELETE' : 'UPDATE'
        record.baseVersion ??= Math.max(0, (record.version ?? 1) - 1)
        record.baseUpdatedAt ??= null
        record.retryCount ??= record.attempts ?? 0
        record.status ??= 'PENDING'
        record.nextAttemptAt ??= null
        record.lastError ??= null
        record.updatedAt ??= now
      })
    })
  }

  private addSyncMetadata(transaction: Transaction, tableName: string, now: string) {
    return transaction.table(tableName).toCollection().modify(record => {
      record.createdAt ??= now
      record.updatedAt ??= now
      record.deletedAt ??= null
      record.syncStatus ??= 'LOCAL'
      record.version ??= 1
    })
  }

  private addNumericSyncMetadata(transaction: Transaction, tableName: string) {
    const now = Date.now()
    return transaction.table(tableName).toCollection().modify(record => {
      record.createdAt ??= now
      record.updatedAt ??= now
      record.deletedAt ??= null
      record.syncStatus ??= 'LOCAL'
      record.version ??= 1
    })
  }
}

export class DatabaseService {
  readonly db: FocusDayDatabase
  private initialization: Promise<void> | null = null

  constructor(name = DATABASE_NAME) {
    this.db = new FocusDayDatabase(name)
  }

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.db.open().then(() => migrateLocalStorage(this.db)).catch(error => {
        this.initialization = null
        throw new Error(`本地数据库初始化失败：${error instanceof Error ? error.message : String(error)}`)
      })
    }
    return this.initialization
  }

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.initialize()
    return this.db.transaction('rw', [this.db.tasks, this.db.categories, this.db.focusSessions, this.db.timerStates,
      this.db.userSettings, this.db.syncQueue, this.db.syncMetadata, this.db.syncConflicts], callback)
  }

  async exportData(): Promise<DatabaseExport> {
    await this.initialize()
    return this.db.transaction('r', [this.db.tasks, this.db.categories, this.db.focusSessions, this.db.timerStates,
      this.db.userSettings, this.db.syncQueue, this.db.syncMetadata, this.db.syncConflicts], async () => ({
        format: 'focus-day-database',
        schemaVersion: DATABASE_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          tasks: await this.db.tasks.toArray(),
          categories: await this.db.categories.toArray(),
          focusSessions: await this.db.focusSessions.toArray(),
          timerStates: await this.db.timerStates.toArray(),
          userSettings: await this.db.userSettings.toArray(),
          syncQueue: await this.db.syncQueue.toArray(),
          syncMetadata: await this.db.syncMetadata.toArray(),
          syncConflicts: await this.db.syncConflicts.toArray(),
        },
      }))
  }

  async restoreData(backup: DatabaseExport): Promise<void> {
    if (backup.format !== 'focus-day-database' || !backup.data) throw new Error('备份文件格式无效')
    await this.transaction(async () => {
      const tables = [this.db.tasks, this.db.categories, this.db.focusSessions, this.db.timerStates,
        this.db.userSettings, this.db.syncQueue, this.db.syncMetadata, this.db.syncConflicts]
      await Promise.all(tables.map(table => table.clear()))
      await this.db.tasks.bulkPut(backup.data.tasks ?? [])
      await this.db.categories.bulkPut(backup.data.categories ?? [])
      await this.db.focusSessions.bulkPut(backup.data.focusSessions ?? [])
      await this.db.timerStates.bulkPut(backup.data.timerStates ?? [])
      await this.db.userSettings.bulkPut(backup.data.userSettings ?? [])
      await this.db.syncQueue.bulkPut(backup.data.syncQueue ?? [])
      await this.db.syncMetadata.bulkPut(backup.data.syncMetadata ?? [])
      await this.db.syncConflicts.bulkPut(backup.data.syncConflicts ?? [])
    })
  }

  close(): void { this.db.close() }
  async delete(): Promise<void> { this.db.close(); await Dexie.delete(this.db.name) }
}

export const databaseService = new DatabaseService()
