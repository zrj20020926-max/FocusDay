import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { IndexedDbTaskRepository } from '../database/repositories/TaskRepository'
import { SyncQueueService } from './SyncQueueService'
import { SyncService } from './SyncService'
import { SyncStatusService } from './SyncStatusService'
import type { Task, TaskCategory } from '../../types/task'
import { HabitService } from '../habit/HabitService'
import { HabitRepository } from '../database/repositories/HabitRepository'
import { HabitRecordRepository } from '../database/repositories/HabitRecordRepository'
import { AchievementRepository } from '../database/repositories/AchievementRepository'
import { AchievementService } from '../achievement/AchievementService'
import { sqliteTestFixture } from '../database/sqliteTestFixture'
import { TaskService } from '../task/TaskService'
import { FocusSessionRepository } from '../database/repositories/FocusSessionRepository'
import type { FocusSession } from '../../types/focusSession'

type Row = Record<string, any>

class MemoryQuery implements PromiseLike<{ data: any; error: any }> {
  private mode: 'select' | 'insert' | 'update' = 'select'
  private values: Row[] = []
  private filters: Array<(row: Row) => boolean> = []
  private orders: Array<{ key: string; ascending: boolean }> = []
  private rangeValue: [number, number] | null = null
  constructor(private rows: Row[], private table: string) {}
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
  private async execute(): Promise<{ data: Row[]; error: { code: string; message: string } | null }> {
    if (this.mode === 'insert') {
      const now = new Date().toISOString()
      const inserted: Row[] = this.values.map(value => ({ created_at: now, updated_at: now, ...structuredClone(value) }))
      for (const value of inserted) {
        const existing = this.rows.find(row => row.id === value.id || (row.user_id === value.user_id && (
          (this.table === 'habit_records' && row.habit_id === value.habit_id && row.record_date === value.record_date)
          || (this.table === 'user_settings' && row.key === value.key)
          || (this.table === 'focus_sessions' && value.source_record_id && row.source_record_id === value.source_record_id)
        )))
        if (existing) return { data: [], error: { code: '23505', message: 'duplicate key' } }
        this.rows.push(value)
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
  readonly tables: Record<string, Row[]> = { categories: [], tasks: [], habits: [], habit_records: [], focus_sessions: [], timer_states: [], user_settings: [] }
  readonly auth = { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } }, error: null }) }
  from(table: string) { return new MemoryQuery(this.tables[table], table) }
}

const disposers: Array<() => void | Promise<void>> = []
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(disposers.splice(0).map(dispose => dispose())) })

async function setupStorage(platform: string, provisionDefaults = false) {
  const name = `sync-service-${crypto.randomUUID()}`
  const fixture = platform === 'SQLite' ? await sqliteTestFixture() : undefined
  const cloud = new MemorySupabase()
  const db = new DatabaseService(name, fixture?.backend())
  if (fixture || provisionDefaults) db.selectOwner((await cloud.auth.getUser()).data.user.id)
  if (fixture) disposers.push(fixture.close)
  else disposers.push(() => db.delete())
  await db.transaction(async tables => {
    if (!provisionDefaults) await tables.categories.clear()
    await Promise.all([tables.tasks.clear(), tables.focusSessions.clear(), tables.timerStates.clear(), tables.userSettings.clear(), tables.syncQueue.clear()])
  })
  const queue = new SyncQueueService(db)
  const status = new SyncStatusService()
  const sync = new SyncService(db, queue, status, async () => cloud as any)
  return { db, cloud, queue, status, sync, repository: new IndexedDbTaskRepository(db) }
}

const now = () => new Date().toISOString()

describe.each(['IndexedDB', 'SQLite'])('SyncService (%s)', platform => {
  const setup = () => setupStorage(platform)

  it('复用既有云端默认分类并为离线任务替换分类引用', async () => {
    const { db, cloud, sync, repository } = await setupStorage(platform, true)
    const userId = (await cloud.auth.getUser()).data.user.id
    const canonicalCategory = { id: crypto.randomUUID(), user_id: userId, name: '其他', color: '#92aa8b', icon: 'Shapes',
      is_default: true, version: 1, created_at: now(), updated_at: now(), deleted_at: null }
    cloud.tables.categories.push(canonicalCategory)
    const task = await new TaskService(repository).create({ title: '初次同步之前离线创建' })
    expect(task.categoryId).not.toBe(canonicalCategory.id)
    await sync.syncNow()
    expect(await db.db.tasks.get(task.id)).toMatchObject({ categoryId: canonicalCategory.id, syncStatus: 'SYNCED' })
    expect(cloud.tables.tasks[0]).toMatchObject({ id: task.id, category_id: canonicalCategory.id })
    expect(cloud.tables.categories.filter(category => category.name === '其他')).toHaveLength(1)
  })

  it('Web 和原生同步同一计时来源只保留一条专注记录', async () => {
    const device = await setup()
    const peer = await setupStorage(platform === 'SQLite' ? 'IndexedDB' : 'SQLite')
    const first = new FocusSessionRepository(device.db)
    const second = new FocusSessionRepository(peer.db)
    const endTime = Date.now()
    const session: FocusSession = { id: crypto.randomUUID(), taskId: null, habitId: null, mode: 'STOPWATCH',
      startTime: endTime - 60_000, endTime, duration: 60_000, status: 'COMPLETED', createdAt: endTime,
      sourceRecordId: 'same-timer-phase', completedNaturally: false, completedPomodoros: 0 }
    await first.bulkUpsert([session])
    await second.bulkUpsert([{ ...session, id: crypto.randomUUID() }])
    await device.sync.syncNow()
    await new SyncService(peer.db, peer.queue, peer.status, async () => device.cloud as any).syncNow()
    expect(device.cloud.tables.focus_sessions).toHaveLength(1)
    expect(await first.list()).toMatchObject([{ id: session.id }])
    expect(await second.list()).toMatchObject([{ id: session.id }])
    expect(await peer.queue.countPending()).toBe(0)
  })
  it('同一成就由两台离线设备独立解锁后合并，第三台恢复同一记录', async () => {
    const left = await setup()
    const right = await setup()
    const restored = await setup()
    const syncFrom = (device: typeof left) => new SyncService(device.db, device.queue, device.status, async () => left.cloud as any)
    const leftRepository = new AchievementRepository(left.db)
    const rightRepository = new AchievementRepository(right.db)
    const first = { definitionId: 'first-focus', unlockedAt: '2026-11-10T08:00:00.000Z' }
    const second = { ...first, unlockedAt: '2026-11-11T08:00:00.000Z' }
    await leftRepository.unlock(first)
    await rightRepository.unlock(second)
    await Promise.all([left.sync.syncNow(), syncFrom(right).syncNow()])
    await syncFrom(restored).syncNow()
    const rows = left.cloud.tables.user_settings
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('achievement:first-focus')
    for (const device of [left, right, restored]) {
      expect((await new AchievementRepository(device.db).snapshot()).records).toEqual([rows[0].value])
      expect(await device.queue.countPending()).toBe(0)
    }
  })

  it('同步拉取的有效专注可触发未解锁成就', async () => {
    const { db, cloud, sync } = await setup()
    const end = Date.parse('2026-11-08T12:00:00Z')
    const repository = new AchievementRepository(db)
    const service = new AchievementService(repository)
    let unlocked = 0
    const subscription = repository.observe().subscribe(snapshot => {
      void service.reconcile(snapshot.activity, snapshot.records, end, 'UTC').then(result => {
        unlocked += result.newlyUnlocked.length
      })
    })
    try {
      cloud.tables.focus_sessions.push({
        id: crypto.randomUUID(), user_id: '00000000-0000-4000-8000-000000000001', status: 'COMPLETED', mode: 'STOPWATCH',
        start_time: new Date(end - 60_000).toISOString(), end_time: new Date(end).toISOString(), duration: 60_000,
        created_at: new Date(end).toISOString(), updated_at: new Date(end).toISOString(), deleted_at: null, version: 1,
      })
      await sync.syncNow()
      await vi.waitFor(() => expect(unlocked).toBe(1))
      expect((await repository.snapshot()).records).toMatchObject([{ definitionId: 'first-focus' }])
    } finally { subscription.unsubscribe() }
  })
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
    const { db } = await setup()
    let calls = 0
    const pendingClient = () => { calls += 1; return new Promise<any>(() => undefined) }
    const status = new SyncStatusService()
    const service = new SyncService(db, new SyncQueueService(db), status, pendingClient, 5)
    const results = await Promise.allSettled([service.syncNow(), service.syncNow()])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(calls).toBe(1)
    expect(status.getSnapshot()).toMatchObject({ status: 'ERROR', lastError: expect.stringContaining('超时') })
  })

  it('两台设备离线对同一习惯同一天打卡，重连后只保留一个云端和本地记录', async () => {
    const first = await setup()
    const second = await setup()
    const syncSecond = new SyncService(second.db, second.queue, second.status, async () => first.cloud as any)
    const makeService = (db: DatabaseService) => new HabitService(new HabitRepository(db), new HabitRecordRepository(db))
    const habitA = makeService(first.db)
    const habitB = makeService(second.db)
    await habitA.initialize()
    const habit = await habitA.create({ name: '阅读', description: '', icon: '📚', color: '#92aa8b',
      goalType: 'DAILY_CHECKIN', targetValue: 1, frequency: 'DAILY', weekdays: [], weeklyTarget: 1, startDate: '2026-01-01' })
    await first.sync.syncNow()
    await syncSecond.syncNow()
    await habitB.initialize()
    const day = '2026-01-02'
    const recordA = await habitA.checkIn(habit.id, day)
    const recordB = await habitB.checkIn(habit.id, day)
    expect(recordA.id).not.toBe(recordB.id)
    vi.stubGlobal('navigator', { onLine: false })
    await first.sync.syncNow()
    expect(first.cloud.tables.habit_records).toHaveLength(0)
    expect(await first.queue.countPending()).toBe(1)
    vi.stubGlobal('navigator', { onLine: true })
    await Promise.all([first.sync.syncNow(), syncSecond.syncNow()])
    await syncSecond.syncNow()
    expect(first.cloud.tables.habit_records).toHaveLength(1)
    expect(await first.db.db.habitRecords.count()).toBe(1)
    expect(await second.db.db.habitRecords.get(first.cloud.tables.habit_records[0].id)).toBeDefined()
    expect(await second.queue.countPending()).toBe(0)

    await habitB.uncheck(habit.id, day)
    await syncSecond.syncNow()
    await first.sync.syncNow()
    await habitA.reload()
    expect(habitA.getRecords(habit.id)).toHaveLength(0)
    expect(first.cloud.tables.habit_records[0].manual_value).toBe(0)
    await habitB.delete(habit.id)
    await syncSecond.syncNow()
    await first.sync.syncNow()
    expect(await new HabitRepository(first.db).findById(habit.id)).toBeNull()
    expect(first.cloud.tables.habits[0].deleted_at).toBeTruthy()
  })

  it('记录多端不同打卡数值的版本冲突，保留一个日期记录', async () => {
    const { db, cloud, sync, queue } = await setup()
    const habits = new HabitService(new HabitRepository(db), new HabitRecordRepository(db))
    await habits.initialize()
    const habit = await habits.create({ name: '阅读', description: '', icon: '📚', color: '#92aa8b',
      goalType: 'DAILY_DURATION', targetValue: 60_000, frequency: 'DAILY', weekdays: [], weeklyTarget: 1, startDate: '2026-01-01' })
    const record = await habits.checkIn(habit.id, '2026-01-02', 60_000)
    await sync.syncNow()
    await habits.checkIn(habit.id, '2026-01-02', 120_000)
    Object.assign(cloud.tables.habit_records[0], { updated_at: new Date(Date.now() + 1_000).toISOString(), actual_value: 180_000, manual_value: 180_000, version: 2 })
    await sync.syncNow()
    expect(await db.db.habitRecords.get(record.id)).toMatchObject({ manualValue: 180_000, syncStatus: 'SYNCED' })
    expect(await db.db.syncConflicts.toArray()).toMatchObject([{ entityType: 'HABIT_RECORD', winner: 'REMOTE' }])
    expect(await queue.countPending()).toBe(0)
  })
})
