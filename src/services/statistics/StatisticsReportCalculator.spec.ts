import { describe, expect, it } from 'vitest'
import type { Task, TaskCategory } from '../../types/task'
import type { StatisticsFocusSession, StatisticsInput } from './StatisticsTypes'
import { StatisticsReportCalculator } from './StatisticsReportCalculator'

const at = (value: string) => Date.parse(value)
let sequence = 0
const session = (start: string, end: string, update: Partial<StatisticsFocusSession> = {}): StatisticsFocusSession => ({
  id: `report-session-${++sequence}`, taskId: null, mode: 'STOPWATCH', startTime: at(start), endTime: at(end),
  duration: at(end) - at(start), status: 'COMPLETED', createdAt: at(end), sourceRecordId: null,
  completedNaturally: true, completedPomodoros: 0, ...update,
})
const task = (id: string, categoryId: string, completedAt: string | null = null): Task => ({
  id, title: id, description: '', categoryId, priority: 'MEDIUM', status: completedAt ? 'COMPLETED' : 'TODO',
  plannedDate: null, dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0, completedAt,
  createdAt: '2024-01-01T00:00:00Z', updatedAt: completedAt ?? '2024-01-01T00:00:00Z',
})
const categories: TaskCategory[] = [
  { id: 'work', name: '工作', color: '#92aa8b', icon: 'Briefcase', isDefault: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'study', name: '学习', color: '#8ea5b5', icon: 'BookOpen', isDefault: true, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
]
const buildInput = (): StatisticsInput => {
  const tasks = [task('工作任务', 'work', '2024-03-12T10:00:00Z'), task('学习任务', 'study')]
  const duplicateSource = session('2024-03-11T08:00:00Z', '2024-03-11T10:00:00Z', { taskId: '工作任务', sourceRecordId: 'same' })
  return { tasks, historicalTasks: tasks, categories, sessions: [
    session('2024-03-05T08:00:00Z', '2024-03-05T09:00:00Z', { taskId: '工作任务' }),
    duplicateSource, { ...duplicateSource, id: 'duplicate', createdAt: duplicateSource.createdAt - 1 },
    session('2024-03-12T08:00:00Z', '2024-03-12T09:00:00Z', { taskId: '学习任务' }),
    session('2024-03-12T23:30:00Z', '2024-03-13T00:30:00Z', { taskId: '工作任务' }),
    session('2024-03-13T09:00:00Z', '2024-03-13T10:00:00Z', { status: 'CANCELLED' }),
    session('2024-02-15T08:00:00Z', '2024-02-15T10:00:00Z', { taskId: 'work' }),
  ] }
}

describe('StatisticsReportCalculator', () => {
  it('根据真实记录生成周报、环比、目标和可追溯任务来源', () => {
    const report = StatisticsReportCalculator.calculate(buildInput(), { type: 'WEEK', now: at('2024-03-13T12:00:00Z'),
      anchor: at('2024-03-13T12:00:00Z'), timeZone: 'UTC', dailyGoalDuration: 60 * 60_000 })
    expect(report).toMatchObject({ startKey: '2024-03-11', endKey: '2024-03-18', focusDuration: 4 * 3_600_000,
      previousFocusDuration: 3_600_000, comparisonRate: 3, completedTasks: 1, focusedDays: 3, longestStreak: 3,
      goalDuration: 3 * 3_600_000, goalMet: true, empty: false })
    expect(report.bestDay).toMatchObject({ date: '2024-03-11', duration: 2 * 3_600_000 })
    expect(report.topCategory).toMatchObject({ name: '工作', duration: 3 * 3_600_000, percentage: .75 })
    expect(report.sourceTasks.map(item => item.title)).toEqual(['工作任务', '学习任务'])
    expect(report.summaries.join('')).toContain('比上周增加300%')
    expect(report.summaries.join('')).toContain('工作占据了75%')
  })

  it('生成月报并计算上月变化、专注天数和月内最长连续天数', () => {
    const report = StatisticsReportCalculator.calculate(buildInput(), { type: 'MONTH', now: at('2024-03-13T12:00:00Z'),
      anchor: at('2024-03-13T12:00:00Z'), timeZone: 'UTC', dailyGoalDuration: 60 * 60_000 })
    expect(report).toMatchObject({ startKey: '2024-03-01', endKey: '2024-04-01', focusDuration: 5 * 3_600_000,
      previousFocusDuration: 2 * 3_600_000, comparisonRate: 1.5, completedTasks: 1, focusedDays: 4, longestStreak: 3 })
    expect(report.summaries).toContain('本月有4天进行了有效专注。')
  })

  it('数据不足时不生成虚假环比和分类结论', () => {
    const report = StatisticsReportCalculator.calculate({ tasks: [], categories: [], sessions: [] }, { type: 'WEEK',
      now: at('2024-03-13T12:00:00Z'), anchor: at('2024-03-13T12:00:00Z'), timeZone: 'UTC' })
    expect(report.comparisonRate).toBeNull()
    expect(report.topCategory).toBeNull()
    expect(report.summaries).toEqual(['本周尚无有效专注记录，完成一次专注后即可生成数据总结。'])
  })

  it('历史周期按完整周期计算目标而非当前已过天数', () => {
    const report = StatisticsReportCalculator.calculate({ tasks: [], categories: [], sessions: [] }, { type: 'WEEK',
      now: at('2024-03-13T12:00:00Z'), anchor: at('2024-03-05T12:00:00Z'), timeZone: 'UTC', dailyGoalDuration: 60 * 60_000 })
    expect(report.goalDuration).toBe(7 * 3_600_000)
  })
})
