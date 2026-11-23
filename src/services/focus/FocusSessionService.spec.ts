import { describe, expect, it } from 'vitest'
import { FocusSessionService } from './FocusSessionService'
import { TimerService } from '../timer/TimerService'
import { TimerCalculator } from '../timer/TimerCalculator'
import type { FocusSession, FocusSessionRepositoryPort } from '../../types/focusSession'
import type { Clock, FocusRecord, TimerSnapshot, TimerStorage } from '../../types/timer'

class FakeClock implements Clock {
  constructor(public value = Date.UTC(2026, 10, 23, 9)) {}
  now() { return this.value }
  advance(milliseconds: number) { this.value += milliseconds }
}

class MemoryTimerStorage implements TimerStorage {
  snapshot: TimerSnapshot | null = null
  load() { return this.snapshot ? structuredClone(this.snapshot) : null }
  save(snapshot: TimerSnapshot) { this.snapshot = structuredClone(snapshot) }
}

class MemoryFocusStorage implements FocusSessionRepositoryPort {
  sessions: FocusSession[] = []
  async list() { return structuredClone(this.sessions) }
  async findById(id: string) { return structuredClone(this.sessions.find(session => session.id === id) ?? null) }
  async upsert(session: FocusSession) {
    const index = this.sessions.findIndex(item => item.id === session.id)
    if (index >= 0) this.sessions[index] = structuredClone(session)
    else this.sessions.push(structuredClone(session))
    return structuredClone(session)
  }
  async bulkUpsert(sessions: FocusSession[]) { for (const session of sessions) await this.upsert(session); return structuredClone(sessions) }
  async softDelete(id: string) {
    const length = this.sessions.length
    this.sessions = this.sessions.filter(session => session.id !== id)
    return this.sessions.length !== length
  }
}

async function setup() {
  const clock = new FakeClock()
  const timer = new TimerService(new MemoryTimerStorage(), clock)
  timer.restore()
  const sessions = new FocusSessionService(new MemoryFocusStorage())
  await sessions.initialize()
  return { clock, timer, sessions }
}

describe('FocusSessionService integration', () => {
  it('从任务开始专注并保留 taskId', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH', { taskId: 'task-1' })
    clock.advance(1200)
    timer.finish()
    await sessions.syncTimerRecords(timer.getRecords())
    expect(sessions.getTaskSessions('task-1')).toHaveLength(1)
    expect(sessions.getTaskSummary('task-1').duration).toBe(1200)
  })

  it('自由专注允许 taskId 为空', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH', { taskId: null })
    clock.advance(600)
    timer.finish()
    await sessions.syncTimerRecords(timer.getRecords())
    expect(sessions.getAll()[0].taskId).toBeNull()
  })

  it('有效计时结束后生成独立记录', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH')
    clock.advance(900)
    timer.finish()
    const result = await sessions.syncTimerRecords(timer.getRecords())
    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({ status: 'COMPLETED', duration: 900 })
  })

  it('暂停恢复只生成一条记录且时长正确', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH', { taskId: 'task-2' })
    clock.advance(400)
    timer.pause()
    clock.advance(5000)
    timer.resume()
    clock.advance(600)
    timer.finish()
    await sessions.syncTimerRecords(timer.getRecords())
    expect(sessions.getTaskSessions('task-2')).toHaveLength(1)
    expect(sessions.getTaskSummary('task-2').duration).toBe(1000)
  })

  it('取消计时保留审计记录但不计入统计', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH', { taskId: 'task-3' })
    clock.advance(750)
    const before = timer.getState()
    const duration = TimerCalculator.phaseElapsed(before, clock.now())
    const cancelled = timer.cancel()
    await sessions.recordCancellation({ timerState: before, duration, endedAt: cancelled.endTime! })
    expect(sessions.getTaskSessions('task-3')[0].status).toBe('CANCELLED')
    expect(sessions.getTaskSummary('task-3')).toEqual({ duration: 0, focusCount: 0, completedPomodoros: 0 })
  })

  it('重复同步同一计时不会生成重复记录', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH')
    clock.advance(500)
    timer.finish()
    await sessions.syncTimerRecords(timer.getRecords())
    await sessions.syncTimerRecords(timer.getRecords())
    expect(sessions.getAll()).toHaveLength(1)
  })

  it('任务删除后仍可通过原 taskId 查询历史', async () => {
    const { clock, timer, sessions } = await setup()
    timer.start('STOPWATCH', { taskId: 'deleted-task' })
    clock.advance(800)
    timer.finish()
    await sessions.syncTimerRecords(timer.getRecords())
    expect(sessions.getTaskSessions('deleted-task')[0].duration).toBe(800)
  })

  it('首页统计只基于有效记录并正确拆分跨午夜时长', async () => {
    const storage = new MemoryFocusStorage()
    const sessions = new FocusSessionService(storage)
    await sessions.initialize()
    const start = Date.UTC(2026, 10, 23, 23, 50)
    const records: FocusRecord[] = [{
      id: 'cross-midnight', sessionId: 'session-1', taskId: 'task-1', mode: 'POMODORO', round: 1,
      startedAt: start, endedAt: start + 20 * 60 * 1000, duration: 20 * 60 * 1000, completedNaturally: true, createdAt: start + 20 * 60 * 1000,
    }]
    await sessions.syncTimerRecords(records)
    const dayOne = sessions.getSummaryForRange(Date.UTC(2026, 10, 23), Date.UTC(2026, 10, 24))
    const dayTwo = sessions.getSummaryForRange(Date.UTC(2026, 10, 24), Date.UTC(2026, 10, 25))
    expect(dayOne.duration).toBe(10 * 60 * 1000)
    expect(dayTwo.duration).toBe(10 * 60 * 1000)
    expect(dayTwo.completedPomodoros).toBe(1)
  })
})
