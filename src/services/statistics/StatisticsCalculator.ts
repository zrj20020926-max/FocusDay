import type { StatisticsFocusSession, StatisticsInput, StatisticsOptions, StatisticsDashboard, DailyFocusPoint, CategoryFocusMetric, DateRange } from './StatisticsTypes'
import { DEFAULT_DAILY_FOCUS_GOAL } from './StatisticsTypes'

const DAY_MS = 86_400_000
const formatterCache = new Map<string, Intl.DateTimeFormat>()
const boundaryCache = new Map<string, number>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timeZone)
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    formatterCache.set(timeZone, value)
  }
  return value
}

export function resolvedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function dateKeyAt(timestamp: number, timeZone = resolvedTimeZone()): string {
  const parts = formatter(timeZone).formatToParts(new Date(timestamp))
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export function startOfDateKey(dateKey: string, timeZone = resolvedTimeZone()): number {
  const cacheKey = `${timeZone}:${dateKey}`
  const cached = boundaryCache.get(cacheKey)
  if (cached !== undefined) return cached
  const [year, month, day] = dateKey.split('-').map(Number)
  let low = Date.UTC(year, month - 1, day) - 36 * 60 * 60 * 1000
  let high = Date.UTC(year, month - 1, day) + 36 * 60 * 60 * 1000
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (dateKeyAt(middle, timeZone) < dateKey) low = middle + 1
    else high = middle
  }
  boundaryCache.set(cacheKey, low)
  return low
}

export function rangeForDateKey(dateKey: string, timeZone = resolvedTimeZone()): DateRange {
  return { start: startOfDateKey(dateKey, timeZone), end: startOfDateKey(addCalendarDays(dateKey, 1), timeZone) }
}

export function weekStartKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7
  return addCalendarDays(dateKey, 1 - weekday)
}

function monthStartKey(dateKey: string): string { return `${dateKey.slice(0, 7)}-01` }

function deduplicate(sessions: StatisticsFocusSession[]): StatisticsFocusSession[] {
  const values = new Map<string, StatisticsFocusSession>()
  for (const session of sessions) {
    const key = session.sourceRecordId ? `source:${session.sourceRecordId}` : `id:${session.id}`
    const current = values.get(key)
    if (!current || session.createdAt >= current.createdAt) values.set(key, session)
  }
  return [...values.values()].filter(session => session.status === 'COMPLETED' && session.duration > 0
    && Number.isFinite(session.startTime) && Number.isFinite(session.endTime) && session.endTime >= session.startTime)
}

function splitInterval(startTime: number, endTime: number, timeZone: string): Map<string, number> {
  const output = new Map<string, number>()
  if (endTime <= startTime) return output
  let key = dateKeyAt(startTime, timeZone)
  while (startOfDateKey(key, timeZone) < endTime) {
    const range = rangeForDateKey(key, timeZone)
    const overlap = Math.max(0, Math.min(endTime, range.end) - Math.max(startTime, range.start))
    if (overlap) output.set(key, (output.get(key) ?? 0) + overlap)
    key = addCalendarDays(key, 1)
  }
  return output
}

export function splitSessionByDay(session: StatisticsFocusSession, timeZone = resolvedTimeZone()): Map<string, number> {
  const intervals = session.activeIntervals?.filter(item => Number.isFinite(item.startTime) && Number.isFinite(item.endTime) && item.endTime > item.startTime)
  if (intervals?.length) {
    const exact = new Map<string, number>()
    for (const interval of intervals) for (const [key, value] of splitInterval(interval.startTime, interval.endTime, timeZone)) exact.set(key, (exact.get(key) ?? 0) + value)
    return exact
  }
  if (session.endTime === session.startTime) return new Map([[dateKeyAt(session.startTime, timeZone), session.duration]])
  const wallTime = splitInterval(session.startTime, session.endTime, timeZone)
  const totalWallTime = [...wallTime.values()].reduce((sum, value) => sum + value, 0)
  if (!totalWallTime) return new Map()
  const result = new Map<string, number>()
  let assigned = 0
  const entries = [...wallTime.entries()]
  entries.forEach(([key, value], index) => {
    const duration = index === entries.length - 1 ? session.duration - assigned : Math.floor(session.duration * value / totalWallTime)
    result.set(key, Math.max(0, duration)); assigned += duration
  })
  return result
}

function normalizedSessions(sessions: StatisticsFocusSession[]) { return deduplicate(sessions) }

function durationMap(sessions: StatisticsFocusSession[], timeZone: string): Map<string, number> {
  const output = new Map<string, number>()
  for (const session of sessions) for (const [key, duration] of splitSessionByDay(session, timeZone)) output.set(key, (output.get(key) ?? 0) + duration)
  return output
}

function sumRange(values: Map<string, number>, startKey: string, endKeyExclusive: string): number {
  let sum = 0
  for (const [key, value] of values) if (key >= startKey && key < endKeyExclusive) sum += value
  return sum
}

function completedInRange(tasks: StatisticsInput['tasks'], startKey: string, endKey: string, timeZone: string): number {
  return new Set(tasks.filter(task => task.completedAt && dateKeyAt(Date.parse(task.completedAt), timeZone) >= startKey
    && dateKeyAt(Date.parse(task.completedAt), timeZone) < endKey).map(task => task.id)).size
}

function effectiveDuration(session: StatisticsFocusSession): number {
  return session.activeIntervals?.length
    ? session.activeIntervals.reduce((sum, item) => sum + Math.max(0, item.endTime - item.startTime), 0)
    : session.duration
}

function categoryMetrics(input: StatisticsInput, sessions: StatisticsFocusSession[], durationForSession: (session: StatisticsFocusSession) => number = effectiveDuration): CategoryFocusMetric[] {
  const tasks = new Map([...(input.historicalTasks ?? []), ...input.tasks].map(task => [task.id, task]))
  const categories = new Map(input.categories.map(category => [category.id, category]))
  const grouped = new Map<string, CategoryFocusMetric>()
  for (const session of sessions) {
    const task = session.taskId ? tasks.get(session.taskId) : null
    const category = task ? categories.get(task.categoryId) : null
    const key = category?.id ?? (session.taskId ? 'deleted-task' : 'free-focus')
    const current = grouped.get(key) ?? { categoryId: category?.id ?? null, name: category?.name ?? (session.taskId ? '已删除任务' : '自由专注'),
      color: category?.color ?? '#b69caf', duration: 0, percentage: 0 }
    current.duration += durationForSession(session)
    grouped.set(key, current)
  }
  const total = [...grouped.values()].reduce((sum, item) => sum + item.duration, 0)
  return [...grouped.values()].map(item => ({ ...item, percentage: total ? item.duration / total : 0 })).sort((a, b) => b.duration - a.duration)
}

export class StatisticsCalculator {
  static calculate(input: StatisticsInput, options: StatisticsOptions = {}): StatisticsDashboard {
    const now = options.now ?? Date.now()
    const timeZone = options.timeZone ?? resolvedTimeZone()
    const dailyGoalDuration = options.dailyGoalDuration ?? DEFAULT_DAILY_FOCUS_GOAL
    const todayKey = dateKeyAt(now, timeZone)
    const tomorrowKey = addCalendarDays(todayKey, 1)
    const weekKey = weekStartKey(todayKey)
    const monthKey = monthStartKey(todayKey)
    const sessions = normalizedSessions(input.sessions)
    const daily = durationMap(sessions, timeZone)
    const totalFocusDuration = [...daily.values()].reduce((sum, value) => sum + value, 0)
    const focusedDays = [...daily.values()].filter(value => value > 0).length
    const activeTasks = [...new Map(input.tasks.map(task => [task.id, task])).values()]
    let streakAnchor = todayKey
    if (!(daily.get(streakAnchor) ?? 0)) streakAnchor = addCalendarDays(streakAnchor, -1)
    let focusStreakDays = 0
    while ((daily.get(streakAnchor) ?? 0) > 0) { focusStreakDays += 1; streakAnchor = addCalendarDays(streakAnchor, -1) }
    let elapsedMonthDays = 0; let goalDays = 0
    for (let key = monthKey; key <= todayKey; key = addCalendarDays(key, 1)) { elapsedMonthDays += 1; if ((daily.get(key) ?? 0) >= dailyGoalDuration) goalDays += 1 }
    return {
      timeZone, generatedAt: now,
      todayFocusDuration: daily.get(todayKey) ?? 0,
      weekFocusDuration: sumRange(daily, weekKey, addCalendarDays(weekKey, 7)),
      monthFocusDuration: sumRange(daily, monthKey, tomorrowKey), totalFocusDuration,
      todayCompletedTasks: completedInRange(activeTasks, todayKey, tomorrowKey, timeZone),
      weekCompletedTasks: completedInRange(activeTasks, weekKey, addCalendarDays(weekKey, 7), timeZone),
      totalCompletedPomodoros: sessions.reduce((sum, session) => sum + Math.max(0, session.completedPomodoros), 0),
      dailyAverageFocusDuration: focusedDays ? Math.round(totalFocusDuration / focusedDays) : 0,
      focusStreakDays, taskCompletionRate: activeTasks.length ? activeTasks.filter(task => task.status === 'COMPLETED').length / activeTasks.length : 0,
      dailyGoalAchievementRate: elapsedMonthDays ? goalDays / elapsedMonthDays : 0, dailyGoalDuration, focusedDayCount: focusedDays,
      categoryFocusDurations: categoryMetrics(input, sessions),
      todayRange: rangeForDateKey(todayKey, timeZone),
      weekRange: { start: startOfDateKey(weekKey, timeZone), end: startOfDateKey(addCalendarDays(weekKey, 7), timeZone) },
      monthRange: { start: startOfDateKey(monthKey, timeZone), end: startOfDateKey(tomorrowKey, timeZone) },
    }
  }

  static dailySeries(sessions: StatisticsFocusSession[], startKey: string, endKeyExclusive: string, timeZone = resolvedTimeZone()): DailyFocusPoint[] {
    const valid = normalizedSessions(sessions)
    const durations = durationMap(valid, timeZone)
    const output: DailyFocusPoint[] = []
    for (let key = startKey; key < endKeyExclusive; key = addCalendarDays(key, 1)) {
      const daySessions = valid.filter(session => splitSessionByDay(session, timeZone).has(key))
      output.push({ date: key, duration: durations.get(key) ?? 0, focusCount: daySessions.length,
        completedPomodoros: valid.filter(session => dateKeyAt(session.endTime, timeZone) === key)
          .reduce((sum, session) => sum + session.completedPomodoros, 0) })
    }
    return output
  }

  static categoryDurations(input: StatisticsInput, startKey?: string, endKeyExclusive?: string, timeZone = resolvedTimeZone()): CategoryFocusMetric[] {
    const sessions = normalizedSessions(input.sessions)
    if (!startKey || !endKeyExclusive) return categoryMetrics(input, sessions)
    return categoryMetrics(input, sessions, session => {
      let duration = 0
      for (const [key, value] of splitSessionByDay(session, timeZone)) if (key >= startKey && key < endKeyExclusive) duration += value
      return duration
    }).filter(item => item.duration > 0)
  }
}
