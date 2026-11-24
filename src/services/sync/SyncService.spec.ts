import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { IndexedDbTaskRepository } from '../database/repositories/TaskRepository'
import { SyncQueueService } from './SyncQueueService'
import { SyncService } from './SyncService'
import { SyncStatusService } from './SyncStatusService'
import type { Task, TaskCategory } from '../../types/task'

type Row = Record<string, any>

class MemoryQuery implements PromiseLike<{ data: any; error: any }> {
  private mode: 'select' | 'insert' | 'update' = 'select'
  private values: Row[] = []
  private filters: Array<(row: Row) => boolean> = []
  private orders: Array<{ key: string; ascending: boolean }> = []
  private rangeValue: [number, number] | null = null
  constructor(private rows: Row[]) {}
  select(): this { return this }
  insert(value: Row | Row[]): this { this.mode = 'insert'; this.values = Array.isArray(value) ? value : [value]; return this }
  update(value: Row): this { this.mode = 'update'; this.values = [value]; return this }
  eq(key: string, value: unknown): this { this.filters.push(row => row[key] === value); return this }
  in(key: string, values: unknown[]): this { this.filters.push(row => values.includes(row[key])); return this }
  gte(key: string, value: unknown): this { this.filters.push(row => row[key] >= (value as any)); return this }
  order(key: string, options?: { ascending?: boolean }): this { this.orders.push({ key, ascending: options?.ascending !== false }); return this }
  range(from: number, to: number): this { this.rangeValue = [from, to]; return this }
  limit(count: number): this { this.rangeValue = [0, count - 1]; return this }
  async single() { const result = await this.execute(); return { ...result, data: result.data?.[0] ?? null } }
  async maybeSingle() { return this.single() }
  then<TResult1 = { data: any; error: any }, TResult2 = never>(onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
  private async execute(): Promise<{ data: Row[]; error: null }> {
    if (this.mode === 'insert') {
      const now = new Date().toISOString()
      const inserted: Row[] = this.values.map(value => ({ created_at: now, updated_at: now, ...structuredClone(value) }))
      for (const value of inserted) {
        const existing = this.rows.find(row => row.id === value.id)
        if (!existing) this.rows.push(value)
      }
      return { data: inserted, error: null }
    }
    let selected = this.rows.filter(row => this.filters.every(filter => filter(row)))
    if (this.mode === 'update') {
      selected.forEach(row => Object.assign(row, structuredClone(this.values[0]), { updated_at: this.values[0].updated_at ?? new Date().toISOString() }))
    }
    selected = [...selected]
    for (const order of [...this.orders].reverse()) selected.sort((a, b) => (a[order.key] > b[order.key] ? 1 : a[order.key] < b[order.key] ? -1 : 0) * (order.ascending ? 1 : -1))
    if (this.rangeValue) selected = selected.slice(this.rangeValue[0], this.rangeValue[1] + 1)
    return { data: structuredClone(selected), error: null }
  }
}

class MemorySupabase {
  readonly tables: Record<string, Row[]> = { categories: [], tasks: [], focus_sessions: [], timer_states: [], user_settings: [] }
  readonly auth = { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } }, error: null }) }
  from(table: string) { return new MemoryQuery(this.tables[table]) }
}

const databases: DatabaseService[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })

async function setup() {
  const db = new DatabaseService(`sync-service-${crypto.randomUUID()}`); databases.push(db); await db.initialize()
  await db.transaction(async () => {
    await Promise.all([db.db.tasks.clear(), db.db.categories.clear(), db.db.focusSessions.clear(), db.db.timerStates.clear(), db.db.userSettings.clear(), db.db.syncQueue.clear()])
  })
  const cloud = new MemorySupabase()
  const queue = new SyncQueueService(db)
  const status = new SyncStatusService()
  const sync = new SyncService(db, queue, status, async () => cloud as any)
  return { db, cloud, queue, status, sync, repository: new IndexedDbTaskRepository(db) }
}

const now = () => new Date().toISOString()

describe('SyncService', () => {
  it('首次同步上传本地数据且重复同步保持幂等', async () => {
    const { repository, cloud, sync, status } = await setup()
    const category: TaskCategory = { id: crypto.randomUUID(), name: '工作', color: '#92aa8b', icon: 'Briefcase', isDefault: true, createdAt: now(), updatedAt: now() }
    const task: Task = { id: crypto.randomUUID(), title: '离线创建', description: '', categoryId: category.id, priority: 'HIGH', status: 'TODO',
      plannedDate: null, dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0, completedAt: null, createdAt: now(), updatedAt: now() }
    await repository.saveCategory(category); await repository.saveTask(task)
    await repository.saveTask({ ...task, id: crypto.randomUUID(), title: '第二条离线任务', sortOrder: 1 })
    await sync.syncNow(); await sync.syncNow()
    expect(cloud.tables.categories).toHaveLength(1)
    expect(cloud.tables.tasks).toHaveLength(2)
    expect(status.getSnapshot()).toMatchObject({ status: 'SYNCED', pendingCount: 0 })
  })

  it('拉取另一设备的修改并写回本地而不产生反向队列', async () => {
    const { repository, cloud, db, sync } = await setup()
    const category: TaskCategory = { id: crypto.randomUUID(), name: '生活', color: '#d5a98e', icon: 'Home', isDefault: true, createdAt: now(), updatedAt: now() }
    const task: Task = { id: crypto.randomUUID(), title: '原始标题', description: '', categoryId: category.id, priority: 'MEDIUM', status: 'TODO',
      plannedDate: null, dueDate: null, estimatedDuration: 10, estimatedPomodoros: 1, sortOrder: 0, completedAt: null, createdAt: now(), updatedAt: now() }
    await repository.saveCategory(category); await repository.saveTask(task); await sync.syncNow()
    const remote = cloud.tables.tasks[0]
    remote.title = '另一设备修改'; remote.version += 1; remote.updated_at = new Date(Date.now() + 2_000).toISOString()
    await sync.syncNow()
    expect((await repository.findTaskById(task.id))?.title).toBe('另一设备修改')
    expect(await db.db.syncQueue.count()).toBe(0)
  })

  it('检测并审计并发修改，较新的本地修改可通过版本锁写回', async () => {
    const { repository, cloud, db, sync } = await setup()
    const category: TaskCategory = { id: crypto.randomUUID(), name: '学习', color: '#9aa8be', icon: 'BookOpen', isDefault: true, createdAt: now(), updatedAt: now() }
    const task: Task = { id: crypto.randomUUID(), title: '初始', description: '', categoryId: category.id, priority: 'MEDIUM', status: 'TODO',
      plannedDate: null, dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0, completedAt: null, createdAt: now(), updatedAt: now() }
    await repository.saveCategory(category); await repository.saveTask(task); await sync.syncNow()
    const remote = cloud.tables.tasks[0]
    remote.title = '远端修改'; remote.version += 1; remote.updated_at = new Date(Date.now() + 1_000).toISOString()
    await repository.saveTask({ ...(await repository.findTaskById(task.id))!, title: '本地修改', updatedAt: new Date(Date.now() + 2_000).toISOString() })
    await sync.syncNow()
    expect(cloud.tables.tasks[0].title).toBe('本地修改')
    expect(await db.db.syncConflicts.count()).toBe(1)
    expect(await db.db.syncQueue.count()).toBe(0)
  })

  it('同步软删除并保留删除记录直到云端确认', async () => {
    const { repository, cloud, db, sync } = await setup()
    const category: TaskCategory = { id: crypto.randomUUID(), name: '其他', color: '#b69caf', icon: 'Shapes', isDefault: true, createdAt: now(), updatedAt: now() }
    const task: Task = { id: crypto.randomUUID(), title: '待删除', description: '', categoryId: category.id, priority: 'LOW', status: 'TODO',
      plannedDate: null, dueDate: null, estimatedDuration: 5, estimatedPomodoros: 1, sortOrder: 0, completedAt: null, createdAt: now(), updatedAt: now() }
    await repository.saveCategory(category); await repository.saveTask(task); await sync.syncNow()
    await repository.deleteTask(task.id)
    expect((await db.db.syncQueue.where('[entityType+entityId]').equals(['TASK', task.id]).first())?.operation).toBe('DELETE')
    await sync.syncNow()
    expect(cloud.tables.tasks[0].deleted_at).toBeTruthy()
    expect(await repository.findTaskById(task.id)).toBeNull()
    expect(await db.db.syncQueue.count()).toBe(0)
  })

  it('两台设备同时启动计时时只更新用户唯一计时行并记录冲突', async () => {
    const { cloud, db, sync } = await setup()
    const userId = '00000000-0000-4000-8000-000000000001'
    const remoteId = crypto.randomUUID()
    cloud.tables.timer_states.push({ id: remoteId, user_id: userId, state: { state: { status: 'RUNNING', updatedAt: 1000 }, records: [], config: {} },
      version: 1, created_at: '2026-11-24T08:00:00.000Z', updated_at: '2026-11-24T08:00:00.000Z', deleted_at: null })
    const updatedAt = '2026-11-24T08:01:00.000Z'
    await db.db.timerStates.put({ id: 'active', snapshot: { state: { status: 'RUNNING' } as any, records: [], config: {} as any },
      createdAt: updatedAt, updatedAt, deletedAt: null, syncStatus: 'PENDING', version: 1 })
    await sync.syncNow()
    expect(cloud.tables.timer_states).toHaveLength(1)
    expect(cloud.tables.timer_states[0].id).toBe(remoteId)
    expect((await db.db.syncConflicts.toArray())[0]?.reason).toBe('SIMULTANEOUS_TIMER')
  })

  it('云端请求超时不会重复启动同步且保留清晰错误状态', async () => {
    const db = new DatabaseService(`sync-timeout-${crypto.randomUUID()}`); databases.push(db)
    let calls = 0
    const pendingClient = () => { calls += 1; return new Promise<any>(() => undefined) }
    const status = new SyncStatusService()
    const service = new SyncService(db, new SyncQueueService(db), status, pendingClient, 5)
    const results = await Promise.allSettled([service.syncNow(), service.syncNow()])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(calls).toBe(1)
    expect(status.getSnapshot()).toMatchObject({ status: 'ERROR', lastError: expect.stringContaining('超时') })
  })
})
