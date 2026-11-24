import { describe, expect, it } from 'vitest'
import type { FocusSession } from '../../types/focusSession'
import type { Task, TaskCategory } from '../../types/task'
import { StatisticsCalculator, addCalendarDays, dateKeyAt, rangeForDateKey, splitSessionByDay, splitSessionByHour, weekStartKey } from './StatisticsCalculator'
import type { StatisticsFocusSession } from './StatisticsTypes'

const at = (value: string) => Date.parse(value)
let sessionSequence = 0
const session = (start: string, end: string, duration?: number, update: Partial<StatisticsFocusSession> = {}): StatisticsFocusSession => ({
  id: `session-${++sessionSequence}`, taskId: null, mode: 'STOPWATCH', startTime: at(start), endTime: at(end),
  duration: duration ?? at(end) - at(start), status: 'COMPLETED', createdAt: at(end), sourceRecordId: null,
  completedNaturally: true, completedPomodoros: 0, ...update,
})
const task = (id: string, status: Task['status'] = 'TODO', completedAt: string | null = null, categoryId = 'work'): Task => ({
  id, title: id, description: '', categoryId, priority: 'MEDIUM', status, plannedDate: null, dueDate: null,
  estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0, completedAt,
  createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
})
const categories: TaskCategory[] = [{ id: 'work', name: '工作', color: '#92aa8b', icon: 'Briefcase', isDefault: true,
  createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }]
const calculate = (sessions: StatisticsFocusSession[] = [], tasks: Task[] = [], now = at('2024-03-13T12:00:00Z'), timeZone = 'UTC') =>
  StatisticsCalculator.calculate({ sessions, tasks, categories }, { now, timeZone, dailyGoalDuration: 60 * 60 * 1000 })

describe('StatisticsCalculator', () => {
  it('空数据返回稳定的零值统计', () => {
    expect(calculate()).toMatchObject({ todayFocusDuration: 0, totalFocusDuration: 0, todayCompletedTasks: 0,
      totalCompletedPomodoros: 0, dailyAverageFocusDuration: 0, focusStreakDays: 0, taskCompletionRate: 0, dailyGoalAchievementRate: 0 })
  })

  it('计算单条和多条有效记录并排除取消记录', () => {
    const valid = session('2024-03-13T08:00:00Z', '2024-03-13T09:00:00Z', undefined, { mode: 'POMODORO', completedPomodoros: 2 })
    const second = session('2024-03-12T08:00:00Z', '2024-03-12T08:30:00Z')
    const cancelled = session('2024-03-13T10:00:00Z', '2024-03-13T11:00:00Z', undefined, { status: 'CANCELLED' })
    expect(calculate([valid, second, cancelled])).toMatchObject({ todayFocusDuration: 3_600_000, weekFocusDuration: 5_400_000,
      totalFocusDuration: 5_400_000, totalCompletedPomodoros: 2, dailyAverageFocusDuration: 2_700_000 })
  })

  it('按 sourceRecordId 去重，避免同一计时被重复统计', () => {
    const first = session('2024-03-13T08:00:00Z', '2024-03-13T09:00:00Z', undefined, { sourceRecordId: 'timer-record-1' })
    const duplicate = { ...first, id: 'another-id', createdAt: first.createdAt + 1 }
    expect(calculate([first, duplicate]).totalFocusDuration).toBe(3_600_000)
  })

  it('跨午夜按实际墙钟重叠拆分每日时长', () => {
    const value = session('2024-03-12T23:30:00Z', '2024-03-13T00:30:00Z')
    expect([...splitSessionByDay(value, 'UTC').entries()]).toEqual([['2024-03-12', 1_800_000], ['2024-03-13', 1_800_000]])
    expect(calculate([value]).todayFocusDuration).toBe(1_800_000)
  })

  it('聚合暂停记录按比例兼容拆分，存在有效时间片时使用精确区间', () => {
    const aggregate = session('2024-03-12T23:00:00Z', '2024-03-13T01:00:00Z', 3_600_000)
    expect([...splitSessionByDay(aggregate, 'UTC').values()]).toEqual([1_800_000, 1_800_000])
    const exact = { ...aggregate, activeIntervals: [{ startTime: at('2024-03-12T23:50:00Z'), endTime: at('2024-03-13T00:10:00Z') }] }
    expect([...splitSessionByDay(exact, 'UTC').values()]).toEqual([600_000, 600_000])
  })

  it('正确处理月份切换、月末和闰年日期', () => {
    const sessions = [session('2024-02-29T23:30:00Z', '2024-03-01T00:30:00Z'), session('2024-03-30T23:00:00Z', '2024-03-31T00:00:00Z')]
    const february = calculate(sessions, [], at('2024-02-29T12:00:00Z'))
    const march = calculate(sessions, [], at('2024-03-31T12:00:00Z'))
    expect(february.monthFocusDuration).toBe(1_800_000)
    expect(march.monthFocusDuration).toBe(5_400_000)
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('使用周一作为一周开始', () => {
    expect(weekStartKey('2024-03-17')).toBe('2024-03-11')
    expect(weekStartKey('2024-03-11')).toBe('2024-03-11')
  })

  it('时区边界归入用户本地日期并正确处理夏令时日长', () => {
    expect(dateKeyAt(at('2024-03-13T00:30:00Z'), 'America/Los_Angeles')).toBe('2024-03-12')
    const spring = rangeForDateKey('2024-03-10', 'America/New_York')
    const autumn = rangeForDateKey('2024-11-03', 'America/New_York')
    expect(spring.end - spring.start).toBe(23 * 60 * 60 * 1000)
    expect(autumn.end - autumn.start).toBe(25 * 60 * 60 * 1000)
  })

  it('计算连续专注天数并允许今天尚未开始时延续昨天的 streak', () => {
    const sessions = [session('2024-03-10T08:00:00Z', '2024-03-10T08:10:00Z'), session('2024-03-11T08:00:00Z', '2024-03-11T08:10:00Z'),
      session('2024-03-12T08:00:00Z', '2024-03-12T08:10:00Z')]
    expect(calculate(sessions).focusStreakDays).toBe(3)
  })

  it('计算完成任务数量、任务完成率和本月每日目标达成率', () => {
    const tasks = [task('done-today', 'COMPLETED', '2024-03-13T09:00:00Z'), task('done-week', 'COMPLETED', '2024-03-11T09:00:00Z'), task('todo')]
    const sessions = [session('2024-03-12T08:00:00Z', '2024-03-12T09:00:00Z'), session('2024-03-13T08:00:00Z', '2024-03-13T09:00:00Z')]
    const result = calculate(sessions, tasks)
    expect(result.todayCompletedTasks).toBe(1)
    expect(result.weekCompletedTasks).toBe(2)
    expect(result.taskCompletionRate).toBeCloseTo(2 / 3)
    expect(result.dailyGoalAchievementRate).toBeCloseTo(2 / 13)
  })

  it('按任务分类汇总专注时长并保留已删除任务的历史归属', () => {
    const linked = session('2024-03-13T08:00:00Z', '2024-03-13T09:00:00Z', undefined, { taskId: 'deleted-task' })
    const free = session('2024-03-13T10:00:00Z', '2024-03-13T10:30:00Z')
    const result = StatisticsCalculator.calculate({ sessions: [linked, free], tasks: [], historicalTasks: [task('deleted-task')], categories },
      { now: at('2024-03-13T12:00:00Z'), timeZone: 'UTC' })
    expect(result.categoryFocusDurations).toEqual([
      expect.objectContaining({ categoryId: 'work', name: '工作', duration: 3_600_000 }),
      expect.objectContaining({ categoryId: null, name: '自由专注', duration: 1_800_000 }),
    ])
  })

  it('生成完整的 365 天与 366 天年度序列', () => {
    expect(StatisticsCalculator.dailySeries([], '2023-01-01', '2024-01-01', 'UTC')).toHaveLength(365)
    expect(StatisticsCalculator.dailySeries([], '2024-01-01', '2025-01-01', 'UTC')).toHaveLength(366)
  })

  it('按小时区间交集拆分跨小时记录，而不是归入开始小时', () => {
    const value = session('2024-03-13T08:30:00Z', '2024-03-13T10:30:00Z')
    expect([...splitSessionByHour(value, -Infinity, Infinity, 'UTC').entries()]).toEqual([
      [8, 30 * 60_000], [9, 60 * 60_000], [10, 30 * 60_000],
    ])
  })

  it('存在有效时间片时精确拆分暂停后的小时分布', () => {
    const value = session('2024-03-13T08:00:00Z', '2024-03-13T11:00:00Z', 40 * 60_000, { activeIntervals: [
      { startTime: at('2024-03-13T08:50:00Z'), endTime: at('2024-03-13T09:10:00Z') },
      { startTime: at('2024-03-13T10:00:00Z'), endTime: at('2024-03-13T10:20:00Z') },
    ] })
    expect([...splitSessionByHour(value, -Infinity, Infinity, 'UTC').entries()]).toEqual([
      [8, 10 * 60_000], [9, 10 * 60_000], [10, 20 * 60_000],
    ])
  })

  it('小时分布遵循用户时区并正确跨越本地午夜', () => {
    const value = session('2024-03-13T15:30:00Z', '2024-03-13T16:30:00Z')
    expect([...splitSessionByHour(value, -Infinity, Infinity, 'Asia/Shanghai').entries()]).toEqual([
      [23, 30 * 60_000], [0, 30 * 60_000],
    ])
  })

  it('计算当前、历史最长连续天数和本月专注天数', () => {
    const sessions = [
      session('2024-02-27T08:00:00Z', '2024-02-27T08:10:00Z'),
      session('2024-02-28T08:00:00Z', '2024-02-28T08:10:00Z'),
      session('2024-02-29T08:00:00Z', '2024-02-29T08:10:00Z'),
      session('2024-03-11T08:00:00Z', '2024-03-11T08:10:00Z'),
      session('2024-03-12T08:00:00Z', '2024-03-12T08:10:00Z'),
    ]
    expect(StatisticsCalculator.streakMetrics(sessions, at('2024-03-13T12:00:00Z'), 'UTC')).toEqual({ current: 2, longest: 3, monthFocusedDays: 2 })
    expect(StatisticsCalculator.streakMetrics([], at('2024-03-13T12:00:00Z'), 'UTC')).toEqual({ current: 0, longest: 0, monthFocusedDays: 0 })
  })
})
