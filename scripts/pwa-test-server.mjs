// Loopback-only fixtures for Playwright. Never sends requests to a real Supabase project.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, resolve, sep } from 'node:path'

const port = 4177
const root = resolve('dist-e2e')
const origin = `http://127.0.0.1:${port}`
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', root, '--emptyOutDir'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: origin, VITE_SUPABASE_PUBLISHABLE_KEY: 'local-playwright-fixture' },
})
if (build.status !== 0) process.exit(build.status ?? 1)

const user = { id: '21bf127b-f949-44d0-ac90-3397bb80aba4', aud: 'authenticated', email: 'pwa@example.test', role: 'authenticated',
  app_metadata: {}, user_metadata: { display_name: '离线测试账号' }, created_at: '2026-01-01T00:00:00.000Z' }
const tables = Object.fromEntries(['categories', 'tasks', 'focus_sessions', 'habits', 'habit_records', 'timer_states', 'user_settings'].map(key => [key, []]))
const appRoutes = new Set(['/', '/tasks', '/focus', '/habits', '/stats', '/achievements', '/categories', '/settings', '/account'])
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
let revision = 0

function reply(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function matches(row, query) {
  for (const [key, filter] of query.entries()) {
    if (filter.startsWith('eq.') && String(row[key]) !== filter.slice(3)) return false
    if (filter.startsWith('gte.') && String(row[key]) < filter.slice(4)) return false
    if (filter.startsWith('in.(') && !filter.slice(4, -1).split(',').includes(String(row[key]))) return false
  }
  return true
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, origin)
    const path = decodeURIComponent(url.pathname)
    if (path === '/__test/advance-worker' && request.method === 'POST') return reply(response, 200, { revision: ++revision })
    if (path === '/__test/cloud-tasks') return reply(response, 200, tables.tasks)
    if (path === '/auth/v1/user') return reply(response, 200, user)
    if (path === '/uploads/example' || path === '/api/sensitive') return reply(response, 200, { fixture: true })
    if (path.startsWith('/rest/v1/')) {
      const rows = tables[path.slice('/rest/v1/'.length)]
      if (!Array.isArray(rows)) return reply(response, 404, {})
      let result = rows.filter(row => matches(row, url.searchParams))
      if (request.method === 'POST' || request.method === 'PATCH') {
        const parts = []
        for await (const chunk of request) parts.push(chunk)
        const body = JSON.parse(Buffer.concat(parts).toString())
        const now = new Date().toISOString()
        if (request.method === 'POST') {
          result = [body].flat().map(row => ({ id: randomUUID(), updated_at: now, created_at: now, ...row }))
          rows.push(...result)
        } else result.forEach(row => Object.assign(row, body, { updated_at: now }))
      }
      if (request.headers.accept?.includes('application/vnd.pgrst.object')) {
        return result.length === 1 ? reply(response, 200, result[0]) : reply(response, 406, { code: 'PGRST116' })
      }
      return reply(response, 200, result)
    }
    const asset = resolve(root, '.' + (appRoutes.has(path) ? '/index.html' : path))
    if (!asset.startsWith(root + sep)) return reply(response, 404, {})
    const bytes = await readFile(asset).catch(() => null)
    if (!bytes) return reply(response, 404, {})
    response.writeHead(200, { 'Content-Type': mime[extname(asset)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
    response.end(path === '/sw.js' ? Buffer.concat([bytes, Buffer.from(`\n// Test worker revision ${revision}\n`)]) : bytes)
  } catch { reply(response, 500, { error: 'test fixture error' }) }
})

server.listen(port, '127.0.0.1')
