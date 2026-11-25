import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const directory = new URL('../public/icons/', import.meta.url)
const source = await readFile(new URL('focus-day-placeholder.svg', directory), 'utf8')
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const [size, name] of [[192, 'app-192'], [512, 'app-512'], [180, 'apple-touch'], [512, 'maskable-512']]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${source}`)
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, directory)) })
  }
} finally { await browser.close() }
