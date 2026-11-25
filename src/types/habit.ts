export const HABIT_GOAL_TYPES = ['DAILY_CHECKIN', 'DAILY_DURATION', 'WEEKLY_COUNT'] as const
export type HabitGoalType = (typeof HABIT_GOAL_TYPES)[number]
export const HABIT_FREQUENCIES = ['DAILY', 'WEEKDAYS', 'WEEKLY_TARGET'] as const
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number]
export type HabitStatus = 'ACTIVE' | 'PAUSED'

export interface Habit {
  id: string
  name: string
  description: string
  icon: string
  color: string
  goalType: HabitGoalType
  targetValue: number
  frequency: HabitFrequency
  weekdays: number[]
  weeklyTarget: number
  startDate: string
  status: HabitStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface HabitRecord {
  id: string
  habitId: string
  recordDate: string
  /** Stored manual value plus derived focus time when read through HabitService. */
  actualValue: number
  /** The synced check-in contribution. Duration habits use milliseconds. */
  manualValue: number
  focusSessionIds: string[]
  completed: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type CreateHabitInput = Pick<Habit, 'name' | 'description' | 'icon' | 'color' | 'goalType' | 'targetValue' | 'frequency' | 'weekdays' | 'weeklyTarget' | 'startDate'>
export type UpdateHabitInput = Partial<CreateHabitInput>

export interface HabitRepositoryPort {
  list(includeDeleted?: boolean): Promise<Habit[]>
  findById(id: string): Promise<Habit | null>
  upsert(habit: Habit): Promise<Habit>
  softDelete(id: string): Promise<boolean>
}

export interface HabitRecordRepositoryPort {
  listByHabit(habitId: string, includeDeleted?: boolean): Promise<HabitRecord[]>
  listRange(startDate: string, endDate: string): Promise<HabitRecord[]>
  findByHabitDate(habitId: string, recordDate: string): Promise<HabitRecord | null>
  upsert(record: HabitRecord): Promise<HabitRecord>
  bulkUpsert(records: HabitRecord[]): Promise<HabitRecord[]>
  softDelete(id: string): Promise<boolean>
}

export interface HabitStats {
  weekRate: number
  monthRate: number
  currentStreak: number
  longestStreak: number
  todayCompleted: boolean
  todayValue: number
}

export class HabitDomainError extends Error {
  constructor(message: string, public readonly code: 'VALIDATION' | 'NOT_FOUND' | 'DUPLICATE' | 'PERSISTENCE') { super(message); this.name = 'HabitDomainError' }
}
