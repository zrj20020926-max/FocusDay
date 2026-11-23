import { describe, expect, it } from 'vitest'
import { TimerCalculator } from './TimerCalculator'
import { TimerService } from './TimerService'
import type { Clock, TimerSnapshot, TimerStorage } from '../../types/timer'

class FakeClock implements Clock {
  constructor(public value = 1_700_000_000_000) {}
  now() { return this.value }
  advance(milliseconds: number) { this.value += milliseconds }
  set(value: number) { this.value = value }
}

class MemoryTimerStorage implements TimerStorage {
  snapshot: TimerSnapshot | null = null
  load() { return this.snapshot ? structuredClone(this.snapshot) : null }
  save(snapshot: TimerSnapshot) { this.snapshot = structuredClone(snapshot) }
}

function setup(clock = new FakeClock(), storage = new MemoryTimerStorage()) {
  const service = new TimerService(storage, clock)
  service.restore()
  service.updateConfig({
    pomodoro: { focusDuration: 1000, shortBreakDuration: 500, longBreakDuration: 1500, longBreakEvery: 4 },
    countdownDuration: 1000,
  })
  return { service, clock, storage }
}

describe('TimerService', () => {
  it('正常开始并建立时间戳', () => {
    const { service, clock } = setup()
    const state = service.start('POMODORO', { taskId: 'task-1' })
    expect(state.status).toBe('RUNNING')
    expect(state.startTime).toBe(clock.now())
    expect(state.endTime).toBe(clock.now() + 1000)
    expect(state.taskId).toBe('task-1')
  })

  it('暂停期间不累计时间', () => {
    const { service, clock } = setup()
    service.start('STOPWATCH')
    clock.advance(400)
    const paused = service.pause()
    expect(paused.status).toBe('PAUSED')
    expect(paused.accumulatedDuration).toBe(400)
    clock.advance(5000)
    expect(TimerCalculator.focusDuration(service.getState(), clock.now())).toBe(400)
  })

  it('恢复后仅累计新的运行片段', () => {
    const { service, clock } = setup()
    service.start('STOPWATCH')
    clock.advance(400)
    service.pause()
    clock.advance(5000)
    service.resume()
    clock.advance(600)
    const completed = service.finish()
    expect(completed.accumulatedDuration).toBe(1000)
    expect(service.getRecords()[0].duration).toBe(1000)
  })

  it('倒计时到期后自动且仅完成一次', () => {
    const { service, clock } = setup()
    service.start('COUNTDOWN')
    clock.advance(1000)
    expect(service.synchronize().status).toBe('COMPLETED')
    expect(service.synchronize().status).toBe('COMPLETED')
    expect(service.getRecords()).toHaveLength(1)
    expect(service.getRecords()[0].completedNaturally).toBe(true)
  })

  it('提前手动结束时记录实际有效时长', () => {
    const { service, clock } = setup()
    service.start('COUNTDOWN')
    clock.advance(350)
    expect(service.finish().status).toBe('COMPLETED')
    expect(service.getRecords()[0].duration).toBe(350)
    expect(service.getRecords()[0].completedNaturally).toBe(false)
  })

  it('放弃计时不生成专注记录', () => {
    const { service, clock } = setup()
    service.start('STOPWATCH')
    clock.advance(800)
    expect(service.cancel().status).toBe('CANCELLED')
    expect(service.getRecords()).toHaveLength(0)
  })

  it('倒计时重置后回到完整的空闲状态', () => {
    const { service, clock } = setup()
    service.start('COUNTDOWN')
    clock.advance(400)
    const state = service.reset()
    expect(state.status).toBe('IDLE')
    expect(state.targetDuration).toBe(1000)
    expect(state.accumulatedDuration).toBe(0)
    expect(service.getRecords()).toHaveLength(0)
  })

  it('页面刷新后从持久化状态恢复', () => {
    const clock = new FakeClock()
    const storage = new MemoryTimerStorage()
    const { service } = setup(clock, storage)
    service.start('COUNTDOWN')
    clock.advance(400)
    const restored = new TimerService(storage, clock)
    const state = restored.restore()
    expect(state.status).toBe('RUNNING')
    expect(TimerCalculator.remaining(state, clock.now())).toBe(600)
  })

  it('暂停状态刷新后保持暂停且时间不增长', () => {
    const clock = new FakeClock()
    const storage = new MemoryTimerStorage()
    const { service } = setup(clock, storage)
    service.start('COUNTDOWN')
    clock.advance(250)
    service.pause()
    clock.advance(5000)
    const restored = new TimerService(storage, clock)
    const state = restored.restore()
    expect(state.status).toBe('PAUSED')
    expect(TimerCalculator.remaining(state, clock.now())).toBe(750)
  })

  it('浏览器后台恢复时按时间戳补算', () => {
    const { service, clock } = setup()
    service.start('COUNTDOWN')
    clock.advance(3000)
    const state = service.synchronize()
    expect(state.status).toBe('COMPLETED')
    expect(service.getRecords()[0].duration).toBe(1000)
  })

  it('跨午夜仍使用绝对时间正确完成', () => {
    const clock = new FakeClock(Date.UTC(2026, 10, 23, 23, 59, 59, 500))
    const { service } = setup(clock)
    service.start('COUNTDOWN')
    clock.advance(1000)
    const state = service.synchronize()
    expect(new Date(state.startTime!).getUTCDate()).toBe(23)
    expect(new Date(state.endTime!).getUTCDate()).toBe(24)
    expect(state.status).toBe('COMPLETED')
  })

  it('番茄专注结束后自动进入短休息', () => {
    const { service, clock } = setup()
    service.start('POMODORO')
    clock.advance(1000)
    const state = service.synchronize()
    expect(state.currentPhase).toBe('SHORT_BREAK')
    expect(state.status).toBe('RUNNING')
    expect(state.completedPomodoros).toBe(1)
    expect(service.getRecords()).toHaveLength(1)
  })

  it('每四轮进入长休息', () => {
    const { service, clock } = setup()
    service.start('POMODORO')
    for (let round = 1; round <= 4; round += 1) {
      clock.advance(1000)
      const breakState = service.synchronize()
      if (round < 4) {
        expect(breakState.currentPhase).toBe('SHORT_BREAK')
        clock.advance(500)
        expect(service.synchronize().currentPhase).toBe('FOCUS')
      } else {
        expect(breakState.currentPhase).toBe('LONG_BREAK')
        expect(breakState.completedPomodoros).toBe(4)
      }
    }
  })

  it('防止快速重复操作和重复记录', () => {
    const { service, clock } = setup()
    service.start('STOPWATCH')
    expect(() => service.start('STOPWATCH')).toThrow(/重复/)
    clock.advance(500)
    service.pause()
    expect(() => service.pause()).toThrow(/运行中/)
    service.resume()
    clock.advance(500)
    service.finish()
    service.finish()
    expect(service.getRecords()).toHaveLength(1)
  })

  it('系统时间回拨时不会产生负数或重复时间', () => {
    const clock = new FakeClock(10_000)
    const { service } = setup(clock)
    service.start('STOPWATCH')
    clock.advance(1000)
    service.pause()
    service.resume()
    clock.set(9000)
    const state = service.finish()
    expect(state.accumulatedDuration).toBe(1000)
    expect(service.getRecords()[0].duration).toBe(1000)
  })
})
