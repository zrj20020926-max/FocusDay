import { describe, expect, it, vi } from 'vitest'
import { FullscreenError, FullscreenService, type FullscreenDocument } from './FullscreenService'

function fakeDocument(update: Partial<FullscreenDocument> = {}) {
  const listeners = new Set<EventListener>()
  const value: FullscreenDocument = {
    fullscreenEnabled: true, fullscreenElement: null,
    exitFullscreen: vi.fn(async () => { value.fullscreenElement = null }),
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    ...update,
  }
  return { value, listeners }
}

describe('FullscreenService', () => {
  it('进入、退出并监听原生全屏状态', async () => {
    const { value, listeners } = fakeDocument()
    const element = { requestFullscreen: vi.fn(async () => { value.fullscreenElement = element as unknown as Element }) } as unknown as Element
    const service = new FullscreenService(value)
    const listener = vi.fn(); const unsubscribe = service.subscribe(listener)
    await service.enter(element); expect(service.active).toBe(true)
    listeners.forEach(item => item(new Event('fullscreenchange'))); expect(listener).toHaveBeenCalledOnce()
    await service.exit(); expect(service.active).toBe(false)
    unsubscribe(); expect(value.removeEventListener).toHaveBeenCalledOnce()
  })

  it('浏览器不支持或拒绝全屏时返回明确错误', async () => {
    const unsupported = new FullscreenService(fakeDocument({ fullscreenEnabled: false }).value)
    await expect(unsupported.enter({} as Element)).rejects.toMatchObject({ code: 'UNSUPPORTED' })
    const rejected = new FullscreenService(fakeDocument().value)
    const element = { requestFullscreen: vi.fn(async () => { throw new Error('denied') }) } as unknown as Element
    await expect(rejected.enter(element)).rejects.toEqual(new FullscreenError('浏览器拒绝进入全屏，请检查权限后重试', 'REJECTED'))
  })
})
