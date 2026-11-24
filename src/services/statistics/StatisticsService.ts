import type { FocusSessionRecord } from '../../types/database'
import type { FocusSession } from '../../types/focusSession'
import type { Task, TaskCategory } from '../../types/task'
import { DatabaseService, databaseService } from '../database/DatabaseService'
import { syncQueueService, type SyncQueueService } from '../sync/SyncQueueService'
import { addCalendarDays, dateKeyAt, rangeForDateKey, splitSessionByDay, startOfDateKey, StatisticsCalculator, weekStartKey } from './StatisticsCalculator'
import type { DailyFocusPoint, StatisticsDashboard, StatisticsOptions, StatisticsPageData, StatisticsRange, StatisticsTrendPoint } from './StatisticsTypes'
import { DEFAULT_DAILY_FOCUS_GOAL } from './StatisticsTypes'

const sessionFromRecord = (record: FocusSessionRecord): FocusSession => {
  const { updatedAt: _, deletedAt: _d, syncStatus: _s, version: _v, ...session } = record
  return structuredClone(session)
}

export class StatisticsService {
  private revision = 0
  private cache: { key: string; revision: number; value: StatisticsDashboard } | null = null
  private readonly unsubscribeQueue: () => void
  private readonly dataListener = () => this.invalidate()

  constructor(private readonly database: DatabaseService = databaseService, queue: SyncQueueService = syncQueueService) {
    this.unsubscribeQueue = queue.subscribe(() => this.invalidate())
    if (typeof window !== 'undefined') window.addEventListener('focus-day:data-synced', this.dataListener)
  }

  invalidate(): void { this.revision += 1; this.cache = null }
  dispose(): void {
    this.unsubscribeQueue()
    if (typeof window !== 'undefined') window.removeEventListener('focus-day:data-synced', this.dataListener)
  }

  async getDashboard(options: StatisticsOptions = {}): Promise<StatisticsDashboard> {
    await this.database.initialize()
    const now = options.now ?? Date.now()
    const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    const goal = options.dailyGoalDuration ?? await this.readDailyGoal()
    const cacheKey = `${timeZone}:${dateKeyAt(now, timeZone)}:${goal}`
    if (this.cache?.key === cacheKey && this.cache.revision === this.revision) return structuredClone(this.cache.value)
    const [taskRecords, categoryRecords, sessionRecords] = await this.database.db.transaction('r',
      [this.database.db.tasks, this.database.db.categories, this.database.db.focusSessions], () => Promise.all([
        this.database.db.tasks.toArray(), this.database.db.categories.toArray(), this.database.db.focusSessions.toArray(),
      ]))
    const allTasks = taskRecords.map(({ deletedAt: _, syncStatus: _s, version: _v, ...task }) => task as Task)
    const activeTasks = taskRecords.filter(record => !record.deletedAt).map(({ deletedAt: _, syncStatus: _s, version: _v, ...task }) => task as Task)
    const categories = categoryRecords.map(({ deletedAt: _, syncStatus: _s, version: _v, ...category }) => category as TaskCategory)
    const sessions = sessionRecords.filter(record => !record.deletedAt).map(sessionFromRecord)
    const value = StatisticsCalculator.calculate({ tasks: activeTasks, historicalTasks: allTasks, categories, sessions }, { ...options, now, timeZone, dailyGoalDuration: goal })
    this.cache = { key: cacheKey, revision: this.revision, value }
    return structuredClone(value)
  }

  async getDailySeries(start: number, end: number, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'): Promise<DailyFocusPoint[]> {
    await this.database.initialize()
    const records = await this.database.db.focusSessions.where('endTime').above(start).filter(record => !record.deletedAt && record.startTime < end).toArray()
    const startKey = dateKeyAt(start, timeZone)
    const endKey = dateKeyAt(Math.max(start, end - 1), timeZone)
    return StatisticsCalculator.dailySeries(records.map(sessionFromRecord), startKey, addCalendarDays(endKey, 1), timeZone)
  }

  async getPageData(range: StatisticsRange, options: StatisticsOptions = {}): Promise<StatisticsPageData> {
    await this.database.initialize()
    const now = options.now ?? Date.now()
    const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    const todayKey = dateKeyAt(now, timeZone)
    const tomorrowKey = addCalendarDays(todayKey, 1)
    const [allSessionRecords, taskRecords, categoryRecords] = await Promise.all([
      this.database.db.focusSessions.filter(record => !record.deletedAt).toArray(), this.database.db.tasks.toArray(), this.database.db.categories.toArray(),
    ])
    const earliestKey = [
      ...allSessionRecords.filter(record => record.status === 'COMPLETED').map(record => dateKeyAt(record.startTime, timeZone)),
      ...taskRecords.filter(record => !record.deletedAt).map(record => dateKeyAt(Date.parse(record.completedAt ?? record.createdAt), timeZone)),
      todayKey,
    ].sort()[0]
    const startKey = range === 'TODAY' ? todayKey : range === 'WEEK' ? weekStartKey(todayKey) : range === 'MONTH' ? `${todayKey.slice(0, 7)}-01` : earliestKey
    const endKey = range === 'TODAY' ? tomorrowKey : range === 'WEEK' ? addCalendarDays(startKey, 7) : range === 'MONTH' ? tomorrowKey : tomorrowKey
    const start = startOfDateKey(startKey, timeZone)
    const end = startOfDateKey(endKey, timeZone)
    const sessions = allSessionRecords.filter(record => record.endTime > start && record.startTime < end).map(sessionFromRecord)
    const allSessions = allSessionRecords.map(sessionFromRecord)
    const allTasks = taskRecords.map(({ deletedAt: _, syncStatus: _s, version: _v, ...task }) => task as Task)
    const activeTasks = taskRecords.filter(record => !record.deletedAt).map(({ deletedAt: _, syncStatus: _s, version: _v, ...task }) => task as Task)
    const categories = categoryRecords.map(({ deletedAt: _, syncStatus: _s, version: _v, ...category }) => category as TaskCategory)
    const input = { tasks: activeTasks, historicalTasks: allTasks, categories, sessions }
    const dashboard = StatisticsCalculator.calculate({ ...input, sessions: allSessions }, { ...options, now, timeZone })
    const daily = StatisticsCalculator.dailySeries(sessions, startKey, endKey, timeZone)
    const completedByDate = new Map<string, number>()
    for (const task of activeTasks) if (task.completedAt) {
      const key = dateKeyAt(Date.parse(task.completedAt), timeZone)
      if (key >= startKey && key < endKey) completedByDate.set(key, (completedByDate.get(key) ?? 0) + 1)
    }
    const trend = this.buildTrend(range, daily, completedByDate, timeZone)
    const taskMap = new Map(allTasks.map(task => [task.id, task]))
    const categoryMap = new Map(categories.map(category => [category.id, category]))
    const records = sessions.filter(session => session.status === 'COMPLETED').map(session => {
      const task = session.taskId ? taskMap.get(session.taskId) : null
      const category = task ? categoryMap.get(task.categoryId) : null
      return { id: session.id, date: dateKeyAt(session.startTime, timeZone), dates: [...splitSessionByDay(session, timeZone).keys()], startTime: session.startTime, endTime: session.endTime,
        duration: session.duration, mode: session.mode, taskId: session.taskId, taskTitle: task?.title ?? (session.taskId ? '已删除任务' : '自由专注'),
        categoryId: category?.id ?? null, categoryName: category?.name ?? (session.taskId ? '已删除任务' : '自由专注'),
        categoryColor: category?.color ?? '#b69caf', completedPomodoros: session.completedPomodoros }
    }).sort((a, b) => b.startTime - a.startTime)
    const focusDuration = daily.reduce((sum, item) => sum + item.duration, 0)
    const completedTasks = [...completedByDate.values()].reduce((sum, value) => sum + value, 0)
    const completedPomodoros = daily.reduce((sum, item) => sum + item.completedPomodoros, 0)
    return { range, rangeLabel: range === 'TODAY' ? '今日' : range === 'WEEK' ? '本周' : range === 'MONTH' ? '本月' : '全部',
      start, end, focusDuration, completedTasks, completedPomodoros, focusStreakDays: dashboard.focusStreakDays,
      totalTasks: activeTasks.length, totalCompletedTasks: activeTasks.filter(task => task.status === 'COMPLETED').length,
      taskCompletionRate: dashboard.taskCompletionRate, trend,
      categories: StatisticsCalculator.categoryDurations(input, startKey, endKey, timeZone), records,
      empty: focusDuration === 0 && completedTasks === 0 }
  }

  private buildTrend(range: StatisticsRange, daily: DailyFocusPoint[], completedByDate: Map<string, number>, timeZone: string): StatisticsTrendPoint[] {
    if (range !== 'ALL') return daily.map(item => {
      const dateRange = rangeForDateKey(item.date, timeZone)
      const [year, month, day] = item.date.split('-').map(Number)
      const label = range === 'TODAY' ? '今天' : range === 'WEEK'
        ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
        : `${month}/${day}`
      return { key: item.date, label, duration: item.duration, completedTasks: completedByDate.get(item.date) ?? 0,
        completedPomodoros: item.completedPomodoros, focusCount: item.focusCount, ...dateRange }
    })
    const months = new Map<string, StatisticsTrendPoint>()
    for (const item of daily) {
      const key = item.date.slice(0, 7)
      const current = months.get(key) ?? { key, label: `${Number(key.slice(5))}月`, duration: 0, completedTasks: 0,
        completedPomodoros: 0, focusCount: 0, start: startOfDateKey(`${key}-01`, timeZone), end: 0 }
      current.duration += item.duration; current.completedTasks += completedByDate.get(item.date) ?? 0
      current.completedPomodoros += item.completedPomodoros; current.focusCount += item.focusCount
      current.end = rangeForDateKey(item.date, timeZone).end
      months.set(key, current)
    }
    return [...months.values()]
  }

  private async readDailyGoal(): Promise<number> {
    const record = await this.database.db.userSettings.get('daily-focus-goal-minutes')
    const minutes = typeof record?.value === 'number' ? record.value : typeof (record?.value as any)?.minutes === 'number' ? (record!.value as any).minutes : null
    return minutes && minutes > 0 ? Math.round(minutes * 60_000) : DEFAULT_DAILY_FOCUS_GOAL
  }
}

export const statisticsService = new StatisticsService()
