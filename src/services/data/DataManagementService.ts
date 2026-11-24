import type { CategoryRecord, FocusSessionRecord, TaskRecord, UserSettingsRecord } from '../../types/database'
import { DataManagementError, USER_DATA_FORMAT, USER_DATA_SCHEMA_VERSION, type ImportSummary, type UserDataBackup } from '../../types/dataManagement'
import { TASK_PRIORITIES, TASK_STATUSES } from '../../types/task'
import { TIMER_MODES } from '../../types/timer'
import { DatabaseService, databaseService } from '../database/DatabaseService'
import { SyncQueueService } from '../sync/SyncQueueService'

const LEGACY_MIGRATION_ID = 'migration:local-storage:v1'
const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isIso = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const unique = (values: string[]) => new Set(values).size === values.length

export class DataManagementService {
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }

  async createBackup(ownerId: string | null): Promise<UserDataBackup> {
    try {
      await this.database.initialize()
      const [tasks, categories, focusSessions, settings] = await Promise.all([
        this.database.db.tasks.filter(item => !item.deletedAt).toArray(),
        this.database.db.categories.filter(item => !item.deletedAt).toArray(),
        this.database.db.focusSessions.filter(item => !item.deletedAt).toArray(),
        this.database.db.userSettings.filter(item => !item.deletedAt).toArray(),
      ])
      return {
        format: USER_DATA_FORMAT, schemaVersion: USER_DATA_SCHEMA_VERSION, backupId: crypto.randomUUID(),
        exportedAt: new Date().toISOString(), ownerId,
        data: {
          tasks: tasks.map(({ deletedAt: _, syncStatus: _s, version: _v, ...item }) => structuredClone(item)),
          categories: categories.map(({ deletedAt: _, syncStatus: _s, version: _v, ...item }) => structuredClone(item)),
          focusSessions: focusSessions.map(({ updatedAt: _, deletedAt: _d, syncStatus: _s, version: _v, ...item }) => structuredClone(item)),
          userSettings: settings.map(item => ({ key: item.id, value: structuredClone(item.value) })),
        },
      }
    } catch (error) {
      if (error instanceof DataManagementError) throw error
      throw new DataManagementError('无法读取本地数据，请刷新页面后重试', 'DATABASE_ERROR')
    }
  }

  download(backup: UserDataBackup): void {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `focus-day-backup-${backup.exportedAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  parse(text: string): UserDataBackup {
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new DataManagementError('所选文件不是有效的 JSON 文件', 'INVALID_FORMAT') }
    return this.validate(value)
  }

  validate(value: unknown): UserDataBackup {
    if (!isObject(value) || value.format !== USER_DATA_FORMAT) throw new DataManagementError('这不是 Focus Day 数据备份文件', 'INVALID_FORMAT')
    if (value.schemaVersion !== USER_DATA_SCHEMA_VERSION) throw new DataManagementError(`暂不支持此备份版本（${String(value.schemaVersion)}）`, 'UNSUPPORTED_VERSION')
    if (typeof value.backupId !== 'string' || !value.backupId || !isIso(value.exportedAt) || !isStringOrNull(value.ownerId) || !isObject(value.data)) {
      throw new DataManagementError('备份文件缺少必要的元数据', 'INVALID_DATA')
    }
    const { tasks, categories, focusSessions, userSettings } = value.data
    if (![tasks, categories, focusSessions, userSettings].every(Array.isArray)) throw new DataManagementError('备份文件的数据列表不完整', 'INVALID_DATA')
    if (!unique(categories.map((item: any) => item?.id)) || !unique(tasks.map((item: any) => item?.id)) || !unique(focusSessions.map((item: any) => item?.id)) || !unique(userSettings.map((item: any) => item?.key))) {
      throw new DataManagementError('备份文件包含重复的数据 ID', 'INVALID_DATA')
    }
    const validCategory = (item: any) => isObject(item) && typeof item.id === 'string' && typeof item.name === 'string' && /^#[0-9a-f]{6}$/i.test(item.color)
      && typeof item.icon === 'string' && typeof item.isDefault === 'boolean' && isIso(item.createdAt) && isIso(item.updatedAt)
    const validTask = (item: any) => isObject(item) && typeof item.id === 'string' && typeof item.title === 'string' && item.title.trim()
      && typeof item.description === 'string' && typeof item.categoryId === 'string' && TASK_PRIORITIES.includes(item.priority) && TASK_STATUSES.includes(item.status)
      && isStringOrNull(item.plannedDate) && isStringOrNull(item.dueDate) && isFiniteNumber(item.estimatedDuration) && isFiniteNumber(item.estimatedPomodoros)
      && isFiniteNumber(item.sortOrder) && isStringOrNull(item.completedAt) && isIso(item.createdAt) && isIso(item.updatedAt)
    const validSession = (item: any) => isObject(item) && typeof item.id === 'string' && isStringOrNull(item.taskId) && TIMER_MODES.includes(item.mode)
      && isFiniteNumber(item.startTime) && isFiniteNumber(item.endTime) && item.endTime >= item.startTime && isFiniteNumber(item.duration)
      && ['COMPLETED', 'CANCELLED'].includes(item.status) && isFiniteNumber(item.createdAt) && isStringOrNull(item.sourceRecordId)
      && typeof item.completedNaturally === 'boolean' && isFiniteNumber(item.completedPomodoros)
    const validSetting = (item: any) => isObject(item) && typeof item.key === 'string' && item.key.trim() && 'value' in item
    if (!categories.every(validCategory) || !tasks.every(validTask) || !focusSessions.every(validSession) || !userSettings.every(validSetting)) {
      throw new DataManagementError('备份文件包含缺失或无效的字段', 'INVALID_DATA')
    }
    const categoryIds = new Set(categories.map((item: any) => item.id))
    const taskIds = new Set(tasks.map((item: any) => item.id))
    if (tasks.some((item: any) => !categoryIds.has(item.categoryId)) || focusSessions.some((item: any) => item.taskId && !taskIds.has(item.taskId))) {
      throw new DataManagementError('备份文件中的任务或专注记录关联无效', 'INVALID_DATA')
    }
    return structuredClone(value) as UserDataBackup
  }

  async restore(backup: UserDataBackup, currentOwnerId: string | null): Promise<ImportSummary> {
    this.validate(backup)
    if (backup.ownerId !== currentOwnerId) throw new DataManagementError('此备份属于其他账号，无法导入当前空间', 'OWNER_MISMATCH')
    await this.database.initialize()
    if (await this.database.db.syncMetadata.get(`import:${backup.backupId}`)) throw new DataManagementError('这个备份已经导入过，无需重复恢复', 'DUPLICATE_BACKUP')
    try {
      await this.database.transaction(async () => {
        const nowIso = new Date().toISOString()
        const nowMs = Date.now()
        const [oldTasks, oldCategories, oldSessions, oldSettings] = await Promise.all([
          this.database.db.tasks.toArray(), this.database.db.categories.toArray(), this.database.db.focusSessions.toArray(), this.database.db.userSettings.toArray(),
        ])
        const taskMap = new Map(oldTasks.map(item => [item.id, item]))
        const categoryMap = new Map(oldCategories.map(item => [item.id, item]))
        const sessionMap = new Map(oldSessions.map(item => [item.id, item]))
        const settingMap = new Map(oldSettings.map(item => [item.id, item]))
        await this.restoreCollection('CATEGORY', oldCategories, backup.data.categories, item => item.id, async item => {
          const old = categoryMap.get(item.id); const record: CategoryRecord = { ...structuredClone(item), deletedAt: null, syncStatus: 'PENDING', version: (old?.version ?? 0) + 1 }
          await this.database.db.categories.put(record); return record
        }, nowIso)
        await this.restoreCollection('TASK', oldTasks, backup.data.tasks, item => item.id, async item => {
          const old = taskMap.get(item.id); const record: TaskRecord = { ...structuredClone(item), deletedAt: null, syncStatus: 'PENDING', version: (old?.version ?? 0) + 1 }
          await this.database.db.tasks.put(record); return record
        }, nowIso)
        await this.restoreCollection('FOCUS_SESSION', oldSessions, backup.data.focusSessions, item => item.id, async item => {
          const old = sessionMap.get(item.id); const record: FocusSessionRecord = { ...structuredClone(item), updatedAt: nowMs, deletedAt: null, syncStatus: 'PENDING', version: (old?.version ?? 0) + 1 }
          await this.database.db.focusSessions.put(record); return record
        }, nowIso)
        await this.restoreCollection('USER_SETTING', oldSettings, backup.data.userSettings, item => item.key, async item => {
          const old = settingMap.get(item.key); const record: UserSettingsRecord = { id: item.key, value: structuredClone(item.value), createdAt: old?.createdAt ?? nowIso,
            updatedAt: nowIso, deletedAt: null, syncStatus: 'PENDING', version: (old?.version ?? 0) + 1 }
          await this.database.db.userSettings.put(record); return record
        }, nowIso)
        await this.database.db.syncMetadata.put({ id: `import:${backup.backupId}`, lastSyncedAt: null, cursor: null,
          value: { importedAt: nowIso, exportedAt: backup.exportedAt }, createdAt: nowIso, updatedAt: nowIso,
          deletedAt: null, syncStatus: 'LOCAL', version: 1 })
      })
    } catch (error) {
      if (error instanceof DataManagementError) throw error
      throw new DataManagementError('数据恢复失败，所有更改已回滚', 'DATABASE_ERROR')
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('focus-day:data-synced'))
    return { tasks: backup.data.tasks.length, categories: backup.data.categories.length,
      focusSessions: backup.data.focusSessions.length, userSettings: backup.data.userSettings.length }
  }

  async clearLocalData(): Promise<void> {
    try {
      await this.database.transaction(async () => {
        await Promise.all([this.database.db.tasks.clear(), this.database.db.categories.clear(), this.database.db.focusSessions.clear(),
          this.database.db.timerStates.clear(), this.database.db.userSettings.clear(), this.database.db.syncQueue.clear(),
          this.database.db.syncMetadata.clear(), this.database.db.syncConflicts.clear()])
        const now = new Date().toISOString()
        await this.database.db.syncMetadata.put({ id: LEGACY_MIGRATION_ID, lastSyncedAt: null, cursor: null, value: { clearedAt: now },
          createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'LOCAL', version: 1 })
      })
    } catch { throw new DataManagementError('本地数据清理失败，原有数据已保留', 'DATABASE_ERROR') }
  }

  private async restoreCollection<TLocal extends { id: string; version: number; updatedAt: any; deletedAt: any }, TImport>(entityType: any,
    existing: TLocal[], imported: TImport[], idOf: (item: TImport) => string, save: (item: TImport) => Promise<any>, nowIso: string): Promise<void> {
    const importedIds = new Set(imported.map(idOf))
    for (const old of existing.filter(item => !item.deletedAt && !importedIds.has(item.id))) {
      const deletedAt = typeof old.updatedAt === 'number' ? Date.now() : nowIso
      const record = { ...old, deletedAt, updatedAt: deletedAt, syncStatus: 'PENDING' as const, version: old.version + 1 }
      const table = entityType === 'CATEGORY' ? this.database.db.categories : entityType === 'TASK' ? this.database.db.tasks
        : entityType === 'FOCUS_SESSION' ? this.database.db.focusSessions : this.database.db.userSettings
      await table.put(record as any)
      await this.queue.enqueueWithinTransaction({ entityType, entityId: old.id, operation: 'DELETE', payload: record,
        baseVersion: old.version, baseUpdatedAt: typeof old.updatedAt === 'number' ? new Date(old.updatedAt).toISOString() : old.updatedAt })
    }
    const oldMap = new Map(existing.map(item => [item.id, item]))
    for (const item of imported) {
      const id = idOf(item); const old = oldMap.get(id); const record = await save(item)
      await this.queue.enqueueWithinTransaction({ entityType, entityId: id, operation: old ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: old?.version ?? 0, baseUpdatedAt: old ? (typeof old.updatedAt === 'number' ? new Date(old.updatedAt).toISOString() : old.updatedAt) : null })
    }
  }
}

export const dataManagementService = new DataManagementService()
