import type { AppPlugin } from '@capacitor/app'

type Lifecycle = Pick<AppPlugin, 'addListener' | 'getState'>

export async function observeNativeLifecycle(change: (foreground: boolean) => void, injected?: Lifecycle) {
  const app = injected ?? (await import('@capacitor/app')).App
  let latest: boolean | undefined
  const update = (active: boolean) => {
    if (active === latest) return
    latest = active
    change(active)
  }
  const listener = await app.addListener('appStateChange', event => update(event.isActive))
  try {
    const state = await app.getState()
    if (latest === undefined) update(state.isActive)
    return () => { void listener.remove() }
  } catch (error) {
    await listener.remove()
    throw error
  }
}
