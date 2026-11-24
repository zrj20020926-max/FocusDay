import type { StatisticsInput, StatisticsOptions, StatisticsReportData, StatisticsReportTask, StatisticsReportType } from './StatisticsTypes'
import { DEFAULT_DAILY_FOCUS_GOAL } from './StatisticsTypes'
import { addCalendarDays, dateKeyAt, normalizeStatisticsSessions, rangeForDateKey, resolvedTimeZone, splitSessionByDay, startOfDateKey, StatisticsCalculator, weekStartKey } from './StatisticsCalculator'

export interface StatisticsReportOptions extends StatisticsOptions {
  type: StatisticsReportType
  anchor?: number
}

type ReportResult = Omit<StatisticsReportData, 'records'>

function shiftMonth(dateKey: string, amount: number): string {
  const [year, month] = dateKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function periodFor(type: StatisticsReportType, anchorKey: string) {
  const startKey = type === 'WEEK' ? weekStartKey(anchorKey) : `${anchorKey.slice(0, 7)}-01`
  const endKey = type === 'WEEK' ? addCalendarDays(startKey, 7) : shiftMonth(startKey, 1)
  const previousStartKey = type === 'WEEK' ? addCalendarDays(startKey, -7) : shiftMonth(startKey, -1)
  return { startKey, endKey, previousStartKey, previousEndKey: startKey }
}

function daysBetween(startKey: string, endKey: string): number {
  let count = 0
  for (let key = startKey; key < endKey; key = addCalendarDays(key, 1)) count += 1
  return count
}

function durationText(duration: number): string {
  const hours = Math.floor(duration / 3_600_000)
  const minutes = Math.round(duration % 3_600_000 / 60_000)
  return hours ? `${hours}小时${minutes ? `${minutes}分钟` : ''}` : `${minutes}分钟`
}

function periodLabel(type: StatisticsReportType, startKey: string, endKey: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', type === 'WEEK'
    ? { timeZone, month: 'short', day: 'numeric' }
    : { timeZone, year: 'numeric', month: 'long' })
  if (type === 'MONTH') return formatter.format(new Date(startOfDateKey(startKey, timeZone) + 12 * 60 * 60 * 1000))
  const start = formatter.format(new Date(startOfDateKey(startKey, timeZone) + 12 * 60 * 60 * 1000))
  const lastKey = addCalendarDays(endKey, -1)
  const end = formatter.format(new Date(startOfDateKey(lastKey, timeZone) + 12 * 60 * 60 * 1000))
  return `${start}–${end}`
}

function completedTasksInRange(input: StatisticsInput, startKey: string, endKey: string, timeZone: string) {
  return [...new Map(input.tasks.map(task => [task.id, task])).values()].filter(task => {
    if (!task.completedAt) return false
    const key = dateKeyAt(Date.parse(task.completedAt), timeZone)
    return key >= startKey && key < endKey
  })
}

function longestDailyStreak(daily: ReportResult['daily']): number {
  let longest = 0; let current = 0
  for (const day of daily) { current = day.duration > 0 ? current + 1 : 0; longest = Math.max(longest, current) }
  return longest
}

function buildTaskSources(input: StatisticsInput, startKey: string, endKey: string, timeZone: string): StatisticsReportTask[] {
  const sessions = normalizeStatisticsSessions(input.sessions)
  const tasks = new Map([...(input.historicalTasks ?? []), ...input.tasks].map(task => [task.id, task]))
  const categories = new Map(input.categories.map(category => [category.id, category]))
  const focusByTask = new Map<string, number>()
  for (const session of sessions) {
    if (!session.taskId) continue
    let duration = 0
    for (const [key, value] of splitSessionByDay(session, timeZone)) if (key >= startKey && key < endKey) duration += value
    if (duration > 0) focusByTask.set(session.taskId, (focusByTask.get(session.taskId) ?? 0) + duration)
  }
  const completed = completedTasksInRange(input, startKey, endKey, timeZone)
  const ids = new Set([...focusByTask.keys(), ...completed.map(task => task.id)])
  return [...ids].map(id => {
    const task = tasks.get(id)
    const category = task ? categories.get(task.categoryId) : null
    return { id, title: task?.title ?? '已删除任务', categoryName: category?.name ?? '其他', categoryColor: category?.color ?? '#b69caf',
      focusDuration: focusByTask.get(id) ?? 0, completedAt: task?.completedAt ?? null }
  }).sort((a, b) => b.focusDuration - a.focusDuration || Number(Boolean(b.completedAt)) - Number(Boolean(a.completedAt)))
}

export class StatisticsReportCalculator {
  static calculate(input: StatisticsInput, options: StatisticsReportOptions): ReportResult {
    const now = options.now ?? Date.now()
    const anchor = options.anchor ?? now
    const timeZone = options.timeZone ?? resolvedTimeZone()
    const goal = options.dailyGoalDuration ?? DEFAULT_DAILY_FOCUS_GOAL
    const anchorKey = dateKeyAt(anchor, timeZone)
    const todayKey = dateKeyAt(now, timeZone)
    const { startKey, endKey, previousStartKey, previousEndKey } = periodFor(options.type, anchorKey)
    const sessions = normalizeStatisticsSessions(input.sessions)
    const daily = StatisticsCalculator.dailySeries(sessions, startKey, endKey, timeZone)
    const previousDaily = StatisticsCalculator.dailySeries(sessions, previousStartKey, previousEndKey, timeZone)
    const focusDuration = daily.reduce((sum, day) => sum + day.duration, 0)
    const previousFocusDuration = previousDaily.reduce((sum, day) => sum + day.duration, 0)
    const comparisonRate = previousFocusDuration > 0 ? (focusDuration - previousFocusDuration) / previousFocusDuration : null
    const categories = StatisticsCalculator.categoryDurations(input, startKey, endKey, timeZone)
    const bestDay = daily.filter(day => day.duration > 0).sort((a, b) => b.duration - a.duration || a.date.localeCompare(b.date))[0] ?? null
    const focusedDays = daily.filter(day => day.duration > 0).length
    const completedTasks = completedTasksInRange(input, startKey, endKey, timeZone).length
    const goalEndKey = todayKey >= startKey && todayKey < endKey ? addCalendarDays(todayKey, 1) : endKey
    const goalDays = Math.max(0, daysBetween(startKey, goalEndKey))
    const goalDuration = goal * goalDays
    const goalAchievementRate = goalDuration > 0 ? focusDuration / goalDuration : 0
    const topCategory = categories[0] ?? null
    const isCurrentPeriod = todayKey >= startKey && todayKey < endKey
    const label = options.type === 'WEEK' ? (isCurrentPeriod ? '本周' : '该周') : (isCurrentPeriod ? '本月' : '该月')
    const previousLabel = options.type === 'WEEK' ? (isCurrentPeriod ? '上周' : '前一周') : '上月'
    const summaries: string[] = []
    if (focusDuration > 0) {
      let first = `${label}累计专注${durationText(focusDuration)}`
      if (comparisonRate !== null) {
        const percentage = Math.round(Math.abs(comparisonRate) * 100)
        first += comparisonRate === 0 ? `，与${previousLabel}持平` : `，比${previousLabel}${comparisonRate > 0 ? '增加' : '减少'}${percentage}%`
      }
      summaries.push(`${first}。`)
      if (topCategory?.duration) summaries.push(`${label}${topCategory.name}占据了${Math.round(topCategory.percentage * 100)}%的专注时间。`)
      if (options.type === 'MONTH') summaries.push(`${label}有${focusedDays}天进行了有效专注。`)
      if (goalDuration > 0) summaries.push(goalAchievementRate >= 1 ? `${label}已完成专注目标。` : `${label}专注目标已完成${Math.round(goalAchievementRate * 100)}%。`)
    } else summaries.push(`${label}尚无有效专注记录，完成一次专注后即可生成数据总结。`)
    return {
      type: options.type, periodLabel: periodLabel(options.type, startKey, endKey, timeZone),
      previousPeriodLabel: periodLabel(options.type, previousStartKey, previousEndKey, timeZone),
      start: startOfDateKey(startKey, timeZone), end: startOfDateKey(endKey, timeZone), startKey, endKey,
      focusDuration, previousFocusDuration, comparisonRate, completedTasks, focusedDays,
      longestStreak: longestDailyStreak(daily), goalDuration, goalAchievementRate, goalMet: goalDuration > 0 && focusDuration >= goalDuration,
      bestDay, topCategory, daily, categories, summaries, sourceTasks: buildTaskSources(input, startKey, endKey, timeZone),
      empty: focusDuration === 0 && completedTasks === 0,
    }
  }
}
