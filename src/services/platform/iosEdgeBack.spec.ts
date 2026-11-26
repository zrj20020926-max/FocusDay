import { expect, it, vi } from 'vitest'
import { observeIOSEdgeBack } from './iosEdgeBack'

function touch(target: EventTarget, type: string, clientX: number, clientY: number) {
  const contact = { identifier: 1, clientX, clientY }
  const event = Object.assign(new Event(type, { cancelable: true }), {
    touches: type === 'touchend' ? [] : [contact],
    changedTouches: [contact],
  })
  target.dispatchEvent(event)
  return event
}

it('consumes a rightward edge swipe when the app handles Back', () => {
  const target = new EventTarget()
  const back = vi.fn(() => true)
  const stop = observeIOSEdgeBack(back, target as Document)
  touch(target, 'touchstart', 12, 100)
  expect(touch(target, 'touchmove', 36, 103).defaultPrevented).toBe(true)
  expect(touch(target, 'touchend', 100, 115).defaultPrevented).toBe(true)
  expect(back).toHaveBeenCalledOnce()
  stop()
  touch(target, 'touchstart', 12, 100)
  touch(target, 'touchend', 100, 115)
  expect(back).toHaveBeenCalledOnce()
})

it('ignores vertical scrolling, row swipes, taps and canceled gestures', () => {
  const target = new EventTarget()
  const back = vi.fn(() => true)
  const stop = observeIOSEdgeBack(back, target as Document)
  touch(target, 'touchstart', 100, 100)
  touch(target, 'touchend', 200, 105)
  touch(target, 'touchstart', 12, 100)
  touch(target, 'touchmove', 15, 160)
  touch(target, 'touchend', 110, 110)
  touch(target, 'touchstart', 12, 100)
  touch(target, 'touchend', 14, 102)
  touch(target, 'touchstart', 12, 100)
  touch(target, 'touchcancel', 13, 102)
  touch(target, 'touchend', 115, 100)
  expect(back).not.toHaveBeenCalled()
  stop()
})
