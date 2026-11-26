import Dexie, { liveQuery, type EntityTable, type Transaction } from 'dexie'
import { Capacitor } from '@capacitor/core'
import { tableNames, type DatabaseObserver, type DatabaseTables, type Row, type TableName } from './DatabaseTables'
import { NativeDatabaseService } from './NativeDatabaseService'
import { ACCOUNT_IMPORT_ID, migrateAccountStorage } from './migrations/accountStorageMigration'
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
  HabitEntityRecord,
  HabitRecordEntity,
} from '../../types/database'
import { migrateLocalStorage } from './migrations/localStorageMigration'

export const DATABASE_NAME = 'focus-day'
export const DATABASE_VERSION = 6

export class FocusDayDatabase extends Dexie {
  tasks!: EntityTable<TaskRecord, 'id'>
  categories!: EntityTable<CategoryRecord, 'id'>
  focusSessions!: EntityTable<FocusSessionRecord, 'id'>
  timerStates!: EntityTable<TimerStateRecord, 'id'>
  userSettings!: EntityTable<UserSettingsRecord, 'id'>
  syncQueue!: EntityTable<SyncQueueRecord, 'id'>
  syncMetadata!: EntityTable<SyncMetadataRecord, 'id'>
  syncConflicts!: EntityTable<SyncConflictRecord, 'id'>
  habits!: EntityTable<HabitEntityRecord, 'id'>
  habitRecords!: EntityTable<HabitRecordEntity, 'id'>

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
    this.version(4).stores({
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
    this.version(5).stores({
      focusSessions: 'id, taskId, status, mode, startTime, endTime, sourceRecordId, createdAt, deletedAt, syncStatus, [taskId+endTime]',
    })
    this.version(DATABASE_VERSION).stores({
      tasks: 'id, status, categoryId, plannedDate, dueDate, completedAt, sortOrder, updatedAt, deletedAt, syncStatus, [status+sortOrder]',
      categories: 'id, name, updatedAt, deletedAt, syncStatus',
      focusSessions: 'id, taskId, habitId, status, mode, startTime, endTime, sourceRecordId, createdAt, deletedAt, syncStatus, [taskId+endTime]',
      timerStates: 'id, updatedAt, deletedAt, syncStatus',
      userSettings: 'id, updatedAt, deletedAt, syncStatus',
      syncQueue: 'id, entityType, entityId, operation, status, createdAt, updatedAt, deletedAt, syncStatus, nextAttemptAt, [entityType+entityId]',
      syncMetadata: 'id, updatedAt, deletedAt, syncStatus',
      syncConflicts: 'id, entityType, entityId, winner, reason, createdAt, deletedAt, [entityType+entityId]',
      habits: 'id, status, goalType, frequency, startDate, updatedAt, deletedAt, syncStatus',
      habitRecords: 'id, habitId, recordDate, updatedAt, deletedAt, syncStatus, &[habitId+recordDate]',
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
  readonly indexedDb: FocusDayDatabase
  private accountDb?: FocusDayDatabase
  private accountOwner?: string | null
  private initialization: Promise<void> | null = null

  constructor(name = DATABASE_NAME, private readonly native?: NativeDatabaseService) {
    this.indexedDb = new FocusDayDatabase(name)
  }

  private get webDb() { return this.accountDb ?? this.indexedDb }
  get db(): DatabaseTables { return this.native?.tables ?? this.webDb }
  get owner() { return this.accountOwner }

  selectOwner(owner: string | null) {
    if (this.accountOwner !== undefined) {
      if (owner !== this.accountOwner) throw new Error('切换账号时必须重新加载本地数据空间')
      return
    }
    if (this.initialization) throw new Error('必须在打开数据库之前选择账号')
    if (owner && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(owner)) throw new Error('本地账号标识无效')
    if (this.native) this.native.selectOwner(owner)
    else this.accountDb = new FocusDayDatabase(this.indexedDb.name + (owner ? '-user-' + owner : '-guest'))
    this.accountOwner = owner
  }

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (this.native ? this.openNative(this.native)
        : this.webDb.open().then(() => this.openWeb())).catch(error => {
        this.initialization = null
        throw Object.assign(new Error('本地数据库初始化失败'), { cause: error })
      })
    }
    return this.initialization
  }

  private async openNative(native: NativeDatabaseService) {
    await native.initialize()
    await migrateAccountStorage(native.owner ?? null, this.db, this.indexedDb, action => native.transaction(action))
  }

  private openWeb() {
    if (this.accountOwner === undefined) return migrateLocalStorage(this.webDb)
    const scope = this.accountOwner
    return this.webDb.syncMetadata.get(ACCOUNT_IMPORT_ID).then(async imported => {
      if (scope === null && !imported && !await Dexie.exists(this.indexedDb.name)) await migrateLocalStorage(this.webDb)
      await migrateAccountStorage(scope, this.db, this.indexedDb, action =>
        this.webDb.transaction('rw', tableNames.map(name => this.webDb[name]), async () => await action(this.db)))
    })
  }

  async transaction<T>(callback: (tables: DatabaseTables) => Promise<T>): Promise<T> {
    await this.initialize()
    return this.native ? this.native.transaction(callback)
      : this.webDb.transaction('rw', tableNames.map(name => this.webDb[name]), async () => await callback(this.db))
  }

  async read<T>(names: TableName[], callback: (tables: DatabaseTables) => Promise<T>): Promise<T> {
    await this.initialize()
    return this.native ? this.native.transaction(callback, false)
      : this.webDb.transaction('r', names.map(name => this.webDb[name]), async () => await callback(this.db))
  }

  observe<T>(names: TableName[], query: () => Promise<T>) {
    if (this.native) return this.native.observe(names, query)
    const observable = liveQuery(query)
    return { subscribe: (observer: DatabaseObserver<T>) => typeof observer === 'function'
      ? observable.subscribe(observer) : observable.subscribe(observer) }
  }

  async exportData(): Promise<DatabaseExport> {
    return this.read([...tableNames], async db => {
      const entries = await Promise.all(tableNames.map(async name => [name, await db[name].toArray()]))
      return {
        format: 'focus-day-database',
        schemaVersion: DATABASE_VERSION,
        exportedAt: new Date().toISOString(),
        data: Object.fromEntries(entries) as DatabaseExport['data'],
      }
    })
  }

  async restoreData(backup: DatabaseExport): Promise<void> {
    if (backup.format !== 'focus-day-database' || !backup.data) throw new Error('备份文件格式无效')
    await this.transaction(async db => {
      const restore = async <K extends TableName>(name: K) => {
        await db[name].clear()
        await db[name].bulkPut((backup.data[name] ?? []) as Row<K>[])
      }
      for (const name of tableNames) await restore(name)
    })
  }

  close(): void { this.webDb.close() }
  async closeForReload(): Promise<void> {
    if (this.native) await this.native.closeForReload()
    else this.close()
  }
  async delete(): Promise<void> {
    if (this.native) throw new Error('SQLite 账户空间必须通过数据清理事务管理')
    this.close()
    await Dexie.delete(this.webDb.name)
  }
}

export const databaseService = new DatabaseService(DATABASE_NAME,
  Capacitor.isNativePlatform() ? new NativeDatabaseService() : undefined)
