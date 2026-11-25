import { expect, test, type Page } from '@playwright/test'

async function controlled(page: Page) {
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

async function quickTask(page: Page, title: string) {
  const input = page.getByPlaceholder('添加一个任务，按 Enter 保存')
  await input.fill(title)
  await input.press('Enter')
  await expect(page.locator('.main-stage').getByText(title, { exact: true })).toBeVisible()
}

async function queuedTask(page: Page, title: string) {
  return page.evaluate(name => new Promise<{ status: string; lastError?: string; nextAttemptAt?: string } | null>((resolve, reject) => {
    const request = indexedDB.open('focus-day')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const read = database.transaction('syncQueue').objectStore('syncQueue').getAll()
      read.onerror = () => { database.close(); reject(read.error) }
      read.onsuccess = () => {
        database.close()
        const match = read.result.find(item => item.entityType === 'TASK' && item.payload?.title === name)
        resolve(match ? { status: match.status, lastError: match.lastError, nextAttemptAt: match.nextAttemptAt } : null)
      }
    }
  }), title)
}

test('manifest, installation assets, online launch, and cache boundaries', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'Focus Day', display: 'standalone', start_url: '/', background_color: '#f4f1e9' })
  expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: '512x512', purpose: 'maskable' })]))
  for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok()).toBe(true)
  const requests: string[] = []
  page.on('request', value => requests.push(value.url()))
  await page.goto('/')
  await expect(page.getByPlaceholder('添加一个任务，按 Enter 保存')).toBeVisible()
  await controlled(page)
  expect(requests.some(url => /fonts\.google|fonts\.gstatic|\/assets\/dist-|\/assets\/StatsView-/.test(url))).toBe(false)
  const cached = await page.evaluate(async () => {
    const responses = await Promise.all(['/api/sensitive', '/uploads/example', '/auth/v1/user'].map(path => fetch(path)))
    const cacheNames = await caches.keys()
    const entries = await Promise.all(cacheNames.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))
    return { entries: entries.flat(), ok: responses.every(response => response.ok) }
  })
  expect(cached.ok).toBe(true)
  expect(cached.entries.some(url => url.includes('/index.html'))).toBe(true)
  expect(cached.entries.some(url => /\/api\/|\/uploads\/|\/auth\/|\/rest\//.test(url))).toBe(false)
})

test('fresh offline navigation supports task edits, completed focus and statistics', async ({ page, context }) => {
  await page.goto('/')
  await controlled(page)
  await context.setOffline(true)
  await page.reload()
  await quickTask(page, '离线创建的任务')
  await page.goto('/tasks')
  await page.locator('.main-stage').getByText('离线创建的任务', { exact: true }).click()
  await page.getByTitle('编辑任务').click()
  await page.getByRole('textbox', { name: '任务名称' }).fill('离线编辑后的任务')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('heading', { name: '离线编辑后的任务' })).toBeVisible()

  await page.goto('/focus')
  await page.getByRole('button', { name: /正计时/ }).click()
  await page.locator('.main-stage').getByRole('button', { name: '开始专注' }).click()
  await expect(page.getByRole('button', { name: '暂停一下' })).toBeVisible()
  await page.getByRole('button', { name: '暂停一下' }).click()
  await expect(page.locator('.main-stage').getByRole('button', { name: '继续专注' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.main-stage').getByRole('button', { name: '继续专注' })).toBeVisible()
  await page.locator('.main-stage').getByRole('button', { name: '继续专注' }).click()
  await page.getByTitle('结束并记录').click()
  await expect(page.getByRole('heading', { name: '完成了一段专注' })).toBeVisible()
  await page.goto('/stats')
  await expect(page.getByRole('heading', { name: '专注回顾' })).toBeVisible()
  await expect(page.locator('.analytics-metrics')).toBeVisible()
  await expect(page.getByRole('heading', { name: '已连续专注 1 天' })).toBeVisible()
  await page.goto('/achievements')
  await expect(page.getByRole('heading', { name: '初次专注' })).toBeVisible()
  await expect(page.getByText(/解锁于/).first()).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByText('离线应用已就绪')).toBeVisible()
})

test('network recovery syncs an offline task through the configured client', async ({ page, context, request }) => {
  await context.addInitScript(() => {
    const user = { id: '21bf127b-f949-44d0-ac90-3397bb80aba4', aud: 'authenticated', email: 'pwa@example.test',
      role: 'authenticated', app_metadata: {}, user_metadata: { display_name: '离线测试账号' } }
    localStorage.setItem('focus-day.auth', JSON.stringify({
      access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user,
    }))
  })
  await page.goto('/')
  await controlled(page)
  await expect(page.getByText('离线测试账号', { exact: true })).toBeVisible()
  await context.setOffline(true)
  await quickTask(page, '重连后同步的任务')
  await expect.poll(() => queuedTask(page, '重连后同步的任务')).not.toBeNull()
  const cloudTasks = async () => (await (await request.get('/__test/cloud-tasks')).json() as Array<{ title: string }>).map(task => task.title)
  expect(await cloudTasks()).not.toContain('重连后同步的任务')
  await context.setOffline(false)
  try { await expect.poll(cloudTasks, { timeout: 12_000 }).toContain('重连后同步的任务') }
  catch (error) {
    await test.info().attach('pending task state', { body: JSON.stringify(await queuedTask(page, '重连后同步的任务')), contentType: 'application/json' })
    throw error
  }
})

test('update waits for confirmation and restores running timer plus pending task', async ({ page, context, request }) => {
  await page.goto('/')
  await controlled(page)
  await context.setOffline(true)
  await quickTask(page, '更新前待同步')
  await expect.poll(() => queuedTask(page, '更新前待同步')).not.toBeNull()
  await page.goto('/focus')
  await page.getByRole('button', { name: /正计时/ }).click()
  await page.locator('.main-stage').getByRole('button', { name: '开始专注' }).click()
  await expect(page.getByRole('button', { name: '暂停一下' })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await request.post('/__test/advance-worker')
  await page.getByRole('button', { name: '检查更新' }).click()
  const notice = page.getByRole('complementary', { name: '应用更新' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: '稍后' }).click()
  await expect(notice).not.toBeVisible()
  const load = page.waitForEvent('load')
  await page.getByRole('button', { name: '更新并刷新' }).click()
  await load
  await expect(notice).not.toBeVisible()
  await page.getByRole('link', { name: '专注', exact: true }).click()
  await expect(page.getByRole('button', { name: '暂停一下' })).toBeVisible()
  await page.getByRole('link', { name: '今日', exact: true }).click()
  await expect(page.locator('.main-stage').getByText('更新前待同步', { exact: true })).toBeVisible()
  expect(await queuedTask(page, '更新前待同步')).not.toBeNull()
})

test('360px touch viewport keeps navigation, task editor and charts usable', async ({ browser, baseURL }) => {
  const mobile = await browser.newContext({ baseURL, viewport: { width: 360, height: 680 }, isMobile: true, hasTouch: true })
  try {
    const page = await mobile.newPage()
    await page.goto('/')
    await quickTask(page, '小屏任务')
    await page.getByRole('link', { name: '任务', exact: true }).tap()
    await page.locator('.main-stage').getByText('小屏任务', { exact: true }).tap()
    await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible()
    await page.getByTitle('编辑任务').tap()
    const title = page.getByRole('textbox', { name: '任务名称' })
    await title.focus()
    expect(await title.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16)
    await page.getByTitle('关闭', { exact: true }).tap()
    for (const route of ['/tasks', '/stats', '/focus', '/me', '/settings']) {
      await page.goto(route)
      await expect(page.locator('.page')).toBeVisible()
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        navBottom: Math.round(document.querySelector('.mobile-navigation')!.getBoundingClientRect().bottom),
        height: innerHeight,
      }))
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
      expect(dimensions.navBottom).toBe(dimensions.height)
    }
  } finally { await mobile.close() }
})

test('desktop keeps a three-column workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.right-panel')).toBeVisible()
  await expect(page.locator('.mobile-navigation')).toBeHidden()
  const columns = await page.locator('.app-shell').evaluate(shell => getComputedStyle(shell).gridTemplateColumns.split(' '))
  expect(columns).toHaveLength(3)
})
