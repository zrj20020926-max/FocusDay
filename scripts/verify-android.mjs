// Smoke test for an already installed Debug APK on a disposable Android emulator.
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'

const serial = process.env.ANDROID_SERIAL
if (!serial || !/^emulator-\d+$/.test(serial)) throw new Error('Set ANDROID_SERIAL to a disposable emulator (e.g. emulator-5554).')
const adb = (...args) => execFileSync(process.env.ADB_PATH || 'adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim()
const packageName = 'com.focusday.app'
const authErrorLink = 'com.focusday.app://auth/account?error=access_denied'
const openAuth = () => adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', authErrorLink)
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 15_000 })

async function usingWebView(check) {
  let pid
  for (let attempt = 0; attempt < 60; attempt++) {
    try { pid = adb('shell', 'pidof', packageName).split(/\s+/)[0] } catch { /* Still starting. */ }
    if (pid) break
    await delay(250)
  }
  if (!pid) throw new Error('Android app process did not start.')
  const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`)
  let browser
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) }).catch(() => null)
      if (version?.ok) break
      await delay(250)
    }
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 12_000, noDefaults: true })
    const context = browser.contexts()[0]
    const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 12_000 })
    await check(page)
  } finally {
    await browser?.close()
    adb('forward', '--remove', `tcp:${port}`)
  }
}

adb('shell', 'wm', 'dismiss-keyguard')
adb('shell', 'am', 'force-stop', packageName)
adb('shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`)
await usingWebView(async page => {
  await page.getByPlaceholder('添加一个任务，按 Enter 保存').waitFor({ timeout: 15_000 })
  await page.getByRole('link', { name: '任务', exact: true }).click()
  await heading(page, '所有任务')
  await page.reload()
  await heading(page, '所有任务')
  if (new URL(page.url()).pathname !== '/tasks') throw new Error('Deep route did not survive reload.')
  if (await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)) {
    throw new Error('A PWA worker is registered in the Android WebView.')
  }
  adb('shell', 'input', 'keyevent', '4')
  await page.getByPlaceholder('添加一个任务，按 Enter 保存').waitFor({ timeout: 15_000 })
  openAuth()
  await heading(page, '欢迎回到 Focus Day')
  console.log('Android home, deep-route reload, native Back, warm auth link and no PWA worker: OK')
})

adb('shell', 'am', 'force-stop', packageName)
openAuth()
await usingWebView(async page => {
  await heading(page, '欢迎回到 Focus Day')
  console.log('Android cold auth link: OK')
})
