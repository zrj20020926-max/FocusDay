import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { IndexedDbTaskRepository } from '../database/repositories/TaskRepository'
import { SyncQueueService } from './SyncQueueService'
import type { Task, TaskCategory } from '../../types/task'

const databases: DatabaseService[] = []
const createDatabase = () => { const db = new DatabaseService(`sync-queue-${crypto.randomUUID()}`); databases.push(db); return db }
const now = '2026-11-24T08:00:00.000Z'
const category: TaskCategory = { id: crypto.randomUUID(), name: '工作', color: '#92aa8b', icon: 'Briefcase', isDefault: true, createdAt: now, updatedAt: now }
const task = (id = crypto.randomUUID()): Task => ({ id, title: '同步任务', description: '', categoryId: category.id, priority: 'MEDIUM', status: 'TODO',
  plannedDate: '2026-11-24', dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0,
  completedAt: null, createdAt: now, updatedAt: now })

afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())); vi.restoreAllMocks() })

describe('SyncQueueService', () => {
  it('业务新增与同步任务在同一 IndexedDB 事务中提交', async () => {
    const db = createDatabase(); const repository = new IndexedDbTaskRepository(db)
    await repository.saveCategory(category)
    const value = task(); await repository.saveTask(value)
    const queued = await db.db.syncQueue.where('[entityType+entityId]').equals(['TASK', value.id]).first()
    expect(queued).toMatchObject({ operation: 'INSERT', status: 'PENDING', retryCount: 0 })
  })

  it('同步队列写入失败时业务写入也回滚', async () => {
    const db = createDatabase(); const repository = new IndexedDbTaskRepository(db)
    await repository.saveCategory(category)
    db.db.syncQueue.hook('creating', () => { throw new Error('queue failed') })
    const value = task()
    await expect(repository.saveTask(value)).rejects.toThrow('queue failed')
    expect(await db.db.tasks.get(value.id)).toBeUndefined()
  })

  it('合并同一实体的重复更新并保留最初版本基线', async () => {
    const db = createDatabase(); const queue = new SyncQueueService(db); const id = crypto.randomUUID()
    await queue.enqueue({ entityType: 'TASK', entityId: id, operation: 'INSERT', payload: { title: 'A' }, baseVersion: 0, baseUpdatedAt: null })
    await queue.enqueue({ entityType: 'TASK', entityId: id, operation: 'UPDATE', payload: { title: 'B' }, baseVersion: 1, baseUpdatedAt: now })
    const items = await queue.ready()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ operation: 'INSERT', baseVersion: 0, payload: { title: 'B' } })
  })

  it('删除覆盖待上传更新且失败后按指数退避保留任务', async () => {
    const db = createDatabase(); const queue = new SyncQueueService(db); const id = crypto.randomUUID()
    await queue.enqueue({ entityType: 'TASK', entityId: id, operation: 'UPDATE', payload: { version: 2 }, baseVersion: 1, baseUpdatedAt: now })
    await queue.enqueue({ entityType: 'TASK', entityId: id, operation: 'DELETE', payload: { version: 3 }, baseVersion: 2, baseUpdatedAt: now })
    const item = (await queue.ready())[0]
    expect(item.operation).toBe('DELETE')
    const before = Date.now(); await queue.fail(item, new Error('offline'))
    const saved = await db.db.syncQueue.get(item.id)
    expect(saved).toMatchObject({ status: 'FAILED', retryCount: 1, lastError: 'offline' })
    expect(Date.parse(saved!.nextAttemptAt!)).toBeGreaterThanOrEqual(before + 1_000)
    expect(Date.parse(saved!.nextAttemptAt!)).toBeLessThanOrEqual(Date.now() + 1_100)
  })

  it('页面刷新后将中断的 PROCESSING 任务恢复为 PENDING', async () => {
    const db = createDatabase(); const queue = new SyncQueueService(db); const id = crypto.randomUUID()
    const item = await queue.enqueue({ entityType: 'TASK', entityId: id, operation: 'INSERT', payload: {}, baseVersion: 0, baseUpdatedAt: null })
    await queue.markProcessing([item.id]); await queue.recoverInterrupted()
    expect((await db.db.syncQueue.get(item.id))?.status).toBe('PENDING')
  })
})
