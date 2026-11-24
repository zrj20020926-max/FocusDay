import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { IndexedDbTaskRepository } from '../database/repositories/TaskRepository'
import { DataManagementService } from './DataManagementService'
import { DataManagementError, USER_DATA_SCHEMA_VERSION } from '../../types/dataManagement'
import type { Task, TaskCategory } from '../../types/task'

const databases: DatabaseService[] = []
const createDatabase = async () => {
  const database = new DatabaseService(`data-management-${crypto.randomUUID()}`); databases.push(database); await database.initialize()
  await database.transaction(async () => {
    await Promise.all([database.db.tasks.clear(), database.db.categories.clear(), database.db.focusSessions.clear(), database.db.userSettings.clear(), database.db.syncQueue.clear()])
  })
  return database
}
afterEach(async () => { await Promise.all(databases.splice(0).map(database => database.delete())) })

const timestamp = '2026-11-24T08:00:00.000Z'
const category = (): TaskCategory => ({ id: crypto.randomUUID(), name: '工作', color: '#92aa8b', icon: 'Briefcase', isDefault: true, createdAt: timestamp, updatedAt: timestamp })
const task = (categoryId: string): Task => ({ id: crypto.randomUUID(), title: '备份任务', description: '', categoryId, priority: 'HIGH', status: 'TODO',
  plannedDate: '2026-11-24', dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0, completedAt: null, createdAt: timestamp, updatedAt: timestamp })

async function seededService() {
  const database = await createDatabase(); const repository = new IndexedDbTaskRepository(database); const selectedCategory = category(); const selectedTask = task(selectedCategory.id)
  await repository.saveCategory(selectedCategory); await repository.saveTask(selectedTask)
  await database.db.userSettings.put({ id: 'theme', value: { mode: 'warm' }, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, syncStatus: 'LOCAL', version: 1 })
  return { database, service: new DataManagementService(database), selectedTask }
}

describe('DataManagementService', () => {
  it('导出版本化 JSON 业务数据且不包含内部同步队列', async () => {
    const { service, selectedTask } = await seededService()
    const backup = await service.createBackup('user-1')
    expect(backup).toMatchObject({ format: 'focus-day-user-data', schemaVersion: USER_DATA_SCHEMA_VERSION, ownerId: 'user-1' })
    expect(backup.data.tasks[0].id).toBe(selectedTask.id)
    expect(backup.data.userSettings).toEqual([{ key: 'theme', value: { mode: 'warm' } }])
    expect(backup).not.toHaveProperty('data.syncQueue')
  })

  it('校验格式、版本、必填字段和关联关系', async () => {
    const { service } = await seededService(); const backup = await service.createBackup('user-1')
    expect(() => service.parse('{bad json')).toThrow('有效的 JSON')
    expect(() => service.validate({ ...backup, schemaVersion: 99 })).toThrow('不支持此备份版本')
    expect(() => service.validate({ ...backup, data: { ...backup.data, tasks: [{ ...backup.data.tasks[0], title: '' }] } })).toThrow('缺失或无效')
    expect(() => service.validate({ ...backup, data: { ...backup.data, tasks: [{ ...backup.data.tasks[0], categoryId: crypto.randomUUID() }] } })).toThrow('关联无效')
  })

  it('恢复数据并生成同步队列，重复备份不会再次导入', async () => {
    const source = await seededService(); const backup = await source.service.createBackup('user-1')
    const target = await createDatabase(); const service = new DataManagementService(target)
    const summary = await service.restore(backup, 'user-1')
    expect(summary).toMatchObject({ tasks: 1, categories: 1, userSettings: 1 })
    expect((await target.db.tasks.get(backup.data.tasks[0].id))?.syncStatus).toBe('PENDING')
    expect(await target.db.syncQueue.count()).toBe(3)
    await expect(service.restore(backup, 'user-1')).rejects.toMatchObject({ code: 'DUPLICATE_BACKUP' })
  })

  it('阻止其他账号的备份进入当前账号', async () => {
    const { service } = await seededService(); const backup = await service.createBackup('user-a')
    await expect(service.restore(backup, 'user-b')).rejects.toMatchObject({ code: 'OWNER_MISMATCH' })
  })

  it('导入失败时回滚全部业务写入和导入标记', async () => {
    const source = await seededService(); const backup = await source.service.createBackup('user-1')
    const target = await createDatabase(); const service = new DataManagementService(target)
    target.db.syncQueue.hook('creating', () => { throw new Error('queue failure') })
    await expect(service.restore(backup, 'user-1')).rejects.toBeInstanceOf(DataManagementError)
    expect(await target.db.tasks.count()).toBe(0)
    expect(await target.db.syncMetadata.get(`import:${backup.backupId}`)).toBeUndefined()
  })

  it('清理本地数据但保留防止旧数据重新迁移的标记', async () => {
    const { database, service } = await seededService()
    await service.clearLocalData()
    expect(await database.db.tasks.count()).toBe(0)
    expect(await database.db.syncQueue.count()).toBe(0)
    expect(await database.db.syncMetadata.get('migration:local-storage:v1')).toBeTruthy()
  })
})
