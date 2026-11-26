import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from './DatabaseService'
import { createSQLiteFixtureFile, sqliteTestFixture, upgradeSQLiteFixture } from './sqliteTestFixture'
import { sqliteName } from './NativeDatabaseService'
import { IndexedDbTaskRepository } from './repositories/TaskRepository'
import { HabitRepository } from './repositories/HabitRepository'
import { HabitRecordRepository } from './repositories/HabitRecordRepository'
import { FocusSessionRepository } from './repositories/FocusSessionRepository'
import { TimerRepository } from './repositories/TimerRepository'
import { SettingsRepository } from './repositories/SettingsRepository'
import { TaskService } from '../task/TaskService'
import { HabitService } from '../habit/HabitService'
import { TimerService } from '../timer/TimerService'
import { FocusSessionService } from '../focus/FocusSessionService'
import { SyncQueueService } from '../sync/SyncQueueService'
import { DataManagementService } from '../data/DataManagementService'
import { persistenceMetadata } from '../../types/database'
import { localDateKey } from '../../types/task'

const ownerA = '00000000-0000-4000-8000-000000000001'
const ownerB = '00000000-0000-4000-8000-000000000002'
const disposers: Array<() => void | Promise<void>> = []
afterEach(async () => { await Promise.all(disposers.splice(0).map(dispose => dispose())) })

async function device(snapshot?: Uint8Array) {
  const name = 'native-legacy-' + crypto.randomUUID()
  const fixture = await sqliteTestFixture(snapshot)
  disposers.push(fixture.close, () => new DatabaseService(name).delete())
  const open = (owner: string | null) => {
    const database = new DatabaseService(name, fixture.backend())
    database.selectOwner(owner)
    return database
  }
  return { name, open, files: fixture.files }
}

describe('native SQLite persistence', () => {
  it('persists task changes and tombstones with their queue operations', async () => {
    const { open } = await device()
    const database = open(null)
    const service = new TaskService(new IndexedDbTaskRepository(database))
    const task = await service.create({ title: '离线任务' })
    await service.update(task.id, { title: '离线编辑' })
    expect(await new TaskService(new IndexedDbTaskRepository(open(null))).getById(task.id)).toMatchObject({ title: '离线编辑' })
    await service.delete(task.id)
    expect(await database.db.tasks.get(task.id)).toMatchObject({ deletedAt: expect.any(String), version: 3 })
    expect(await new SyncQueueService(database).ready()).toMatchObject([{ entityId: task.id, operation: 'DELETE' }])
  })

  it('preserves daily habit uniqueness, updates and deletes', async () => {
    const { open } = await device()
    const database = open(ownerA)
    const habit = new HabitService(new HabitRepository(database), new HabitRecordRepository(database))
    await habit.initialize()
    const date = localDateKey()
    const created = await habit.create({ name: '阅读', description: '', color: '#92aa8b', icon: 'BookOpen',
      goalType: 'DAILY_CHECKIN', targetValue: 1, frequency: 'DAILY', weekdays: [], weeklyTarget: 1, startDate: date })
    await habit.update(created.id, { name: '阅读与笔记' })
    await Promise.all([habit.checkIn(created.id, date), habit.checkIn(created.id, date)])
    const [record] = await database.db.habitRecords.toArray()
    await expect(database.db.habitRecords.put({ ...record, id: crypto.randomUUID() })).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await database.db.habitRecords.count()).toBe(1)
    expect((await database.db.habits.get(created.id))?.name).toBe('阅读与笔记')
    await habit.delete(created.id)
    expect((await database.db.habits.get(created.id))?.deletedAt).toBeTruthy()
  })

  it('restores a paused timer and stores completed focus once after reopening', async () => {
    const { open } = await device()
    let now = Date.now()
    const first = new TimerRepository(open(ownerA))
    await first.initialize()
    const timer = new TimerService(first, { now: () => now })
    timer.start('STOPWATCH')
    now += 60_000
    timer.pause()
    await first.flush()
    const database = open(ownerA)
    const second = new TimerRepository(database)
    await second.initialize()
    now += 600_000
    const restored = new TimerService(second, { now: () => now })
    expect(restored.restore().status).toBe('PAUSED')
    restored.resume()
    now += 30_000
    restored.finish()
    await second.flush()
    const sessions = new FocusSessionService(new FocusSessionRepository(database))
    await sessions.syncTimerRecords(restored.getRecords())
    await sessions.syncTimerRecords(restored.getRecords())
    expect(await database.db.focusSessions.toArray()).toMatchObject([{ duration: 90_000 }])
  })

  it('rolls back failed queue and business writes and publishes only committed changes', async () => {
    const { open } = await device()
    const database = open(ownerA)
    const observer = vi.fn()
    const settings = new SettingsRepository(database)
    const subscription = database.observe(['userSettings'], () => settings.get('theme')).subscribe(observer)
    await vi.waitFor(() => expect(observer).toHaveBeenCalledWith(null))
    const queue = new SyncQueueService(database)
    try {
      await expect(database.transaction(async db => {
        const record = { id: 'theme', value: 'night', ...persistenceMetadata() }
        await db.userSettings.put(record)
        await queue.enqueueWithinTransaction(db, { entityType: 'USER_SETTING', entityId: 'theme', operation: 'INSERT',
          payload: record, baseVersion: 0, baseUpdatedAt: null })
        await db.userSettings.add(record)
      })).rejects.toMatchObject({ name: 'ConstraintError' })
      expect(await settings.get('theme')).toBeNull()
      expect(await queue.countPending()).toBe(0)
      expect(observer.mock.calls).toEqual([[null]])
      await settings.set('theme', 'sea')
      await vi.waitFor(() => expect(observer).toHaveBeenLastCalledWith('sea'))
    } finally { subscription.unsubscribe() }
  })

  it('upgrades a v1 SQLite file without losing rows and reopening is idempotent', async () => {
    const v1 = await createSQLiteFixtureFile()
    upgradeSQLiteFixture(v1, 1)
    const saved = { id: 'theme', value: 'night', ...persistenceMetadata() }
    v1.run('INSERT INTO userSettings (id, data) VALUES (?, ?)', [saved.id, JSON.stringify(saved)])
    const bytes = v1.export()
    v1.close()
    const { open, files } = await device(bytes)
    expect(await new SettingsRepository(open(null)).get('theme')).toBe('night')
    expect(await new SettingsRepository(open(null)).get('theme')).toBe('night')
    expect(files.get(sqliteName(null))?.exec('PRAGMA user_version')[0].values).toEqual([[3]])
  })

  it('imports bound legacy rows only into their owner and never resurrects cleared rows', async () => {
    const { name, open } = await device()
    const legacy = new DatabaseService(name)
    const legacyTasks = new TaskService(new IndexedDbTaskRepository(legacy))
    const task = await legacyTasks.create({ title: '账号 A 旧任务' })
    await legacy.db.syncMetadata.put({ id: 'sync:bound-user', value: { userId: ownerA },
      cursor: null, lastSyncedAt: null, ...persistenceMetadata() })
    legacy.close()
    const guest = open(null)
    const userB = open(ownerB)
    expect(await new IndexedDbTaskRepository(guest).listTasks()).toEqual([])
    expect(await new IndexedDbTaskRepository(userB).listTasks()).toEqual([])
    const userA = open(ownerA)
    expect(await new IndexedDbTaskRepository(userA).findTaskById(task.id)).toMatchObject({ title: '账号 A 旧任务' })
    expect(await new SyncQueueService(userA).countPending()).toBe(1)
    expect(() => userA.selectOwner(ownerB)).toThrow()
    await new DataManagementService(userA).clearLocalData()
    expect(await new IndexedDbTaskRepository(open(ownerA)).listTasks()).toEqual([])
    expect(await new IndexedDbTaskRepository(new DatabaseService(name)).findTaskById(task.id)).not.toBeNull()
  })
})
