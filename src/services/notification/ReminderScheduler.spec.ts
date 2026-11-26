import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { ReminderRepository } from '../database/repositories/ReminderRepository'
import { IndexedDbTaskRepository } from '../database/repositories/TaskRepository'
import { HabitRepository } from '../database/repositories/HabitRepository'
import { localDateKey, type Task } from '../../types/task'
import type { Habit } from '../../types/habit'
import { ReminderScheduler, reminderEvents, type ReminderSchedule } from './ReminderScheduler'

const current = new Date(2026, 10, 25, 9, 0).getTime()
const today = localDateKey(new Date(current))
const date = new Date(current).toISOString()
const task: Task = {
  id: 'task', title: '提交报告', description: '', categoryId: 'other', status: 'TODO', priority: 'MEDIUM',
  dueDate: today, plannedDate: null, completedAt: null, sortOrder: 0, estimatedDuration: 0, estimatedPomodoros: 0,
  createdAt: date, updatedAt: date,
}
const habit: Habit = {
  id: 'habit', name: '读书', status: 'ACTIVE', startDate: today, frequency: 'WEEKDAYS', weekdays: [new Date(current).getDay()],
  description: '', icon: '📖', color: '#92aa8b', goalType: 'DAILY_CHECKIN', targetValue: 1, weeklyTarget: 1,
  createdAt: date, updatedAt: date, deletedAt: null,
}
const databases: DatabaseService[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(database => database.delete())) })

describe('ReminderScheduler', () => {
  it('支持指定时间、截止日结束前和按计划日的本地固定时间', () => {
    const schedule: ReminderSchedule = {
      tasks: [
        { target: task, rule: { kind: 'AT', at: current - 10 * 60_000 } },
        { target: { ...task, id: 'due' }, rule: { kind: 'BEFORE_DUE', minutes: 15 * 60 } },
      ],
      habits: [{ target: habit, rule: { kind: 'DAILY', time: '09:00' } }],
    }
    expect(reminderEvents(schedule, current)).toMatchObject([
      { kind: 'TASK_DUE', title: '任务提醒', occurredAt: current - 10 * 60_000 },
      { kind: 'TASK_DUE', title: '任务截止提醒', occurredAt: current },
      { kind: 'HABIT_DAILY', occurredAt: current },
    ])
    expect(reminderEvents(schedule, current - 1)).toHaveLength(1)
    expect(reminderEvents(schedule, current + 61 * 60_000)).toEqual([])
  })

  it('跳过已完成任务、没有截止日期的截止提醒，以及暂停或非计划日的习惯', () => {
    const schedule: ReminderSchedule = {
      tasks: [
        { target: { ...task, status: 'COMPLETED' }, rule: { kind: 'AT', at: current } },
        { target: { ...task, dueDate: null }, rule: { kind: 'BEFORE_DUE', minutes: 15 } },
      ],
      habits: [
        { target: { ...habit, status: 'PAUSED' }, rule: { kind: 'DAILY', time: '09:00' } },
        { target: { ...habit, weekdays: [(new Date(current).getDay() + 1) % 7] }, rule: { kind: 'DAILY', time: '09:00' } },
      ],
    }
    expect(reminderEvents(schedule, current)).toEqual([])
  })

  it('更换调度快照时抑制正在准备的旧提醒', async () => {
    const delivered: string[] = []
    let go!: () => void
    const wait = new Promise<void>(resolve => { go = resolve })
    const publish = vi.fn(async (notice, guard) => {
      await wait
      if (guard()) delivered.push(notice.id)
      return guard()
    })
    const scheduler = new ReminderScheduler({ publish }, () => current)
    const running = scheduler.replace({ tasks: [{ target: task, rule: { kind: 'AT', at: current } }], habits: [] })
    void scheduler.replace({ tasks: [], habits: [] })
    go()
    await running
    expect(publish).toHaveBeenCalledOnce()
    expect(delivered).toEqual([])
  })

  it('保存、改期和取消提醒，并在删除实体后从持久化调度中排除', async () => {
    const database = new DatabaseService(`reminder-${crypto.randomUUID()}`)
    databases.push(database)
    const reminders = new ReminderRepository(database)
    const taskRepo = new IndexedDbTaskRepository(database)
    const habitRepo = new HabitRepository(database)
    await taskRepo.saveTask(task)
    await habitRepo.upsert(habit)
    await reminders.saveRule('task', task.id, { kind: 'AT', at: current })
    await reminders.saveRule('habit', habit.id, { kind: 'DAILY', time: '09:00' })
    expect(reminderEvents(await reminders.schedule(), current)).toHaveLength(2)

    await reminders.saveRule('task', task.id, { kind: 'AT', at: current + 60_000 })
    expect(reminderEvents(await reminders.schedule(), current)).toMatchObject([{ kind: 'HABIT_DAILY' }])
    await reminders.saveRule('habit', habit.id, null)
    expect(reminderEvents(await reminders.schedule(), current + 60_000)).toMatchObject([{ kind: 'TASK_DUE' }])
    await taskRepo.deleteTask(task.id)
    expect((await reminders.schedule()).tasks).toEqual([])
  })

  it('同一 IndexedDB 内不同实例竞争收执只有一个成功，重开仍可去重', async () => {
    const database = new DatabaseService(`reminder-${crypto.randomUUID()}`)
    databases.push(database)
    const left = new ReminderRepository(database)
    const right = new ReminderRepository(database)
    const claims = await Promise.all([left.claim('same-event', current), right.claim('same-event', current)])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const reopened = new DatabaseService(database.indexedDb.name)
    try { expect(await new ReminderRepository(reopened).claim('same-event', current)).toBe(false) }
    finally { reopened.close() }
  })

  it('打开页面时能观察到配置改期和任务删除，无需重启调度器', async () => {
    const database = new DatabaseService(`reminder-${crypto.randomUUID()}`)
    databases.push(database)
    const reminders = new ReminderRepository(database)
    const tasks = new IndexedDbTaskRepository(database)
    await tasks.saveTask(task)
    let observed: ReminderSchedule | undefined
    const subscription = reminders.observeSchedule().subscribe(schedule => { observed = schedule })
    try {
      await vi.waitFor(() => expect(observed?.tasks).toEqual([]))
      await reminders.saveRule('task', task.id, { kind: 'AT', at: current })
      await vi.waitFor(() => expect(reminderEvents(observed!, current)).toHaveLength(1))
      await reminders.saveRule('task', task.id, { kind: 'AT', at: current + 60_000 })
      await vi.waitFor(() => expect(reminderEvents(observed!, current)).toEqual([]))
      await tasks.deleteTask(task.id)
      await vi.waitFor(() => expect(observed?.tasks).toEqual([]))
    } finally { subscription.unsubscribe() }
  })
})
