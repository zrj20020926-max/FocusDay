import { defineStore } from 'pinia'
import { liveQuery } from 'dexie'
import { HabitService } from '../services/habit/HabitService'
import { HabitRepository } from '../services/database/repositories/HabitRepository'
import { HabitRecordRepository } from '../services/database/repositories/HabitRecordRepository'
import type { CreateHabitInput, Habit, HabitRecord, UpdateHabitInput } from '../types/habit'
import { FocusSessionRepository } from '../services/database/repositories/FocusSessionRepository'
import { dateKeyAt } from '../services/statistics/StatisticsCalculator'
import { useAppStore } from './app'

const service = new HabitService(new HabitRepository(), new HabitRecordRepository())
const focusRepository = new FocusSessionRepository()
let initialization: Promise<void> | null = null
let observer: { unsubscribe(): void } | null = null

export const useHabitStore = defineStore('habits', {
  state: () => ({
    habits: [] as Habit[],
    records: [] as HabitRecord[],
    initialized: false,
    loadError: '',
    today: dateKeyAt(Date.now()),
    timeZone: '',
    selectedHabitId: null as string | null,
    drawerOpen: false,
    formOpen: false,
  }),
  getters: {
    activeHabits: state => state.habits.filter(habit => habit.status === 'ACTIVE'),
    selectedHabit: state => state.habits.find(habit => habit.id === state.selectedHabitId) ?? null,
    recordsFor: state => (habitId: string) => state.records.filter(record => record.habitId === habitId).sort((a, b) => b.recordDate.localeCompare(a.recordDate)),
    todayRecord: state => (habitId: string) => state.records.find(record => record.habitId === habitId && record.recordDate === state.today) ?? null,
    stats: state => (id: string, today = state.today) => {
      if (!state.habits.some(habit => habit.id === id)) return null
      return service.stats(id, today, state.records.filter(record => record.habitId === id))
    },
  },
  actions: {
    async initialize() {
      if (this.initialized) return
      initialization ??= this.refresh().finally(() => { initialization = null })
      return initialization
    },
    async refresh() {
      try {
        await service.reload()
        this.sync()
        if (this.selectedHabitId && !this.selectedHabit) this.closeDrawer()
        this.initialized = true
        this.loadError = ''
      } catch (error) {
        this.loadError = '暂时无法读取本地习惯'
        throw error
      }
    },
    async observeFocus() {
      await this.initialize()
      if (observer) return
      this.updateDate()
      observer = liveQuery(() => focusRepository.listForHabits()).subscribe({
        next: sessions => { service.recalculateFromFocusSessions(sessions, this.timeZone); this.sync() },
        error: () => { this.stopObserving(); useAppStore().notify('暂时无法更新习惯的专注进度') },
      })
    },
    stopObserving() { observer?.unsubscribe(); observer = null },
    updateDate() {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      this.today = dateKeyAt(Date.now(), zone)
      if (zone !== this.timeZone) {
        const observing = Boolean(observer)
        this.timeZone = zone
        this.stopObserving()
        if (observing) void this.observeFocus()
      }
    },
    async create(input: CreateHabitInput) { const value = await service.create(input); this.sync(); return value },
    async update(id: string, input: UpdateHabitInput) { const value = await service.update(id, input); this.sync(); return value },
    async remove(id: string) { const value = await service.delete(id); this.sync(); if (this.selectedHabitId === id) this.closeDrawer(); return value },
    async pause(id: string) { const value = await service.pause(id); this.sync(); return value },
    async resume(id: string) { const value = await service.resume(id); this.sync(); return value },
    async checkIn(id: string, value?: number) { this.updateDate(); const record = await service.checkIn(id, this.today, value); this.sync(); return record },
    async uncheck(id: string) { this.updateDate(); const record = await service.uncheck(id, this.today); this.sync(); return record },
    isScheduled(habit: Habit, date?: string) { return service.isScheduled(habit, date ?? this.today) },
    openDrawer(id: string) { this.selectedHabitId = id; this.drawerOpen = true },
    closeDrawer() { this.drawerOpen = false; this.selectedHabitId = null },
    sync() { this.habits = service.getAll(); this.records = service.getRecords() },
  },
})
