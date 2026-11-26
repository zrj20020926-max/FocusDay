import { readonly, ref } from 'vue'

const query = '(max-width: 850px), (max-width: 1100px) and (pointer: coarse)'
const mobile = ref(typeof matchMedia !== 'undefined' && matchMedia(query).matches)
export const isMobileLayout = readonly(mobile)

export function observeMobileLayout() {
  const media = matchMedia(query)
  const viewport = window.visualViewport
  const root = document.documentElement
  const ios = root.hasAttribute('data-native-ios')
  const heights = new Map<string, number>()
  let frame = 0
  let scrollFrame = 0
  const update = () => {
    mobile.value = media.matches
    root.toggleAttribute('data-mobile-layout', mobile.value)
    const height = viewport?.height ?? innerHeight
    const width = window.innerWidth
    const bucket = String(Math.round(width / 40))
    const baseline = Math.max(heights.get(bucket) ?? height, height)
    heights.set(bucket, baseline)
    const element = document.activeElement
    const editable = element instanceof HTMLElement && element.matches(
      'textarea, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="color"], [type="range"], [type="file"])',
    )
    const keyboard = mobile.value && editable && Math.max(innerHeight - height, baseline - height) > 120
    root.toggleAttribute('data-keyboard-open', keyboard)
    root.style.setProperty('--fd-mobile-height', `${Math.round(height)}px`)
    const top = ios && keyboard ? viewport?.offsetTop ?? 0 : 0
    if (ios) root.style.setProperty('--fd-ios-viewport-top', `${Math.round(top)}px`)
    if (keyboard && element instanceof HTMLElement) {
      cancelAnimationFrame(scrollFrame)
      scrollFrame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect()
        if (rect.top < top || rect.bottom > top + height - 66) element.scrollIntoView({ block: 'center', behavior: 'instant' })
      })
    }
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
  media.addEventListener('change', schedule)
  window.addEventListener('resize', schedule)
  viewport?.addEventListener('resize', schedule)
  if (ios) viewport?.addEventListener('scroll', schedule)
  document.addEventListener('focusin', schedule)
  document.addEventListener('focusout', schedule)
  update()
  return () => {
    media.removeEventListener('change', schedule)
    window.removeEventListener('resize', schedule)
    viewport?.removeEventListener('resize', schedule)
    if (ios) viewport?.removeEventListener('scroll', schedule)
    document.removeEventListener('focusin', schedule)
    document.removeEventListener('focusout', schedule)
    cancelAnimationFrame(frame)
    cancelAnimationFrame(scrollFrame)
    root.removeAttribute('data-mobile-layout')
    root.removeAttribute('data-keyboard-open')
    root.style.removeProperty('--fd-mobile-height')
    if (ios) root.style.removeProperty('--fd-ios-viewport-top')
  }
}
