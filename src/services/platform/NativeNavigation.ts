import type { Router } from 'vue-router'
import { parseNativeAuthUrl } from './nativeAuth'

interface NativeNavigationOptions {
  router: Router
  dismissOverlay(): boolean
  exchangeAuthCode(code: string, recoverPassword: boolean): Promise<boolean>
  authFailed(): void
}

const LAUNCH_HANDLED_KEY = 'focus-day.native-launch-handled'

export async function startNativeNavigation({ router, dismissOverlay, exchangeAuthCode, authFailed }: NativeNavigationOptions) {
  const { App } = await import('@capacitor/app')
  const handled = new Set<string>()
  let active = true

  async function openUrl(url: string) {
    const callback = parseNativeAuthUrl(url)
    if (!active || !callback) return
    if ('failed' in callback) {
      authFailed()
      await router.replace({ name: 'account' })
      return
    }
    if (handled.has(callback.code)) return
    handled.add(callback.code)
    if (handled.size > 8) handled.delete(handled.values().next().value!)
    const exchanged = await exchangeAuthCode(callback.code, callback.recoverPassword)
    if (!active) return
    if (!exchanged) authFailed()
    await router.replace({
      name: 'account',
      query: exchanged && callback.recoverPassword ? { mode: 'update-password' } : {},
    })
  }

  const urlListener = await App.addListener('appUrlOpen', ({ url }) => { void openUrl(url).catch(authFailed) })
  try {
    const backListener = await App.addListener('backButton', ({ canGoBack }) => {
      if (dismissOverlay()) return
      if (canGoBack && window.history.state?.back) router.back()
      else if (router.currentRoute.value.name !== 'today') void router.replace({ name: 'today' })
      else void App.minimizeApp()
    })
    void App.getLaunchUrl().then(launch => {
      // The activity retains its launch intent when only the WebView reloads.
      if (!active || sessionStorage.getItem(LAUNCH_HANDLED_KEY)) return
      sessionStorage.setItem(LAUNCH_HANDLED_KEY, '1')
      if (launch) return openUrl(launch.url)
    }).catch(authFailed)
    return () => {
      active = false
      void urlListener.remove()
      void backListener.remove()
    }
  } catch (error) {
    active = false
    await urlListener.remove()
    throw error
  }
}
