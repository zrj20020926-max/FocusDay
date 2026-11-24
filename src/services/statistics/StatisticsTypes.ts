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
