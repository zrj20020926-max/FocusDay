import { expect, it, vi } from 'vitest'
import { observeNativeLifecycle } from './NativeLifecycle'

it('ignores a stale startup snapshot and coalesces repeated foreground and background signals', async () => {
  const change = vi.fn()
  const remove = vi.fn()
  let emit!: (event: { isActive: boolean }) => void
  const lifecycle = {
    async addListener(_event: 'appStateChange', callback: typeof emit) {
      emit = callback
      emit({ isActive: false })
      return { remove }
    },
    async getState() { return { isActive: true } },
  } as unknown as Parameters<typeof observeNativeLifecycle>[1]
  const stop = await observeNativeLifecycle(change, lifecycle)
  emit({ isActive: false })
  emit({ isActive: true })
  emit({ isActive: true })
  expect(change.mock.calls).toEqual([[false], [true]])
  stop()
  expect(remove).toHaveBeenCalledOnce()
})
