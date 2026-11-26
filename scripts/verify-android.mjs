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
const backgroundTimer = process.argv.includes('--background-timer')

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
if (backgroundTimer) {
  await verifyBackgroundTimer()
  process.exit(0)
}
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

async function verifyBackgroundTimer() {
  const permission = 'android.permission.POST_NOTIFICATIONS'
  const launch = () => adb('shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`)
  const openSettings = page => page.goto('https://localhost/settings')
  const openFocus = page => page.goto('https://localhost/focus')
  const focus = page => page.locator('.focus-page')
  const begin = page => focus(page).getByRole('button', { name: '开始专注', exact: true }).click()
  const pending = page => page.evaluate(async () => {
    const result = await window.Capacitor.Plugins.LocalNotifications.getPending()
    return result.notifications.filter(item => item.extra?.destination === '/focus').map(({ id }) => id)
  })
  const useCountdown = async (page, minutes = 1) => {
    await openFocus(page)
    const cancel = focus(page).getByRole('button', { name: '放弃本次计时' })
    await expect(focus(page)).toHaveAttribute('aria-busy', 'false')
    if (await cancel.isVisible()) await cancel.click()
    await expect(focus(page).getByRole('button', { name: '开始专注', exact: true })).toBeVisible()
    await focus(page).getByRole('button', { name: '倒计时', exact: true }).click()
    const duration = focus(page).locator('.countdown-duration input')
    await duration.fill(String(minutes))
    await duration.blur()
    await expect(focus(page).locator('.focus-time strong')).toHaveText(`0${minutes}:00`)
  }
  adb('shell', 'pm', 'revoke', packageName, permission)
  adb('shell', 'pm', 'set-permission-flags', packageName, permission, 'user-set', 'user-fixed')
  launch()
  await usingWebView(async page => {
    await openSettings(page)
    const button = page.getByRole('button', { name: '切换系统通知' })
    await expect(button).toBeVisible()
    await expect(page.getByRole('switch', { name: '启用通知' })).toBeEnabled()
    if (await button.isEnabled()) await button.click()
    await expect(page.getByText(/权限已拒绝/)).toBeVisible()
    await useCountdown(page)
    await begin(page)
    await expect(focus(page).getByRole('button', { name: '暂停一下' })).toBeVisible()
    expect(await pending(page)).toEqual([])
    await focus(page).getByRole('button', { name: '放弃本次计时' }).click()
    await expect(focus(page).getByRole('button', { name: '开始专注', exact: true })).toBeVisible()
  })
  console.log('Android notification denial and local timer fallback: OK')

  adb('shell', 'pm', 'clear-permission-flags', packageName, permission, 'user-fixed')
  adb('shell', 'pm', 'grant', packageName, permission)
  adb('shell', 'cmd', 'appops', 'set', packageName, 'SCHEDULE_EXACT_ALARM', 'allow')
  launch()
  try {
    await usingWebView(async page => {
      await openSettings(page)
      const button = page.getByRole('button', { name: '切换系统通知' })
      await expect(button).toBeEnabled()
      if ((await button.innerText()).trim() === '开启') await button.click()
      await expect(page.getByText('已允许。锁屏和省电时仍可能延迟。')).toBeVisible()
      await useCountdown(page)
      await begin(page)
      await expect.poll(() => pending(page)).toHaveLength(1)
      const [id] = await pending(page)
      await focus(page).getByRole('button', { name: '暂停一下' }).click()
      await expect.poll(() => pending(page)).toEqual([])
      await focus(page).getByRole('button', { name: '继续专注' }).click()
      await expect.poll(() => pending(page)).toEqual([id])
      adb('shell', 'dumpsys', 'battery', 'unplug')
      adb('shell', 'cmd', 'power', 'set-mode', '1')
      await expect.poll(() => adb('shell', 'settings', 'get', 'global', 'low_power')).toBe('1')
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
      adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
      await expect.poll(() => adb('shell', 'cmd', 'notification', 'list'), { timeout: 80_000, intervals: [2000] })
        .toContain(`|${packageName}|${id}|`)
      adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
      adb('shell', 'wm', 'dismiss-keyguard')
      launch()
      await expect(focus(page).getByRole('button', { name: '开始专注', exact: true })).toBeVisible()
      expect(await pending(page)).toEqual([])
    })
    console.log('Android native alarm delivered while backgrounded and locked in battery saver; pause/resume reused one alarm: OK')
  } finally {
    adb('shell', 'cmd', 'power', 'set-mode', '0')
    adb('shell', 'dumpsys', 'battery', 'reset')
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    adb('shell', 'wm', 'dismiss-keyguard')
  }

  await usingWebView(async page => {
    await useCountdown(page)
    await begin(page)
    await expect.poll(() => pending(page)).toHaveLength(1)
    await focus(page).getByRole('button', { name: '暂停一下' }).click()
    await expect(focus(page).getByRole('button', { name: '继续专注' })).toBeVisible()
    await expect.poll(() => pending(page)).toEqual([])
  })
  adb('shell', 'am', 'force-stop', packageName)
  launch()
  await usingWebView(async page => {
    await openFocus(page)
    await expect(focus(page).getByRole('button', { name: '继续专注' })).toBeVisible()
    const pausedTime = await focus(page).locator('.focus-time strong').textContent()
    await focus(page).getByRole('button', { name: '继续专注' }).click()
    await expect.poll(() => pending(page)).toHaveLength(1)
    await focus(page).getByRole('button', { name: '放弃本次计时' }).click()
    await expect.poll(() => pending(page)).toEqual([])
    if (!pausedTime) throw new Error('Paused countdown did not restore its display.')
  })
  console.log('Android force-stop, durable paused recovery and cancel cleanup: OK')

  await usingWebView(async page => {
    await useCountdown(page, 2)
    await begin(page)
    await expect.poll(() => pending(page)).toHaveLength(1)
  })
  adb('reboot')
  await expect.poll(() => {
    try { return adb('shell', 'getprop', 'sys.boot_completed') } catch { return '' }
  }, { timeout: 75_000, intervals: [2000] }).toBe('1')
  adb('shell', 'wm', 'dismiss-keyguard')
  await expect.poll(() => adb('shell', 'dumpsys', 'alarm')
    .split('\n').some(line => line.includes(packageName) && line.includes('TimedNotificationPublisher')), { timeout: 20_000 }).toBe(true)
  launch()
  await usingWebView(async page => {
    await openFocus(page)
    await expect(focus(page).getByRole('button', { name: '暂停一下' })).toBeVisible()
    await expect.poll(() => pending(page)).toHaveLength(1)
    await focus(page).getByRole('button', { name: '放弃本次计时' }).click()
    await expect.poll(() => pending(page)).toEqual([])
  })
  console.log('Android reboot, OS rearmed the future alarm and SQLite restored the running countdown: OK')

  adb('shell', 'cmd', 'appops', 'set', packageName, 'SCHEDULE_EXACT_ALARM', 'deny')
  launch()
  let before
  const completedCount = page => page.evaluate(async () => {
    const result = await window.Capacitor.Plugins.CapacitorSQLite.query({
      database: 'focus_day_guest', statement: "SELECT count(*) AS total FROM focusSessions WHERE status = 'COMPLETED'",
      values: [], readonly: false,
    })
    return result.values[0].total
  })
  await usingWebView(async page => {
    await openSettings(page)
    await expect(page.getByText(/未允许。后台通知/)).toBeVisible()
    await useCountdown(page, 2)
    before = await completedCount(page)
    await begin(page)
    await expect.poll(() => pending(page)).toHaveLength(1)
  })
  adb('shell', 'am', 'force-stop', packageName)
  const autoTime = adb('shell', 'settings', 'get', 'global', 'auto_time')
  try {
    adb('shell', 'settings', 'put', 'global', 'auto_time', '0')
    adb('shell', 'cmd', 'alarm', 'set-time', String(Date.now() + 180_000))
    launch()
    await usingWebView(async page => {
      await openFocus(page)
      await expect(focus(page).locator('.focus-time strong')).toHaveText('00:00')
      await expect.poll(() => completedCount(page)).toBe(before + 1)
      await page.reload()
      await expect(focus(page)).toHaveAttribute('aria-busy', 'false')
      expect(await completedCount(page)).toBe(before + 1)
      await expect.poll(() => pending(page)).toEqual([])
    })
  } finally {
    adb('shell', 'cmd', 'alarm', 'set-time', String(Date.now()))
    if (autoTime === 'null') adb('shell', 'settings', 'delete', 'global', 'auto_time')
    else adb('shell', 'settings', 'put', 'global', 'auto_time', autoTime)
  }
  console.log('Android inexact fallback, clock change after force-stop and single persisted completion: OK')
}

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
  await page.context().setOffline(true)
  const editedTask = taskTitle + ' edited offline'
  try {
    await page.waitForFunction(() => !navigator.onLine)
    await page.locator('.tasks-page').getByText(taskTitle, { exact: true }).click()
    await drawer.getByTitle('编辑任务').click()
    await drawer.getByRole('textbox', { name: '任务名称' }).fill(editedTask)
    await drawer.getByRole('button', { name: '保存修改' }).click()
    await expect(drawer.getByRole('heading', { name: editedTask })).toBeVisible()
    await drawer.getByRole('button', { name: '删除', exact: true }).click()
    await drawer.getByRole('button', { name: '再次点击确认删除' }).click()
    await expect(drawer).toBeHidden()
    await expect(page.locator('.tasks-page').getByText(editedTask, { exact: true })).toHaveCount(0)
  } finally { await page.context().setOffline(false) }
  adb('shell', 'input', 'keyevent', '4')
  await page.getByPlaceholder('添加一个任务，按 Enter 保存').waitFor({ timeout: 15_000 })
  await nav.getByRole('link', { name: '专注', exact: true }).click()
  const focus = page.locator('.focus-page')
  await expect(focus).toHaveAttribute('aria-busy', 'false')
  const cancel = focus.getByRole('button', { name: '放弃本次计时' })
  if (await cancel.isVisible()) await cancel.click()
  await focus.getByRole('button', { name: '番茄钟', exact: true }).click()
  await expect(focus).toHaveClass(/mode-pomodoro/)
  await focus.getByRole('button', { name: '开始专注', exact: true }).click()
  const pause = page.getByRole('button', { name: '暂停一下' })
  await expect(pause).toBeVisible()
  await page.getByTitle('全屏专注').click()
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible()
  adb('shell', 'input', 'keyevent', '4')
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeHidden()
  await expect(nav).toBeVisible()
  await expect(pause).toBeVisible()
  await cancel.click()
  await focus.getByRole('button', { name: '正计时', exact: true }).click()
  await expect(focus).toHaveClass(/mode-stopwatch/)
  await verifyAmbientControls(focus)
  await focus.getByRole('button', { name: '开始专注', exact: true }).click()
  await expect(focus.locator('.focus-time strong')).toHaveText(/00:0[1-9]/)
  await focus.getByTitle('结束并记录').click()
  await heading(page, '完成了一段专注')
  await page.goto('https://localhost/stats')
  await heading(page, '专注回顾')
  await expect(page.getByRole('heading', { name: /已连续专注/ })).toBeVisible()
  console.log('Android task CRUD offline, Pomodoro, stopwatch focus history, statistics and ambient controls: OK')
  await verifyHabitStorage(page)
  openAuth()
  await heading(page, '欢迎回到 Focus Day')
  console.log('Android mobile navigation, IME, native Back for sheets and focus, deep-route reload, warm auth link and no PWA worker: OK')
}

async function verifyAmbientControls(focus) {
  const mixer = focus.locator('.ambient-mixer')
  const unmute = mixer.getByRole('button', { name: '取消静音' })
  if (await unmute.isVisible()) await unmute.click()
  const rain = mixer.getByRole('button', { name: /^雨声/ })
  if (await rain.getAttribute('aria-pressed') !== 'true') await rain.click()
  await expect(rain).toHaveAttribute('aria-pressed', 'true')
  const resume = mixer.getByRole('button', { name: '播放已选声音' })
  if (await resume.isVisible()) await resume.click()
  await expect(resume).toBeHidden()
  await mixer.getByRole('button', { name: '一键静音' }).click()
  await expect(unmute).toBeVisible()
  await rain.click()
  await expect(rain).toHaveAttribute('aria-pressed', 'false')
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
