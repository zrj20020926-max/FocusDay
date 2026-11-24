import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { SyncQueueService } from '../sync/SyncQueueService'
import { StatisticsService } from './StatisticsService'
import type { CategoryRecord, FocusSessionRecord, TaskRecord } from '../../types/database'

const databases: DatabaseService[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(database => database.delete())) })

describe('StatisticsService', () => {
  it('从 IndexedDB 真实记录组织统计并读取每日目标设置', async () => {
    const database = new DatabaseService(`statistics-${crypto.randomUUID()}`); databases.push(database); await database.initialize()
    await database.transaction(async () => {
      await Promise.all([database.db.tasks.clear(), database.db.categories.clear(), database.db.focusSessions.clear(), database.db.userSettings.clear()])
      const category: CategoryRecord = { id: 'category', name: '工作', color: '#92aa8b', icon: 'Briefcase', isDefault: true,
        createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z', deletedAt: null, syncStatus: 'SYNCED', version: 1 }
      const task: TaskRecord = { id: 'task', title: '完成', description: '', categoryId: category.id, priority: 'MEDIUM', status: 'COMPLETED',
        plannedDate: null, dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0,
        completedAt: '2024-03-13T09:00:00Z', createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-03-13T09:00:00Z',
        deletedAt: null, syncStatus: 'SYNCED', version: 1 }
      const focus: FocusSessionRecord = { id: 'focus', taskId: task.id, mode: 'POMODORO', startTime: Date.parse('2024-03-13T08:00:00Z'),
        endTime: Date.parse('2024-03-13T09:00:00Z'), duration: 3_600_000, status: 'COMPLETED', createdAt: Date.parse('2024-03-13T09:00:00Z'),
        updatedAt: Date.parse('2024-03-13T09:00:00Z'), deletedAt: null, sourceRecordId: 'record', completedNaturally: true,
        completedPomodoros: 1, syncStatus: 'SYNCED', version: 1 }
      await database.db.categories.put(category); await database.db.tasks.put(task); await database.db.focusSessions.put(focus)
      await database.db.userSettings.put({ id: 'daily-focus-goal-minutes', value: 30, createdAt: task.createdAt, updatedAt: task.updatedAt,
        deletedAt: null, syncStatus: 'SYNCED', version: 1 })
    })
    const service = new StatisticsService(database, new SyncQueueService(database))
    const result = await service.getDashboard({ now: Date.parse('2024-03-13T12:00:00Z'), timeZone: 'UTC' })
    expect(result).toMatchObject({ todayFocusDuration: 3_600_000, todayCompletedTasks: 1, totalCompletedPomodoros: 1,
      dailyGoalDuration: 1_800_000, taskCompletionRate: 1 })
    const page = await service.getPageData('WEEK', { now: Date.parse('2024-03-13T12:00:00Z'), timeZone: 'UTC' })
    expect(page).toMatchObject({ range: 'WEEK', focusDuration: 3_600_000, completedTasks: 1, completedPomodoros: 1,
      totalTasks: 1, totalCompletedTasks: 1, taskCompletionRate: 1, empty: false })
    expect(page.categories[0]).toMatchObject({ name: '工作', duration: 3_600_000 })
    expect(page.records[0]).toMatchObject({ taskTitle: '完成', dates: ['2024-03-13'] })
    const distribution = await service.getFocusDistribution('YEAR', 2024, { now: Date.parse('2024-03-13T12:00:00Z'), timeZone: 'UTC' })
    expect(distribution).toMatchObject({ range: 'YEAR', year: 2024, startKey: '2024-01-01', endKey: '2024-03-14',
      peakHour: 8, morningDuration: 3_600_000, afternoonDuration: 0, eveningDuration: 0, empty: false,
      streak: { current: 1, longest: 1, monthFocusedDays: 1 } })
    expect(distribution.heatmap).toHaveLength(73)
    expect(distribution.heatmap.find(item => item.date === '2024-03-13')).toMatchObject({ duration: 3_600_000, level: 3, focusCount: 1 })
    expect(distribution.records[0]).toMatchObject({ taskTitle: '完成', date: '2024-03-13' })
    service.dispose()
  })

  it('范围查询使用 endTime 索引并排除取消及软删除记录', async () => {
    const database = new DatabaseService(`statistics-range-${crypto.randomUUID()}`); databases.push(database); await database.initialize()
    await database.db.focusSessions.clear()
    const base = { taskId: null, mode: 'STOPWATCH' as const, duration: 600_000, createdAt: Date.parse('2024-03-13T08:10:00Z'),
      updatedAt: Date.parse('2024-03-13T08:10:00Z'), sourceRecordId: null, completedNaturally: true, completedPomodoros: 0,
      syncStatus: 'SYNCED' as const, version: 1 }
    await database.db.focusSessions.bulkPut([
      { ...base, id: 'valid', startTime: Date.parse('2024-03-13T08:00:00Z'), endTime: Date.parse('2024-03-13T08:10:00Z'), status: 'COMPLETED', deletedAt: null },
      { ...base, id: 'cancelled', startTime: Date.parse('2024-03-13T09:00:00Z'), endTime: Date.parse('2024-03-13T09:10:00Z'), status: 'CANCELLED', deletedAt: null },
      { ...base, id: 'deleted', startTime: Date.parse('2024-03-13T10:00:00Z'), endTime: Date.parse('2024-03-13T10:10:00Z'), status: 'COMPLETED', deletedAt: Date.parse('2024-03-13T11:00:00Z') },
    ])
    const service = new StatisticsService(database, new SyncQueueService(database))
    const series = await service.getDailySeries(Date.parse('2024-03-13T00:00:00Z'), Date.parse('2024-03-14T00:00:00Z'), 'UTC')
    expect(series).toEqual([{ date: '2024-03-13', duration: 600_000, focusCount: 1, completedPomodoros: 0 }])
    service.dispose()
  })
})
