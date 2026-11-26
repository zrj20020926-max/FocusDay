const EDGE_WIDTH = 24

export function isIOSEdgeBackStart(x: number) {
  return x >= 0 && x <= EDGE_WIDTH
}

export function observeIOSEdgeBack(back: () => boolean, target: Document = document) {
  let start: Touch | undefined
  const clear = () => { start = undefined }
  const begin = (event: TouchEvent) => {
    const touch = event.touches[0]
    start = event.touches.length === 1 && isIOSEdgeBackStart(touch.clientX) ? touch : undefined
  }
  const move = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!start || !touch) return
    const dx = touch.clientX - start.clientX
    const dy = Math.abs(touch.clientY - start.clientY)
    if (dy > 40) clear()
    else if (dx > 12 && dx > dy * 1.5 && event.cancelable) event.preventDefault()
  }
  const end = (event: TouchEvent) => {
    const origin = start
    clear()
    if (!origin) return
    const touch = Array.from(event.changedTouches).find(item => item.identifier === origin.identifier)
    if (touch && touch.clientX - origin.clientX >= 72 && Math.abs(touch.clientY - origin.clientY) <= 40 && back()) {
      event.preventDefault()
    }
  }
  target.addEventListener('touchstart', begin, { passive: true, capture: true })
  target.addEventListener('touchmove', move, { passive: false, capture: true })
  target.addEventListener('touchend', end, { passive: false, capture: true })
  target.addEventListener('touchcancel', clear, { capture: true })
  return () => {
    target.removeEventListener('touchstart', begin, { capture: true })
    target.removeEventListener('touchmove', move, { capture: true })
    target.removeEventListener('touchend', end, { capture: true })
    target.removeEventListener('touchcancel', clear, { capture: true })
  }
}
