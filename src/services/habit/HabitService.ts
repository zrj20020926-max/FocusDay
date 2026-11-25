import type { FocusSession } from '../../types/focusSession'
import { HABIT_FREQUENCIES, HABIT_GOAL_TYPES, HabitDomainError, type CreateHabitInput, type Habit, type HabitRecord, type HabitRecordRepositoryPort, type HabitRepositoryPort, type HabitStats, type UpdateHabitInput } from '../../types/habit'
import { addCalendarDays, dateKeyAt, normalizeStatisticsSessions, splitSessionByDay, weekStartKey } from '../statistics/StatisticsCalculator'

const clone = <T>(value: T): T => structuredClone(value)
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const isWeeklyHabit = (habit: Habit) => habit.frequency === 'WEEKLY_TARGET' || habit.goalType === 'WEEKLY_COUNT'
export const formatHabitValue = (habit: Habit, value: number) => habit.goalType === 'DAILY_DURATION'
  ? `${Number((value / 60_000).toFixed(1))} 分钟`
  : `${value} 次`

export class HabitService {
  private habits: Habit[] = []
  private records: HabitRecord[] = []
  private focusByHabit = new Map<string, Map<string, { duration: number; ids: Set<string> }>>()
  constructor(private readonly habitRepository: HabitRepositoryPort, private readonly recordRepository: HabitRecordRepositoryPort) {}

  async initialize(): Promise<void> { this.habits = await this.habitRepository.list(); await this.reloadRecords() }
  async reload(): Promise<void> { await this.initialize() }
  getAll(): Habit[] { return clone(this.habits.filter(item => !item.deletedAt)) }
  getRecords(habitId?: string): HabitRecord[] {
    const byHabit = new Map<string, Map<string, HabitRecord>>()
    for (const record of this.records) {
      if (record.deletedAt || (habitId && record.habitId !== habitId)) continue
      const dates = byHabit.get(record.habitId) ?? new Map<string, HabitRecord>()
      dates.set(record.recordDate, record)
      byHabit.set(record.habitId, dates)
    }
    const result: HabitRecord[] = []
    for (const habit of this.habits) {
      if (habitId && habit.id !== habitId) continue
      const manual = byHabit.get(habit.id)
      const focus = habit.goalType === 'DAILY_DURATION' ? this.focusByHabit.get(habit.id) : undefined
      for (const date of new Set([...(manual?.keys() ?? []), ...(focus?.keys() ?? [])])) {
        const previous = manual?.get(date)
        const contribution = focus?.get(date)
        const manualValue = previous?.manualValue ?? 0
        const actualValue = manualValue + (contribution?.duration ?? 0)
        if (actualValue <= 0) continue
        result.push({
          id: previous?.id ?? `${habit.id}:${date}`,
          habitId: habit.id,
          recordDate: date,
          manualValue,
          actualValue,
          focusSessionIds: [...(contribution?.ids ?? [])],
          completed: this.isRecordCompleted(habit, actualValue),
          createdAt: previous?.createdAt ?? habit.createdAt,
          updatedAt: previous?.updatedAt ?? habit.updatedAt,
          deletedAt: null,
        })
      }
    }
    return result
  }
  getById(id: string): Habit | null { return clone(this.habits.find(item => item.id === id && !item.deletedAt) ?? null) }

  async create(input: CreateHabitInput): Promise<Habit> {
    this.validateInput(input)
    const now = new Date().toISOString()
    const habit: Habit = { id: crypto.randomUUID(), ...clone(input), name: input.name.trim(), description: input.description.trim(), status: 'ACTIVE', createdAt: now, updatedAt: now, deletedAt: null }
    await this.habitRepository.upsert(habit); this.habits.push(habit); return clone(habit)
  }

  async update(id: string, input: UpdateHabitInput): Promise<Habit> {
    const current = this.requireHabit(id); const next = { ...current, ...clone(input), updatedAt: new Date().toISOString() }
    const changesUnit = (current.goalType === 'DAILY_DURATION') !== (next.goalType === 'DAILY_DURATION')
    if (changesUnit && this.getRecords(id).length) {
      throw new HabitDomainError('已有历史记录的习惯不能在时长和次数之间切换', 'VALIDATION')
    }
    this.validateInput(next); next.name = next.name.trim(); next.description = next.description.trim()
    await this.habitRepository.upsert(next); this.replaceHabit(next); return clone(next)
  }
  async pause(id: string): Promise<Habit> { return this.setStatus(id, 'PAUSED') }
  async resume(id: string): Promise<Habit> { return this.setStatus(id, 'ACTIVE') }
  async delete(id: string): Promise<boolean> {
    this.requireHabit(id); const deleted = await this.habitRepository.softDelete(id)
    if (deleted) this.habits = this.habits.filter(item => item.id !== id)
    return deleted
  }

  async checkIn(id: string, recordDate: string, actualValue?: number): Promise<HabitRecord> {
    const habit = this.requireHabit(id); this.validateDate(recordDate)
    if (habit.status !== 'ACTIVE' || !this.isScheduled(habit, recordDate) || recordDate > dateKeyAt(Date.now())) {
      throw new HabitDomainError('该日期无法打卡', 'VALIDATION')
    }
    const existing = await this.recordRepository.findByHabitDate(id, recordDate)
    const focusValue = this.focusByHabit.get(id)?.get(recordDate)?.duration ?? 0
    const manualValue = actualValue ?? (habit.goalType === 'DAILY_DURATION' ? Math.max(1, habit.targetValue - focusValue) : 1)
    if (!Number.isSafeInteger(manualValue) || manualValue <= 0) throw new HabitDomainError('打卡数值无效', 'VALIDATION')
    const now = new Date().toISOString()
    const record: HabitRecord = { id: existing?.id ?? crypto.randomUUID(), habitId: id, recordDate, manualValue,
      focusSessionIds: [], actualValue: manualValue,
      completed: this.isRecordCompleted(habit, manualValue), createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null }
    const saved = await this.recordRepository.upsert(record); this.replaceRecord(saved); return saved
  }

  async uncheck(id: string, recordDate: string): Promise<HabitRecord | null> {
    this.requireHabit(id); this.validateDate(recordDate)
    const existing = await this.recordRepository.findByHabitDate(id, recordDate)
    if (!existing?.manualValue) return null
    const next = { ...existing, manualValue: 0, actualValue: 0, focusSessionIds: [], completed: false, updatedAt: new Date().toISOString() }
    const saved = await this.recordRepository.upsert(next); this.replaceRecord(saved); return saved
  }

  recalculateFromFocusSessions(sessions: FocusSession[], timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'): void {
    const projection = new Map<string, Map<string, { duration: number; ids: Set<string> }>>()
    for (const session of normalizeStatisticsSessions(sessions.filter(item => item.habitId))) {
      const habitId = session.habitId!
      const grouped = projection.get(habitId) ?? new Map()
      for (const [date, duration] of splitSessionByDay(session, timeZone)) {
        if (duration <= 0) continue
        const value = grouped.get(date) ?? { duration: 0, ids: new Set<string>() }
        value.duration += duration; value.ids.add(session.id); grouped.set(date, value)
      }
      projection.set(habitId, grouped)
    }
    this.focusByHabit = projection
  }

  stats(habitId: string, todayKey = dateKeyAt(Date.now()), records = this.getRecords(habitId)): HabitStats {
    const habit = this.requireHabit(habitId)
    records = records.filter(record => record.recordDate <= todayKey && this.isScheduled(habit, record.recordDate))
    const completedDates = new Set(records.filter(record => record.completed).map(record => record.recordDate))
    const weekStart = weekStartKey(todayKey); const monthStart = `${todayKey.slice(0, 7)}-01`
    const weekScheduled = this.scheduledDates(habit, weekStart, addCalendarDays(todayKey, 1))
    const monthScheduled = this.scheduledDates(habit, monthStart, addCalendarDays(todayKey, 1))
    const completionRate = (dates: string[]) => {
      if (isWeeklyHabit(habit)) {
        const weeks = new Map(dates.map(date => [weekStartKey(date), 0]))
        for (const item of records) {
          if (item.completed && dates.includes(item.recordDate)) {
            const key = weekStartKey(item.recordDate)
            weeks.set(key, (weeks.get(key) ?? 0) + 1)
          }
        }
        return weeks.size ? [...weeks.values()].reduce((sum, count) => sum + Math.min(1, count / habit.weeklyTarget), 0) / weeks.size : 0
      }
      return dates.length ? dates.filter(date => completedDates.has(date)).length / dates.length : 0
    }
    const streak = this.streaks(habit, records, todayKey)
    const today = records.find(item => item.recordDate === todayKey)
    return { weekRate: completionRate(weekScheduled), monthRate: completionRate(monthScheduled), currentStreak: streak.current,
      longestStreak: streak.longest, todayCompleted: Boolean(today?.completed), todayValue: today?.actualValue ?? 0 }
  }

  isScheduled(habit: Habit, dateKey: string): boolean {
    if (dateKey < habit.startDate) return false
    if (habit.frequency === 'DAILY' || habit.frequency === 'WEEKLY_TARGET') return true
    const [year, month, day] = dateKey.split('-').map(Number); const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return habit.weekdays.includes(weekday)
  }

  private streaks(habit: Habit, records: HabitRecord[], todayKey: string) {
    if (isWeeklyHabit(habit)) {
      const weeks = new Map<string, number>()
      records.filter(item => item.completed && item.recordDate <= todayKey).forEach(item => {
        const key = weekStartKey(item.recordDate)
        weeks.set(key, (weeks.get(key) ?? 0) + 1)
      })
      const completed = [...weeks].filter(([, value]) => value >= habit.weeklyTarget).map(([key]) => key).sort()
      return this.sequenceStreak(completed, weekStartKey(todayKey), key => addCalendarDays(key, 7), key => addCalendarDays(key, -7))
    }
    const completed = records.filter(item => item.completed).map(item => item.recordDate).sort()
    const anchor = this.isScheduled(habit, todayKey) ? todayKey : this.adjacentScheduled(habit, todayKey, -1)
    return this.sequenceStreak(completed, anchor, key => this.adjacentScheduled(habit, key, 1),
      key => this.adjacentScheduled(habit, key, -1), anchor === todayKey)
  }

  private adjacentScheduled(habit: Habit, date: string, direction: -1 | 1): string {
    if (!date) return ''
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = addCalendarDays(date, direction * offset)
      if (this.isScheduled(habit, candidate)) return candidate
    }
    return ''
  }

  private sequenceStreak(completed: string[], anchor: string, next: (key: string) => string, previous: (key: string) => string, allowOpenPeriod = true) {
    const set = new Set(completed); let currentAnchor = set.has(anchor) || !allowOpenPeriod ? anchor : previous(anchor); let current = 0
    while (currentAnchor && set.has(currentAnchor)) { current += 1; currentAnchor = previous(currentAnchor) }
    let longest = 0; let run = 0; let last = ''
    for (const key of completed) { run = last && next(last) === key ? run + 1 : 1; longest = Math.max(longest, run); last = key }
    return { current, longest }
  }

  private scheduledDates(habit: Habit, start: string, endExclusive: string): string[] {
    const result: string[] = []; for (let key = start; key < endExclusive; key = addCalendarDays(key, 1)) if (this.isScheduled(habit, key)) result.push(key); return result
  }
  private isRecordCompleted(habit: Habit, value: number) { return value >= (habit.goalType === 'DAILY_DURATION' ? habit.targetValue : 1) }
  private async setStatus(id: string, status: Habit['status']) { const habit = this.requireHabit(id); const next = { ...habit, status, updatedAt: new Date().toISOString() }; await this.habitRepository.upsert(next); this.replaceHabit(next); return clone(next) }
  private requireHabit(id: string) { const habit = this.habits.find(item => item.id === id && !item.deletedAt); if (!habit) throw new HabitDomainError('习惯不存在', 'NOT_FOUND'); return habit }
  private replaceHabit(habit: Habit) { const index = this.habits.findIndex(item => item.id === habit.id); if (index >= 0) this.habits[index] = habit; else this.habits.push(habit) }
  private replaceRecord(record: HabitRecord) { const index = this.records.findIndex(item => item.habitId === record.habitId && item.recordDate === record.recordDate); if (index >= 0) this.records[index] = record; else this.records.push(record) }
  private async reloadRecords() { const values: HabitRecord[] = []; for (const habit of this.habits) values.push(...await this.recordRepository.listByHabit(habit.id)); this.records = values }
  private validateDate(value: string) {
    const parsed = Date.parse(`${value}T00:00:00Z`)
    if (!DATE_PATTERN.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
      throw new HabitDomainError('日期无效', 'VALIDATION')
    }
  }
  private validateInput(input: CreateHabitInput) {
    if (!input.name?.trim() || input.name.trim().length > 120) throw new HabitDomainError('习惯名称需为 1 至 120 个字符', 'VALIDATION')
    if (!/^#[0-9a-f]{6}$/i.test(input.color) || !HABIT_GOAL_TYPES.includes(input.goalType) || !HABIT_FREQUENCIES.includes(input.frequency)) throw new HabitDomainError('习惯配置无效', 'VALIDATION')
    if (!Number.isSafeInteger(input.targetValue) || input.targetValue <= 0 || !Number.isInteger(input.weeklyTarget) || input.weeklyTarget < 1 || input.weeklyTarget > 7) throw new HabitDomainError('请填写有效的目标数值', 'VALIDATION')
    if (input.frequency === 'WEEKDAYS' && (!input.weekdays.length || input.weekdays.some(value => !Number.isInteger(value) || value < 0 || value > 6))) throw new HabitDomainError('请选择有效的每周日期', 'VALIDATION')
    if (input.frequency === 'WEEKDAYS' && input.goalType === 'WEEKLY_COUNT' && input.weeklyTarget > new Set(input.weekdays).size) {
      throw new HabitDomainError('每周目标不能超过已选日期数', 'VALIDATION')
    }
    this.validateDate(input.startDate)
  }
}
