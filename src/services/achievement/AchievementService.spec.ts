import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FocusSession } from '../../types/focusSession'
import { DatabaseService } from '../database/DatabaseService'
import { AchievementRepository } from '../database/repositories/AchievementRepository'
import { FocusSessionRepository } from '../database/repositories/FocusSessionRepository'
import { AchievementService, calculateAchievementMetrics } from './AchievementService'
import { DataManagementService } from '../data/DataManagementService'

const end = Date.parse('2026-11-12T12:00:00Z')
const hour = 3_600_000
const session = (at: number, id: string, duration = hour, status: FocusSession['status'] = 'COMPLETED'): FocusSession => ({
  id, taskId: null, createdAt: at, endTime: at, startTime: at - duration, duration,
  sourceRecordId: id, mode: 'STOPWATCH', status, completedNaturally: true, completedPomodoros: 0,
})
const databases: DatabaseService[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(database => database.delete())) })

describe('AchievementService', () => {
  it('忽略取消、零时长、未来记录和重复来源，只统计不同的已完成任务', () => {
    const valid = session(end, 'valid')
    expect(calculateAchievementMetrics({
      tasks: [
        { id: 'task', completedAt: new Date(end).toISOString(), status: 'COMPLETED' },
        { id: 'task', completedAt: new Date(end).toISOString(), status: 'COMPLETED' },
        { id: 'todo', completedAt: null, status: 'TODO' },
      ],
      sessions: [valid, { ...valid, id: 'duplicate' }, session(end, 'cancelled', hour, 'CANCELLED'), session(end, 'zero', 0), session(end + 1, 'future')],
    }, end, 'UTC')).toMatchObject({ sessions: 1, focusHours: 1, completedTasks: 1, longestStreak: 1 })
  })

  it('按本地完成时间匹配早晨与夜间，包含起始边界，排除结束边界', () => {
    const records = [4, 5, 9, 10, 21, 22].map(hour => session(Date.UTC(2026, 10, 11, hour), String(hour)))
    expect(calculateAchievementMetrics({ tasks: [], sessions: records }, end, 'UTC')).toMatchObject({ morningSessions: 2, nightSessions: 2 })
    const shifted = [session(Date.parse('2026-11-11T23:00:00Z'), 'shifted')]
    expect(calculateAchievementMetrics({ tasks: [], sessions: shifted }, end, 'Asia/Shanghai')).toMatchObject({ morningSessions: 1, nightSessions: 0 })
  })

  it('六种规则基于累计次数、历史连续天数与有效耗时达到各自门槛', async () => {
    const repository = { unlock: vi.fn(async record => ({ record, created: true })) }
    const service = new AchievementService(repository)
    const days = Array.from({ length: 10 }, (_, i) => i + 1)
    const sessions = days.flatMap(day => [
      session(Date.UTC(2026, 10, day, 6), `morning-${day}`, 5 * hour),
      session(Date.UTC(2026, 10, day, 23), `night-${day}`, 5 * hour),
    ])
    const tasks = Array.from({ length: 100 }, (_, i) => ({ id: String(i), status: 'COMPLETED' as const, completedAt: new Date(end).toISOString() }))
    const result = await service.reconcile({ sessions, tasks }, [], end, 'UTC')
    expect(result.newlyUnlocked.map(item => item.definition.id)).toEqual([
      'first-focus', 'focus-streak-7', 'focus-hours-100', 'tasks-100', 'morning-10', 'night-10',
    ])
    expect(repository.unlock).toHaveBeenCalledTimes(6)
  })

  it('离线重新打开保留解锁时间，不重复动画或因删除专注而撤销', async () => {
    const database = new DatabaseService(`achievement-${crypto.randomUUID()}`)
    databases.push(database)
    const repository = new AchievementRepository(database)
    const focus = new FocusSessionRepository(database)
    const service = new AchievementService(repository)
    await focus.upsert(session(end, 'focus'))
    const start = await repository.snapshot()
    const responses = await Promise.all([
      service.reconcile(start.activity, start.records, end, 'UTC'),
      service.reconcile(start.activity, start.records, end + 500, 'UTC'),
    ])
    expect(responses.flatMap(result => result.newlyUnlocked)).toHaveLength(1)
    const stored = (await repository.snapshot()).records
    expect(stored).toHaveLength(1)
    expect(await database.db.syncQueue.where('entityType').equals('USER_SETTING').count()).toBe(1)
    await focus.softDelete('focus')
    const next = new DatabaseService(database.db.name)
    try {
      const reopened = new AchievementRepository(next)
      const snapshot = await reopened.snapshot()
      const result = await new AchievementService(reopened).reconcile(snapshot.activity, snapshot.records, end + 1000, 'UTC')
      expect(result.newlyUnlocked).toEqual([])
      expect(result.progress[0]).toMatchObject({ progress: 1, unlock: stored[0] })
    } finally { next.close() }
  })

  it('恢复旧备份不会撤销已解锁成就', async () => {
    const database = new DatabaseService(`achievement-${crypto.randomUUID()}`)
    databases.push(database)
    const backups = new DataManagementService(database)
    const beforeUnlock = await backups.createBackup(null)
    const repository = new AchievementRepository(database)
    const unlock = { definitionId: 'first-focus', unlockedAt: new Date(end).toISOString() }
    await repository.unlock(unlock)
    await backups.restore(beforeUnlock, null)
    expect((await repository.snapshot()).records).toEqual([unlock])
  })
})
