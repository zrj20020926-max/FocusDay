import { describe, expect, it, vi } from 'vitest'
import type { BrowserNotificationPermission, NotificationEvent, NotificationPreferences } from '../../types/notification'
import type { TimerSnapshot } from '../../types/timer'
import { TimerService } from '../timer/TimerService'
import { NotificationService, TIMER_NOTIFICATION_MAX_DELAY } from './NotificationService'

const now = 1_800_000_000_000
const event: NotificationEvent = { id: 'task:test', kind: 'TASK_DUE', occurredAt: now, title: '任务提醒', body: '交付报告' }

function setup(initial: Partial<NotificationPreferences> = {}, permission: BrowserNotificationPermission = 'default', clock = () => now) {
  let stored = initial
  const receipts = new Set<string>()
  const out = {
    claim: vi.fn(async (id: string) => {
      if (receipts.has(id)) return false
      receipts.add(id)
      return true
    }),
    toast: vi.fn(),
    permission: () => permission,
    requestPermission: vi.fn(async (): Promise<BrowserNotificationPermission> => 'denied'),
    system: vi.fn(async () => undefined),
    sound: vi.fn(async () => undefined),
  }
  const write = vi.fn(async (value: NotificationPreferences) => { stored = value })
  const service = new NotificationService({ read: async () => stored, write }, out, clock)
  return { service, out, write, getStored: () => stored, setPermission: (value: BrowserNotificationPermission) => { permission = value } }
}

describe('NotificationService', () => {
  it('同一事件并发到达只提醒一次，且权限状态按实际投递时检查', async () => {
    const { service, out, setPermission } = setup({ system: true, sound: true }, 'granted')
    expect(await Promise.all([service.publish(event), service.publish(event)])).toEqual([true, false])
    expect(out.toast).toHaveBeenCalledTimes(1)
    expect(out.system).toHaveBeenCalledTimes(1)
    expect(out.sound).toHaveBeenCalledTimes(1)
    setPermission('denied')
    await service.publish({ ...event, id: 'task:other' })
    expect(out.toast).toHaveBeenCalledTimes(2)
    expect(out.system).toHaveBeenCalledTimes(1)
    expect(out.requestPermission).not.toHaveBeenCalled()
  })

  it('主动请求权限被拒绝时不保存启用设置，继续使用应用内提醒', async () => {
    const { service, out, write } = setup()
    await service.preferences()
    expect(out.requestPermission).not.toHaveBeenCalled()
    expect(await service.enableSystem()).toBe('denied')
    expect(out.requestPermission).toHaveBeenCalledOnce()
    expect(write).not.toHaveBeenCalled()
    await service.publish(event)
    expect(out.toast).toHaveBeenCalledOnce()
    expect(out.system).not.toHaveBeenCalled()
  })

  it('不支持系统通知时不请求权限，系统投递失败也不阻止提示音或 Toast', async () => {
    const { service, out, setPermission } = setup({ sound: true }, 'unsupported')
    expect(await service.enableSystem()).toBe('unsupported')
    expect(out.requestPermission).not.toHaveBeenCalled()
    setPermission('granted')
    expect(await service.enableSystem()).toBe('granted')
    out.system.mockRejectedValueOnce(new TypeError('unavailable'))
    expect(await service.publish(event)).toBe(true)
    expect(out.toast).toHaveBeenCalledOnce()
    expect(out.sound).toHaveBeenCalledOnce()
  })

  it('保存并合并设置修改，关闭分类或全局通知可立即抑制提醒', async () => {
    const { service, out, getStored } = setup()
    await Promise.all([service.updatePreferences({ tasks: false }), service.updatePreferences({ sound: true })])
    expect(getStored()).toMatchObject({ tasks: false, sound: true })
    expect(await service.publish(event)).toBe(false)
    await service.updatePreferences({ enabled: false, tasks: true })
    expect(await service.publish(event)).toBe(false)
    expect(out.claim).not.toHaveBeenCalled()
    await service.updatePreferences({ enabled: true })
    expect(await service.publish(event)).toBe(true)
  })

  it('由真实计时状态产生专注、短休息、长休息和倒计时结束事件', async () => {
    let timestamp = now
    let snapshot: TimerSnapshot | null = null
    const timer = new TimerService({ load: () => snapshot, save: value => { snapshot = value } }, { now: () => timestamp })
    const { service, out } = setup({}, 'default', () => timestamp)
    timer.updateConfig({ countdownDuration: 100, pomodoro: { focusDuration: 100, shortBreakDuration: 50, longBreakDuration: 80, longBreakEvery: 2 } })
    timer.start('POMODORO')

    for (const elapsed of [100, 50, 100, 80]) {
      timestamp += elapsed
      timer.synchronize()
      expect(await service.timerCompleted(timer.takeCompletedPhases())).toBe(true)
    }
    timer.cancel()
    expect(await service.timerCompleted(timer.takeCompletedPhases())).toBe(false)
    timer.start('COUNTDOWN')
    timestamp += 100
    expect(timer.synchronize().status).toBe('COMPLETED')
    expect(await service.timerCompleted(timer.takeCompletedPhases())).toBe(true)
    expect(out.toast.mock.calls.map(([notice]) => notice.kind)).toEqual([
      'POMODORO_COMPLETE', 'SHORT_BREAK_COMPLETE', 'POMODORO_COMPLETE', 'LONG_BREAK_COMPLETE', 'COUNTDOWN_COMPLETE',
    ])
  })

  it('取消、手动结束或暂停期间不生成自动完成通知', async () => {
    let timestamp = now
    const timer = new TimerService({ load: () => null, save: () => undefined }, { now: () => timestamp })
    const { service, out } = setup({}, 'default', () => timestamp)
    timer.start('COUNTDOWN', { countdownDuration: 1000 })
    timestamp += 200
    timer.pause()
    timestamp += 10_000
    timer.synchronize()
    expect(await service.timerCompleted(timer.takeCompletedPhases())).toBe(false)
    timer.cancel()
    expect(await service.timerCompleted(timer.takeCompletedPhases())).toBe(false)
    timer.start('COUNTDOWN')
    timer.finish()
    expect(await service.timerCompleted(timer.takeCompletedPhases())).toBe(false)
    expect(out.toast).not.toHaveBeenCalled()
  })

  it('恢复时只提醒最新阶段，过旧或禁用的休息提示会跳过', async () => {
    const { service, out } = setup()
    const phases = [
      { sessionId: 'one', phaseSequence: 0, mode: 'POMODORO', phase: 'FOCUS', completedAt: now - 15_000 },
      { sessionId: 'one', phaseSequence: 1, mode: 'POMODORO', phase: 'SHORT_BREAK', completedAt: now - 2_000 },
    ] as const
    expect(await service.timerCompleted(phases)).toBe(true)
    expect(out.toast.mock.calls[0][0].kind).toBe('SHORT_BREAK_COMPLETE')
    await service.updatePreferences({ breaks: false })
    expect(await service.timerCompleted([{ ...phases[1], phaseSequence: 3 }])).toBe(false)
    expect(await service.timerCompleted([{ ...phases[0], completedAt: now - TIMER_NOTIFICATION_MAX_DELAY - 1 }])).toBe(false)
  })

  it('从尚未结束的快照恢复倒计时后只确认一次自然结束', async () => {
    let snapshot: TimerSnapshot | null = null
    let timestamp = now
    const storage = { load: () => snapshot, save: (value: TimerSnapshot) => { snapshot = value } }
    const clock = { now: () => timestamp }
    new TimerService(storage, clock).start('COUNTDOWN', { countdownDuration: 1_000 })
    timestamp += 5_000
    const resumed = new TimerService(storage, clock)
    expect(resumed.restore().status).toBe('COMPLETED')
    const { service, out } = setup({}, 'default', clock.now)
    expect(await service.timerCompleted(resumed.takeCompletedPhases())).toBe(true)
    const reopened = new TimerService(storage, clock)
    expect(reopened.restore().status).toBe('COMPLETED')
    expect(await service.timerCompleted(reopened.takeCompletedPhases())).toBe(false)
    expect(out.toast).toHaveBeenCalledOnce()
  })
})
