import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveQuery } from 'dexie'
import { HabitService } from './HabitService'
import { DatabaseService } from '../database/DatabaseService'
import { HabitRepository } from '../database/repositories/HabitRepository'
import { HabitRecordRepository } from '../database/repositories/HabitRecordRepository'
import { FocusSessionRepository } from '../database/repositories/FocusSessionRepository'
import { FocusSessionService } from '../focus/FocusSessionService'
import { TimerService } from '../timer/TimerService'
import type { TimerSnapshot } from '../../types/timer'
import type { CreateHabitInput } from '../../types/habit'

const defaults: CreateHabitInput = {
  name: '阅读', description: '每天读几页', icon: '📚', color: '#92aa8b',
  goalType: 'DAILY_CHECKIN', targetValue: 1, frequency: 'DAILY',
  weekdays: [], weeklyTarget: 1, startDate: '2024-02-01',
}

let database: DatabaseService
let service: HabitService

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2024-03-11T12:00:00Z'))
  database = new DatabaseService(`habits-${crypto.randomUUID()}`)
  service = new HabitService(new HabitRepository(database), new HabitRecordRepository(database))
  await service.initialize()
})

afterEach(async () => {
  await database.delete()
  vi.useRealTimers()
})

describe('HabitService', () => {
  it('创建、编辑、暂停、恢复、软删除与持久化重新加载', async () => {
    const habit = await service.create(defaults)
    expect(await service.update(habit.id, { name: '晚间阅读' })).toMatchObject({ name: '晚间阅读' })
    await service.checkIn(habit.id, '2024-03-11')
    await service.pause(habit.id)
    await expect(service.checkIn(habit.id, '2024-03-11')).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(service.stats(habit.id, '2024-03-11').currentStreak).toBe(1)
    expect(await service.resume(habit.id)).toMatchObject({ status: 'ACTIVE' })
    await service.reload()
    expect(service.getById(habit.id)?.name).toBe('晚间阅读')
    expect(service.getRecords(habit.id)).toHaveLength(1)
    await service.delete(habit.id)
    expect(service.getById(habit.id)).toBeNull()
    expect((await database.db.habits.get(habit.id))?.deletedAt).toBeTruthy()
    expect(await database.db.syncQueue.where('[entityType+entityId]').equals(['HABIT', habit.id]).first()).toMatchObject({ operation: 'DELETE' })
  })

  it('重复和并发打卡只写入一个日期记录，取消后重打仍沿用原 ID', async () => {
    const habit = await service.create(defaults)
    const day = '2024-02-29'
    const results = await Promise.all([service.checkIn(habit.id, day), service.checkIn(habit.id, day)])
    expect(results[1].id).toBe(results[0].id)
    expect(await database.db.habitRecords.count()).toBe(1)
    expect((await database.db.habitRecords.toArray())[0].version).toBe(1)
    expect(await service.uncheck(habit.id, day)).toMatchObject({ actualValue: 0, completed: false })
    expect(service.getRecords(habit.id)).toEqual([])
    expect((await service.checkIn(habit.id, day)).id).toBe(results[0].id)
    await expect(service.checkIn(habit.id, '2024-02-30')).rejects.toThrow('日期无效')
  })

  it('队列写入失败会回滚打卡', async () => {
    const habit = await service.create(defaults)
    database.db.syncQueue.hook('creating', () => { throw new Error('queue failure') })
    await expect(service.checkIn(habit.id, '2024-03-11')).rejects.toThrow('queue failure')
    expect(await database.db.habitRecords.count()).toBe(0)
  })

  it('指定星期只按计划日计算连续，错过上一计划日会中断', async () => {
    const habit = await service.create({ ...defaults, frequency: 'WEEKDAYS', weekdays: [1, 3, 5], startDate: '2024-03-04' })
    await service.checkIn(habit.id, '2024-03-04')
    await service.checkIn(habit.id, '2024-03-06')
    await expect(service.checkIn(habit.id, '2024-03-07')).rejects.toThrow('无法打卡')
    expect(service.stats(habit.id, '2024-03-06')).toMatchObject({ currentStreak: 2, longestStreak: 2, weekRate: 1 })
    expect(service.stats(habit.id, '2024-03-09')).toMatchObject({ currentStreak: 0, longestStreak: 2, weekRate: 2 / 3 })
    expect(service.stats(habit.id, '2024-03-11').currentStreak).toBe(0)
  })

  it('周目标按不同完成日计数，以完成目标的周数计算连续', async () => {
    const habit = await service.create({ ...defaults, goalType: 'WEEKLY_COUNT', frequency: 'WEEKLY_TARGET', weeklyTarget: 2, startDate: '2024-02-26' })
    await service.checkIn(habit.id, '2024-02-26')
    await service.checkIn(habit.id, '2024-02-26')
    expect(service.stats(habit.id, '2024-03-01')).toMatchObject({ weekRate: 0.5, currentStreak: 0 })
    await service.checkIn(habit.id, '2024-03-01')
    await service.checkIn(habit.id, '2024-03-04')
    await service.checkIn(habit.id, '2024-03-10')
    expect(service.stats(habit.id, '2024-03-10')).toMatchObject({ currentStreak: 2, longestStreak: 2, weekRate: 1, monthRate: 0.75 })
    expect(service.stats(habit.id, '2024-03-11')).toMatchObject({ currentStreak: 2, monthRate: 0.5 })
  })

  it('从计时器持久化精确专注段，跨午夜扣除暂停并随删除回退', async () => {
    const habit = await service.create({ ...defaults, goalType: 'DAILY_DURATION', targetValue: 5 * 60_000 })
    let snapshot: TimerSnapshot | null = null
    let timestamp = Date.parse('2024-02-29T23:50:00Z')
    const timer = new TimerService({ load: () => snapshot, save: value => { snapshot = value } }, { now: () => timestamp })
    timer.start('STOPWATCH', { habitId: habit.id })
    timestamp += 5 * 60_000
    timer.pause()
    timestamp += 15 * 60_000
    timer.resume()
    timestamp += 10 * 60_000
    timer.finish()

    const repository = new FocusSessionRepository(database)
    const focus = new FocusSessionService(repository)
    await focus.syncTimerRecords(timer.getRecords())
    const sessions = await repository.listForHabits()
    const only = sessions[0]
    expect(only).toMatchObject({ habitId: habit.id, duration: 15 * 60_000 })
    await service.checkIn(habit.id, '2024-02-29', 60_000)
    service.recalculateFromFocusSessions([...sessions, { ...only, id: crypto.randomUUID() },
      { ...only, id: crypto.randomUUID(), sourceRecordId: 'cancelled', status: 'CANCELLED' }], 'UTC')
    expect(service.getRecords(habit.id).map(record => [record.recordDate, record.actualValue])).toEqual([
      ['2024-02-29', 6 * 60_000], ['2024-03-01', 10 * 60_000],
    ])
    expect(await database.db.habitRecords.count()).toBe(1)
    service.recalculateFromFocusSessions(sessions, 'Asia/Shanghai')
    expect(service.getRecords(habit.id).find(record => record.recordDate === '2024-03-01')?.actualValue).toBe(15 * 60_000)
    await repository.softDelete(only.id)
    await focus.reload()
    await focus.syncTimerRecords(timer.getRecords())
    service.recalculateFromFocusSessions(await repository.listForHabits(), 'UTC')
    expect(service.getRecords(habit.id)).toMatchObject([{ actualValue: 60_000, completed: false, focusSessionIds: [] }])
  })

  it('观察到 IndexedDB 专注记录的提交和删除', async () => {
    const habit = await service.create({ ...defaults, goalType: 'DAILY_DURATION', targetValue: 60_000 })
    const focus = new FocusSessionRepository(database)
    const startTime = Date.parse('2024-03-11T10:00:00Z')
    const endTime = startTime + 60_000
    const sessions = liveQuery(() => focus.listForHabits())
    let observed = -1
    const subscription = sessions.subscribe(values => {
      observed = values.length
      service.recalculateFromFocusSessions(values, 'UTC')
    })
    try {
      await vi.waitFor(() => expect(observed).toBe(0))
      const session = await focus.upsert({ id: crypto.randomUUID(), habitId: habit.id, taskId: null, mode: 'STOPWATCH',
        startTime, endTime, duration: 60_000, status: 'COMPLETED', createdAt: endTime, sourceRecordId: null,
        completedNaturally: false, completedPomodoros: 0 })
      await vi.waitFor(() => expect(service.getRecords(habit.id)).toMatchObject([{ actualValue: 60_000, completed: true }]))
      await focus.softDelete(session.id)
      await vi.waitFor(() => expect(service.getRecords(habit.id)).toEqual([]))
    } finally { subscription.unsubscribe() }
  })
})
