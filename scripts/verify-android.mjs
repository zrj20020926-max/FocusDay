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
const syncFixture = process.argv.includes('--sqlite-sync')

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
if (!syncFixture) {
  adb('shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`)
  await usingWebView(verifyNavigation)
  adb('shell', 'am', 'force-stop', packageName)
}
openAuth()
await usingWebView(async page => {
  if (syncFixture) await verifySQLiteSync(page)
  else {
    await heading(page, '欢迎回到 Focus Day')
    console.log('Android cold auth link: OK')
  }
})

async function verifyNavigation(page) {
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
  const taskTitle = `SQLite smoke ${Date.now()}`
  const quick = page.getByPlaceholder('添加一个任务，按 Enter 保存')
  await quick.fill(taskTitle)
  await quick.press('Enter')
  await expect(page.locator('.today-page').getByText(taskTitle, { exact: true })).toBeVisible()
  await nav.getByRole('link', { name: '任务', exact: true }).click()
  await heading(page, '所有任务')
  await page.locator('.mobile-task-content').filter({ hasText: taskTitle }).click()
  const drawer = page.getByRole('dialog', { name: '任务详情' })
  await expect(drawer).toBeVisible()
  adb('shell', 'input', 'keyevent', '4')
  await expect(drawer).toBeHidden()
  await heading(page, '所有任务')
  await page.reload()
  await heading(page, '所有任务')
  await expect(page.locator('.tasks-page').getByText(taskTitle, { exact: true })).toBeVisible()
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
  await verifyHabitStorage(page)
  openAuth()
  await heading(page, '欢迎回到 Focus Day')
  console.log('Android mobile navigation, IME, native Back for sheets and focus, deep-route reload, warm auth link and no PWA worker: OK')
}

async function verifyHabitStorage(page) {
  const name = 'SQLite habit ' + Date.now()
  const edited = name + ' edited'
  await page.goto('https://localhost/habits')
  await page.getByRole('button', { name: '新建习惯' }).click()
  const form = page.locator('.habit-form')
  await form.getByRole('textbox', { name: '习惯名称' }).fill(name)
  await form.getByRole('button', { name: '保存习惯' }).click()
  await expect(form).toBeHidden()
  await page.getByRole('button', { name: '打卡 ' + name, exact: true }).click()
  await expect(page.getByRole('button', { name: '取消打卡 ' + name })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '查看' + name + '详情' }).click()
  const drawer = page.locator('.habit-drawer')
  await drawer.getByRole('button', { name: '编辑', exact: true }).click()
  await form.getByRole('textbox', { name: '习惯名称' }).fill(edited)
  await form.getByRole('button', { name: '保存习惯' }).click()
  await expect(form).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: '取消打卡 ' + edited })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '查看' + edited + '详情' }).click()
  await drawer.getByRole('button', { name: '删除习惯' }).click()
  await drawer.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('button', { name: '查看' + edited + '详情' })).toHaveCount(0)
  console.log('Android SQLite habit creation, check-in, edit, reload and deletion: OK')
}

async function verifySQLiteSync(page) {
  const fixture = 'http://127.0.0.1:4178'
  let cloudAvailable = true
  await page.context().route(/^https:\/\/focusday-fixture\.test\/(auth|rest)\/v1\//, async route => {
    if (!cloudAvailable) { await route.abort('internetdisconnected'); return }
    const request = route.request()
    const url = new URL(request.url())
    const reply = await fetch(fixture + url.pathname + url.search, {
      method: request.method(), headers: request.headers(), body: request.postData() ?? undefined,
    })
    await route.fulfill({ status: reply.status, headers: Object.fromEntries(reply.headers), body: await reply.text() })
  })
  const listCloudTasks = async () => (await fetch(fixture + '/__test/cloud-tasks')).json()
  const nav = page.getByRole('navigation', { name: '移动端主导航' })
  const auth = page.locator('.auth-card')
  const openAccount = async () => {
    await nav.getByRole('link', { name: '我的' }).click()
    await page.getByRole('link', { name: '账号与云端' }).click()
  }
  const signIn = async email => {
    await auth.getByPlaceholder('you@example.com').fill(email)
    await auth.getByPlaceholder('至少 8 个字符').fill('local-fixture-password')
    await auth.locator('form').getByRole('button', { name: '登录', exact: true }).click()
    await expect(auth.getByText(email, { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => page.evaluate(() => localStorage.getItem('focus-day.auth'))).toBeNull()
  }
  const signOut = async () => {
    await openAccount()
    await auth.getByRole('button', { name: '退出登录' }).click()
    await expect(auth.getByPlaceholder('you@example.com')).toBeVisible()
  }
  const tasks = page.locator('.tasks-page')
  const openTasks = () => nav.getByRole('link', { name: '任务', exact: true }).click()
  const quickTask = async title => {
    await nav.getByRole('link', { name: '今日', exact: true }).click()
    const field = page.getByPlaceholder('添加一个任务，按 Enter 保存')
    await field.fill(title)
    await field.press('Enter')
    await expect(page.locator('.today-page').getByText(title, { exact: true })).toBeVisible()
  }
  const title = 'account A offline ' + Date.now()
  const edited = title + ' edited'
  const remoteTitle = title + ' remote edit'
  const retained = title + ' retained'
  const accountA = 'native-a@example.test'
  const accountB = 'native-b@example.test'
  await expect(auth).toBeVisible()
  const exit = auth.getByRole('button', { name: '退出登录' })
  if (await exit.isVisible()) {
    await exit.click()
    await expect(auth.getByPlaceholder('you@example.com')).toBeVisible()
  }
  await signIn(accountA)
  await page.reload()
  await expect(auth.getByText(accountA, { exact: true })).toBeVisible()
  await page.context().setOffline(true)
  try {
    await page.waitForFunction(() => !navigator.onLine)
    await quickTask(title)
    await openTasks()
    await tasks.getByText(title, { exact: true }).click()
    await page.getByTitle('编辑任务').click()
    await page.getByRole('textbox', { name: '任务名称' }).fill(edited)
    await page.getByRole('button', { name: '保存修改' }).click()
    await expect(tasks.getByText(edited, { exact: true })).toBeVisible()
    await page.getByTitle('关闭', { exact: true }).click()
    if ((await listCloudTasks()).some(task => task.title === edited)) throw new Error('Offline write unexpectedly reached the fixture.')
  } finally { await page.context().setOffline(false) }
  await expect.poll(async () => (await listCloudTasks()).filter(task => task.title === edited).length, { timeout: 20_000 }).toBe(1)
  const row = (await listCloudTasks()).find(task => task.title === edited)
  const remoteEdit = await fetch(fixture + '/__test/cloud-edit', { method: 'POST', body: JSON.stringify({ id: row.id, title: remoteTitle }) })
  if (!remoteEdit.ok) throw new Error('Fixture remote edit failed.')
  await nav.getByRole('link', { name: '我的' }).click()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '手动同步' }).click()
  await openTasks()
  await expect(tasks.getByText(remoteTitle, { exact: true })).toBeVisible({ timeout: 15_000 })
  await tasks.getByText(remoteTitle, { exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '再次点击确认删除' }).click()
  await expect.poll(async () => !!(await listCloudTasks()).find(task => task.id === row.id)?.deleted_at, { timeout: 20_000 }).toBe(true)
  await quickTask(retained)
  await signOut()
  await signIn(accountB)
  await openTasks()
  await expect(tasks.getByText(retained, { exact: true })).toHaveCount(0)
  await quickTask(title + ' B')
  await signOut()
  await signIn(accountA)
  await openTasks()
  await expect(tasks.getByText(retained, { exact: true })).toBeVisible()
  await expect(tasks.getByText(title + ' B', { exact: true })).toHaveCount(0)
  cloudAvailable = false
  try {
    await nav.getByRole('link', { name: '专注', exact: true }).click()
    const focus = page.locator('.focus-page')
    await expect(focus).toBeVisible()
    const cancel = focus.getByRole('button', { name: '放弃本次计时' })
    if (await cancel.isVisible()) await cancel.click()
    const start = focus.getByRole('button', { name: '开始专注', exact: true })
    await expect(start).toBeVisible()
    await focus.getByRole('button', { name: '正计时', exact: true }).click()
    await start.click()
    await expect(focus.locator('.focus-time strong')).toHaveText(/00:0[1-9]/)
    await focus.getByRole('button', { name: '暂停一下' }).click()
    const resume = focus.getByRole('button', { name: '继续专注' })
    await expect(resume).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL('https://localhost/focus')
    await resume.click()
    await focus.getByTitle('结束并记录').click()
    await expect(page.getByRole('heading', { name: '完成了一段专注' })).toBeVisible()
    await page.goto('https://localhost/stats')
    await expect(page.getByRole('heading', { name: /已连续专注/ })).toBeVisible()
  } finally { cloudAvailable = true }
  await signOut()
  console.log('Android SQLite authenticated storage, offline edit/reconnect, remote pull, soft delete, timer recovery and A/B isolation: OK')
}
