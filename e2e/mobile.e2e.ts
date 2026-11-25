import { expect, test, type CDPSession } from '@playwright/test'
import { setTimeout as delay } from 'node:timers/promises'

type Point = { x: number; y: number }

async function gesture(cdp: CDPSession, from: Point, to: Point, hold = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  if (hold) await delay(hold)
  for (let step = 1; step <= 4; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: from.x + (to.x - from.x) * step / 4,
      y: from.y + (to.y - from.y) * step / 4,
    }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('touch task creation, swipe confirmation and long-press reorder', async ({ page, context }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '移动端主导航' })
  await expect(nav.getByRole('link')).toHaveText(['今日', '任务', '专注', '统计', '我的'])
  await expect(page.getByRole('heading', { name: '今日习惯' })).toBeVisible()
  await page.getByRole('button', { name: '新建任务' }).tap()
  const create = page.getByRole('dialog', { name: '新建任务' })
  await create.getByRole('textbox', { name: '任务名称' }).fill('触摸创建')
  await create.getByRole('button', { name: '创建任务' }).tap()
  await expect(create).not.toBeVisible()
  const quick = page.getByPlaceholder('添加一个任务，按 Enter 保存')
  await quick.fill('排序目标')
  await quick.press('Enter')
  await nav.getByRole('link', { name: '任务', exact: true }).tap()
  const rows = page.locator('.tasks-page .mobile-task-slot')
  const row = rows.filter({ hasText: '触摸创建' })
  await expect(row).toBeVisible()
  await expect(rows.filter({ hasText: '排序目标' })).toBeVisible()
  const handle = (await rows.first().locator('.mobile-drag-handle').boundingBox())!
  const second = (await rows.nth(1).boundingBox())!
  const firstTitle = await rows.first().locator('strong').innerText()
  const cdp = await context.newCDPSession(page)
  await gesture(cdp, { x: handle.x + 22, y: handle.y + 22 }, { x: handle.x + 22, y: second.y + second.height / 2 }, 380)
  await expect(rows.nth(1).locator('strong')).toHaveText(firstTitle)
  await row.scrollIntoViewIfNeeded()
  const content = (await row.locator('.mobile-task-content').boundingBox())!
  const x = content.x + content.width / 2
  const y = content.y + content.height / 2
  await gesture(cdp, { x, y }, { x: x - 85, y })
  await expect(row.locator('.swipe-toggle')).toBeVisible()
  await expect(row.locator('.mobile-task-card')).not.toHaveClass(/done-card/)
  await row.locator('.swipe-toggle').tap()
  await expect(row.locator('.mobile-task-card')).toHaveClass(/done-card/)
  const focusRow = rows.filter({ hasText: '排序目标' })
  await focusRow.scrollIntoViewIfNeeded()
  const focusContent = (await focusRow.locator('.mobile-task-content').boundingBox())!
  const focusX = focusContent.x + 45
  const focusY = focusContent.y + focusContent.height / 2
  await gesture(cdp, { x: focusX, y: focusY }, { x: focusX + 85, y: focusY })
  await expect(focusRow.locator('.swipe-focus')).toBeVisible()
  await expect(page).toHaveURL(/\/tasks$/)
  await focusRow.locator('.swipe-focus').tap()
  await expect(page.locator('.focus-page').getByRole('button', { name: '暂停一下' })).toBeVisible()
  await cdp.detach()
})

test('touch tablet and phone landscape keep single-column navigation and themed focus controls', async ({ page }) => {
  await page.goto('/me')
  const nav = page.getByRole('navigation', { name: '移动端主导航' })
  await page.getByRole('link', { name: '设置', exact: true }).tap()
  await page.getByRole('button', { name: '深夜模式', exact: true }).tap()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await nav.getByRole('link', { name: '专注' }).tap()
  await expect(page.getByRole('button', { name: /番茄钟/ })).toHaveClass(/active/)
  await page.getByRole('button', { name: /倒计时/ }).tap()
  await expect(page.getByRole('spinbutton', { name: /目标时长/ })).toBeVisible()
  await page.getByRole('button', { name: /正计时/ }).tap()
  await page.getByRole('button', { name: '开始专注' }).tap()
  await expect(page.getByRole('button', { name: '暂停一下' })).toBeVisible()
  await page.getByTitle('全屏专注').tap()
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible()
  await expect(nav).not.toBeVisible()
  await page.getByRole('button', { name: '退出全屏' }).tap()
  await page.getByRole('button', { name: '暂停一下' }).tap()
  await expect(page.getByRole('button', { name: '继续专注' })).toBeVisible()
  for (const viewport of [{ width: 1024, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await expect(nav).toBeInViewport()
    await expect(page.locator('.sidebar')).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await page.getByRole('button', { name: '继续专注' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '继续专注' })).toBeInViewport()
  }
})
