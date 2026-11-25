// Smoke test for an already installed Debug APK on a disposable Android emulator.
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, expect } from '@playwright/test'

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
  const nav = page.getByRole('navigation', { name: '移动端主导航' })
  await expect(nav.getByRole('link')).toHaveText(['今日', '任务', '专注', '统计', '我的'])
  await page.getByRole('button', { name: '新建任务' }).click()
  const create = page.getByRole('dialog', { name: '新建任务' })
  await expect(create).toBeVisible()
  const titleBox = await create.getByRole('textbox', { name: '任务名称' }).boundingBox()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: titleBox.x + 16, y: titleBox.y + titleBox.height / 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-open')
  await expect(create.getByRole('button', { name: '创建任务' })).toBeInViewport()
  adb('shell', 'input', 'keyevent', '4')
  await expect(page.locator('html')).not.toHaveAttribute('data-keyboard-open')
  await expect(create).toBeVisible()
  adb('shell', 'input', 'keyevent', '4')
  await expect(create).toBeHidden()
  await nav.getByRole('link', { name: '任务', exact: true }).click()
  await heading(page, '所有任务')
  await page.locator('.mobile-task-content').first().click()
  const drawer = page.getByRole('dialog', { name: '任务详情' })
  await expect(drawer).toBeVisible()
  adb('shell', 'input', 'keyevent', '4')
  await expect(drawer).toBeHidden()
  await heading(page, '所有任务')
  await page.reload()
  await heading(page, '所有任务')
  if (new URL(page.url()).pathname !== '/tasks') throw new Error('Deep route did not survive reload.')
  if (await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)) {
    throw new Error('A PWA worker is registered in the Android WebView.')
  }
  adb('shell', 'input', 'keyevent', '4')
  await page.getByPlaceholder('添加一个任务，按 Enter 保存').waitFor({ timeout: 15_000 })
  await nav.getByRole('link', { name: '专注', exact: true }).click()
  await page.locator('.focus-page').getByRole('button', { name: '开始专注', exact: true }).click()
  const pause = page.getByRole('button', { name: '暂停一下' })
  await expect(pause).toBeVisible()
  await page.getByTitle('全屏专注').click()
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible()
  adb('shell', 'input', 'keyevent', '4')
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeHidden()
  await expect(nav).toBeVisible()
  await expect(pause).toBeVisible()
  await page.getByRole('button', { name: '放弃本次计时' }).click()
  openAuth()
  await heading(page, '欢迎回到 Focus Day')
  console.log('Android mobile navigation, IME, native Back for sheets and focus, deep-route reload, warm auth link and no PWA worker: OK')
})

adb('shell', 'am', 'force-stop', packageName)
openAuth()
await usingWebView(async page => {
  await heading(page, '欢迎回到 Focus Day')
  console.log('Android cold auth link: OK')
})
