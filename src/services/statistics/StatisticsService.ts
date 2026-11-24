import type { FocusSessionRecord } from '../../types/database'
import type { FocusSession } from '../../types/focusSession'
import type { Task, TaskCategory } from '../../types/task'
import { DatabaseService, databaseService } from '../database/DatabaseService'
import { syncQueueService, type SyncQueueService } from '../sync/SyncQueueService'
import { addCalendarDays, dateKeyAt, StatisticsCalculator } from './StatisticsCalculator'
import type { DailyFocusPoint, StatisticsDashboard, StatisticsOptions } from './StatisticsTypes'
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

  private async readDailyGoal(): Promise<number> {
    const record = await this.database.db.userSettings.get('daily-focus-goal-minutes')
    const minutes = typeof record?.value === 'number' ? record.value : typeof (record?.value as any)?.minutes === 'number' ? (record!.value as any).minutes : null
    return minutes && minutes > 0 ? Math.round(minutes * 60_000) : DEFAULT_DAILY_FOCUS_GOAL
  }
}

export const statisticsService = new StatisticsService()
