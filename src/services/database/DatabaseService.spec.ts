import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService, DATABASE_VERSION } from './DatabaseService'
import { IndexedDbTaskRepository } from './repositories/TaskRepository'
import { FocusSessionRepository } from './repositories/FocusSessionRepository'
import { TimerRepository } from './repositories/TimerRepository'
import type { Task, TaskCategory } from '../../types/task'
import type { TimerSnapshot } from '../../types/timer'
import { DEFAULT_TIMER_CONFIG } from '../../types/timer'
import { TASK_STORAGE_KEY } from '../../repositories/task/LocalStorageTaskRepository'

const databases: DatabaseService[] = []
const createDatabase = () => {
  const database = new DatabaseService(`focus-day-test-${crypto.randomUUID()}`)
  databases.push(database)
  return database
}

const now = '2026-11-23T10:00:00.000Z'
const category: TaskCategory = { id: 'test-category', name: '测试', color: '#92aa8b', icon: 'Check', isDefault: false, createdAt: now, updatedAt: now }
const task = (id = 'task-1'): Task => ({
  id, title: `任务 ${id}`, description: '', categoryId: category.id, priority: 'MEDIUM', status: 'TODO',
  plannedDate: '2026-11-23', dueDate: '2026-11-24', estimatedDuration: 25, estimatedPomodoros: 1,
  sortOrder: 0, completedAt: null, createdAt: now, updatedAt: now,
})

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.delete()))
  vi.unstubAllGlobals()
})

describe('IndexedDB repositories', () => {
  it('支持数据新增、修改、查询和批量写入', async () => {
    const database = createDatabase()
    const repository = new IndexedDbTaskRepository(database)
    await repository.saveCategory(category)
    await repository.saveTask(task())
    await repository.saveTasks([{ ...task(), title: '已修改' }, { ...task('task-2'), sortOrder: 1 }])
    expect((await repository.findTaskById('task-1'))?.title).toBe('已修改')
    expect((await repository.listTasks()).filter(item => item.id.startsWith('task-'))).toHaveLength(2)
    expect((await database.db.tasks.get('task-1'))?.version).toBe(2)
  })

  it('删除使用软删除并从默认查询中隐藏', async () => {
    const database = createDatabase()
    const repository = new IndexedDbTaskRepository(database)
    await repository.saveCategory(category)
    await repository.saveTask(task())
    expect(await repository.deleteTask('task-1')).toBe(true)
    expect(await repository.findTaskById('task-1')).toBeNull()
    expect((await database.db.tasks.get('task-1'))?.deletedAt).toBeTruthy()
  })

  it('删除分类时在同一事务内修复任务关联', async () => {
    const database = createDatabase()
    const repository = new IndexedDbTaskRepository(database)
    const fallback = { ...category, id: 'other', name: '其他' }
    await repository.saveCategory(category)
    await repository.saveCategory(fallback)
    await repository.saveTask(task())
    await repository.deleteCategory(category.id, fallback.id)
    expect((await repository.findTaskById('task-1'))?.categoryId).toBe('other')
    expect(await repository.findCategoryById(category.id)).toBeNull()
  })

  it('事务异常时完整回滚', async () => {
    const database = createDatabase()
    await database.initialize()
    await expect(database.transaction(async () => {
      await database.db.categories.put({ ...category, deletedAt: null, syncStatus: 'LOCAL', version: 1 })
      throw new Error('rollback')
    })).rejects.toThrow('rollback')
    expect(await database.db.categories.get(category.id)).toBeUndefined()
  })

  it('专注记录保持任务弱关联，任务删除后历史仍可查询', async () => {
    const database = createDatabase()
    const tasks = new IndexedDbTaskRepository(database)
    const sessions = new FocusSessionRepository(database)
    await tasks.saveCategory(category)
    await tasks.saveTask(task())
    await sessions.upsert({ id: 'focus-1', taskId: 'task-1', mode: 'STOPWATCH', startTime: 100, endTime: 1100,
      duration: 1000, status: 'COMPLETED', createdAt: 1100, sourceRecordId: 'record-1', completedNaturally: false, completedPomodoros: 0 })
    await tasks.deleteTask('task-1')
    expect((await sessions.list())[0].taskId).toBe('task-1')
  })

  it('计时快照写入后可由新 Repository 恢复', async () => {
    const database = createDatabase()
    const state = {
      version: 1 as const, sessionId: 'session', mode: 'COUNTDOWN' as const, status: 'PAUSED' as const, taskId: null,
      startTime: 100, endTime: null, targetDuration: 1000, accumulatedDuration: 400, pausedAt: 500,
      currentRound: 1, currentPhase: 'FOCUS' as const, completedPomodoros: 0, phaseSequence: 0,
      phaseStartedAt: 100, segmentStartedAt: null, phaseAccumulatedDuration: 400, lastObservedAt: 500,
      updatedAt: 500, config: structuredClone(DEFAULT_TIMER_CONFIG),
    }
    const snapshot: TimerSnapshot = { state, records: [], config: structuredClone(DEFAULT_TIMER_CONFIG) }
    const first = new TimerRepository(database)
    await first.initialize()
    first.save(snapshot)
    await first.flush()
    const restored = new TimerRepository(database)
    await restored.initialize()
    expect(restored.load()?.state).toMatchObject({ status: 'PAUSED', accumulatedDuration: 400 })
  })

  it('可导出并事务性恢复全部业务数据', async () => {
    const database = createDatabase()
    const repository = new IndexedDbTaskRepository(database)
    await repository.saveCategory(category)
    await repository.saveTask(task())
    const backup = await database.exportData()
    await database.db.tasks.clear()
    await database.restoreData(backup)
    expect(await repository.findTaskById('task-1')).not.toBeNull()
  })

  it('从旧版本数据库升级并补齐同步元数据', async () => {
    const name = `focus-day-legacy-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores({
      tasks: 'id, status, categoryId, plannedDate, dueDate, sortOrder, updatedAt',
      categories: 'id, name, updatedAt', focusSessions: 'id', timerStates: 'id', userSettings: 'id', syncQueue: 'id', syncMetadata: 'id',
    })
    await legacy.open()
    await legacy.table('tasks').put(task())
    legacy.close()
    const database = new DatabaseService(name)
    databases.push(database)
    await database.initialize()
    const upgraded = await database.db.tasks.get('task-1')
    expect(database.indexedDb.verno).toBe(DATABASE_VERSION)
    expect(upgraded).toMatchObject({ syncStatus: 'LOCAL', version: 1, deletedAt: null })
  })

  it('首次启动从 localStorage 导入旧业务数据且刷新后仍可恢复', async () => {
    const values = new Map<string, string>()
    const storage: Storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key) },
      setItem: (key, value) => { values.set(key, value) },
    }
    storage.setItem(TASK_STORAGE_KEY, JSON.stringify({ version: 1, tasks: [task('legacy-task')], categories: [category] }))
    vi.stubGlobal('localStorage', storage)
    const database = createDatabase()
    const first = new IndexedDbTaskRepository(database)
    expect((await first.findTaskById('legacy-task'))?.title).toBe('任务 legacy-task')
    database.close()
    databases.splice(databases.indexOf(database), 1)
    const reopened = new DatabaseService(database.indexedDb.name)
    databases.push(reopened)
    const second = new IndexedDbTaskRepository(reopened)
    expect(await second.findTaskById('legacy-task')).not.toBeNull()
  })

  it('Web 保留 IndexedDB，并按游客与登录账号隔离旧数据和新写入', async () => {
    const name = 'scope-' + crypto.randomUUID()
    const ownerA = '00000000-0000-4000-8000-000000000001'
    const ownerB = '00000000-0000-4000-8000-000000000002'
    const legacy = new DatabaseService(name)
    databases.push(legacy)
    await new IndexedDbTaskRepository(legacy).saveTask(task('bound-task'))
    const time = new Date().toISOString()
    await legacy.db.syncMetadata.put({ id: 'sync:bound-user', value: { userId: ownerA }, cursor: null, lastSyncedAt: null,
      syncStatus: 'LOCAL', version: 1, deletedAt: null, createdAt: time, updatedAt: time })
    legacy.close()
    const scopedRepository = (owner: string | null) => {
      const scope = new DatabaseService(name)
      scope.selectOwner(owner)
      databases.push(scope)
      return new IndexedDbTaskRepository(scope)
    }
    const visitor = scopedRepository(null)
    const userB = scopedRepository(ownerB)
    expect(await visitor.findTaskById('bound-task')).toBeNull()
    expect(await userB.findTaskById('bound-task')).toBeNull()
    const userA = scopedRepository(ownerA)
    expect(await userA.findTaskById('bound-task')).not.toBeNull()
    await userB.saveTask(task('b-new'))
    expect(await userA.findTaskById('b-new')).toBeNull()
  })
})
