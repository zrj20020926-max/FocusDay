import { reactive, readonly } from 'vue'

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const state = reactive({
  supported: false, offlineReady: false, online: true, installable: false,
  updateReady: false, updateDismissed: false, updating: false, checking: false, error: '',
})
export const pwa = readonly(state)

let registration: ServiceWorkerRegistration | undefined
let installPrompt: InstallPrompt | undefined
let controller: ServiceWorker | null = null
let reloadAfterActivation = false
let activationTimeout: ReturnType<typeof setTimeout> | undefined
let lastCheck = 0
let checkpoint: (() => Promise<void>) | undefined
let cleanup: (() => void) | undefined

const showUpdate = () => {
  if (!state.updateReady) state.updateDismissed = false
  state.updateReady = true
}

export function startPwa(beforeReload: () => Promise<void>) {
  if (cleanup) return cleanup
  const workers = navigator.serviceWorker
  state.supported = import.meta.env.PROD && Boolean(workers) && window.isSecureContext
  state.online = navigator.onLine
  if (!state.supported) return () => undefined
  checkpoint = beforeReload
  controller = workers.controller
  state.offlineReady = Boolean(controller)
  let active = true
  let registering = false
  const disposers: Array<() => void> = []
  const installing = (worker: ServiceWorker | null) => {
    if (!worker) return
    const changed = () => { if (worker.state === 'installed' && workers.controller) showUpdate() }
    worker.addEventListener('statechange', changed)
    disposers.push(() => worker.removeEventListener('statechange', changed))
  }
  const onController = () => {
    const next = workers.controller
    if (next && next !== controller && controller) {
      if (reloadAfterActivation) { window.location.reload(); return }
      showUpdate()
    }
    controller = next
    state.offlineReady = Boolean(next)
  }
  const onUpdate = () => installing(registration?.installing ?? null)
  const onNetwork = () => {
    state.online = navigator.onLine
    if (state.online && !registration) void register()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60 * 60_000) void checkForPwaUpdate(true)
  }
  const onInstallPrompt = (event: Event) => {
    event.preventDefault()
    installPrompt = event as InstallPrompt
    state.installable = true
  }
  const onInstalled = () => { installPrompt = undefined; state.installable = false }
  const onPreloadError = () => {
    if (registration?.waiting) showUpdate()
    else void checkForPwaUpdate(true)
  }

  workers.addEventListener('controllerchange', onController)
  window.addEventListener('online', onNetwork)
  window.addEventListener('offline', onNetwork)
  window.addEventListener('beforeinstallprompt', onInstallPrompt)
  window.addEventListener('appinstalled', onInstalled)
  window.addEventListener('vite:preloadError', onPreloadError)
  document.addEventListener('visibilitychange', onVisible)

  async function register() {
    if (!active || registration || registering) return
    registering = true
    lastCheck = Date.now()
    try {
      const base = import.meta.env.BASE_URL
      const existing = await workers.getRegistration(base)
      const result = existing ?? await workers.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
      if (!active) return
      registration = result
      state.error = ''
      state.offlineReady = Boolean(workers.controller)
      if (result.waiting && workers.controller) showUpdate()
      installing(result.installing)
      result.addEventListener('updatefound', onUpdate)
      disposers.push(() => result.removeEventListener('updatefound', onUpdate))
      if (existing && !result.waiting) void checkForPwaUpdate(true)
    } catch {
      if (active && !state.offlineReady) state.error = '离线组件暂时无法启动，可在联网后刷新页面。'
    } finally { registering = false }
  }

  const afterLoad = () => {
    // Put precaching behind the first navigation's critical resources.
    const handle = setTimeout(() => { void register() }, 100)
    disposers.push(() => clearTimeout(handle))
  }
  if (document.readyState === 'complete') afterLoad()
  else {
    window.addEventListener('load', afterLoad, { once: true })
    disposers.push(() => window.removeEventListener('load', afterLoad))
  }

  cleanup = () => {
    active = false
    clearTimeout(activationTimeout)
    workers.removeEventListener('controllerchange', onController)
    window.removeEventListener('online', onNetwork)
    window.removeEventListener('offline', onNetwork)
    window.removeEventListener('beforeinstallprompt', onInstallPrompt)
    window.removeEventListener('appinstalled', onInstalled)
    window.removeEventListener('vite:preloadError', onPreloadError)
    document.removeEventListener('visibilitychange', onVisible)
    disposers.forEach(dispose => dispose())
    registration = undefined
    reloadAfterActivation = false
    checkpoint = undefined
    cleanup = undefined
  }
  return cleanup
}

export function dismissPwaUpdate() { state.updateDismissed = true }

export async function checkForPwaUpdate(quiet = false): Promise<boolean> {
  if (!state.online || state.checking || !registration) return false
  state.checking = true
  if (!quiet) state.error = ''
  lastCheck = Date.now()
  try {
    await registration.update()
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate()
    return true
  } catch {
    if (!quiet) state.error = '暂时无法检查更新，请稍后重试。'
    return false
  } finally { state.checking = false }
}

export async function applyPwaUpdate() {
  if (!state.updateReady || state.updating || !checkpoint) return
  state.updating = true
  state.error = ''
  try {
    await checkpoint()
    const waiting = registration?.waiting
    if (!waiting) { window.location.reload(); return } // Another tab already activated the update.
    reloadAfterActivation = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
    activationTimeout = setTimeout(() => {
      state.updating = false
      reloadAfterActivation = false
      state.error = '更新尚未完成，请重试。'
    }, 15_000)
  } catch {
    reloadAfterActivation = false
    state.updating = false
    state.error = '本地数据尚未保存，已暂停更新。请重试。'
  }
}

export async function promptPwaInstall() {
  if (!installPrompt) return
  const prompt = installPrompt
  installPrompt = undefined
  state.installable = false
  try { await prompt.prompt() } catch { state.error = '无法打开安装提示，请使用浏览器菜单安装。' }
}
