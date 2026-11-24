import type { FocusSession } from '../../types/focusSession'
import type { Task, TaskCategory } from '../../types/task'

export interface ActiveFocusInterval { startTime: number; endTime: number }
export type StatisticsFocusSession = FocusSession & { activeIntervals?: ActiveFocusInterval[] }

export interface StatisticsInput {
  tasks: Task[]
  historicalTasks?: Task[]
  categories: TaskCategory[]
  sessions: StatisticsFocusSession[]
}

export interface StatisticsOptions {
  now?: number
  timeZone?: string
  dailyGoalDuration?: number
}

export interface DateRange { start: number; end: number }
export interface DailyFocusPoint { date: string; duration: number; completedPomodoros: number; focusCount: number }
export interface CategoryFocusMetric { categoryId: string | null; name: string; color: string; duration: number; percentage: number }

export interface StatisticsDashboard {
  timeZone: string
  generatedAt: number
  todayFocusDuration: number
  weekFocusDuration: number
  monthFocusDuration: number
  totalFocusDuration: number
  todayCompletedTasks: number
  weekCompletedTasks: number
  totalCompletedPomodoros: number
  dailyAverageFocusDuration: number
  focusStreakDays: number
  taskCompletionRate: number
  dailyGoalAchievementRate: number
  dailyGoalDuration: number
  focusedDayCount: number
  categoryFocusDurations: CategoryFocusMetric[]
  todayRange: DateRange
  weekRange: DateRange
  monthRange: DateRange
}

export const DEFAULT_DAILY_FOCUS_GOAL = 2 * 60 * 60 * 1000

export const STATISTICS_RANGES = ['TODAY', 'WEEK', 'MONTH', 'ALL'] as const
export type StatisticsRange = (typeof STATISTICS_RANGES)[number]

export interface StatisticsTrendPoint {
  key: string
  label: string
  duration: number
  completedTasks: number
  completedPomodoros: number
  focusCount: number
  start: number
  end: number
}

export interface StatisticsFocusRecord {
  id: string
  date: string
  dates: string[]
  startTime: number
  endTime: number
  duration: number
  mode: FocusSession['mode']
  taskId: string | null
  taskTitle: string
  categoryId: string | null
  categoryName: string
  categoryColor: string
  completedPomodoros: number
}

export interface StatisticsPageData {
  range: StatisticsRange
  rangeLabel: string
  start: number
  end: number
  focusDuration: number
  completedTasks: number
  completedPomodoros: number
  focusStreakDays: number
  totalTasks: number
  totalCompletedTasks: number
  taskCompletionRate: number
  trend: StatisticsTrendPoint[]
  categories: CategoryFocusMetric[]
  records: StatisticsFocusRecord[]
  empty: boolean
}

export type FocusHeatmapRange = 'YEAR' | 'RECENT_90'

export interface FocusHeatmapDay {
  date: string
  duration: number
  focusCount: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface HourlyFocusPoint {
  hour: number
  label: string
  duration: number
}

export interface FocusStreakMetric {
  current: number
  longest: number
  monthFocusedDays: number
}

export interface FocusDistributionData {
  range: FocusHeatmapRange
  year: number
  timeZone: string
  startKey: string
  endKey: string
  heatmap: FocusHeatmapDay[]
  hourly: HourlyFocusPoint[]
  peakHour: number | null
  morningDuration: number
  afternoonDuration: number
  eveningDuration: number
  streak: FocusStreakMetric
  records: StatisticsFocusRecord[]
  empty: boolean
}

export type StatisticsReportType = 'WEEK' | 'MONTH'

export interface StatisticsReportTask {
  id: string
  title: string
  categoryName: string
  categoryColor: string
  focusDuration: number
  completedAt: string | null
}

export interface StatisticsReportData {
  type: StatisticsReportType
  periodLabel: string
  previousPeriodLabel: string
  start: number
  end: number
  startKey: string
  endKey: string
  focusDuration: number
  previousFocusDuration: number
  comparisonRate: number | null
  completedTasks: number
  focusedDays: number
  longestStreak: number
  goalDuration: number
  goalAchievementRate: number
  goalMet: boolean
  bestDay: DailyFocusPoint | null
  topCategory: CategoryFocusMetric | null
  daily: DailyFocusPoint[]
  categories: CategoryFocusMetric[]
  summaries: string[]
  sourceTasks: StatisticsReportTask[]
  records: StatisticsFocusRecord[]
  empty: boolean
}
