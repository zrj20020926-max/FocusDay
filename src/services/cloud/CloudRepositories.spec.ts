import { describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { CloudTaskRepository } from './repositories/CloudTaskRepository'
import { CloudRepositoryError } from './CloudRepositoryError'
import type { TaskRow } from '../../types/cloud'
import type { Task } from '../../types/task'
import migrationSql from '../../../supabase/migrations/202611230001_initial_schema.sql?raw'

const userId = '11111111-1111-4111-8111-111111111111'
const taskId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const categoryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const now = '2026-11-23T10:00:00.000Z'
const row: TaskRow = {
  id: taskId, user_id: userId, title: '云端任务', description: '', category_id: categoryId, priority: 'HIGH', status: 'TODO',
  planned_date: '2026-11-23', due_date: null, estimated_duration: 25, estimated_pomodoros: 1, sort_order: 0,
  completed_at: null, created_at: now, updated_at: now, deleted_at: null, version: 1,
}
const task: Task = {
  id: taskId, title: row.title, description: '', categoryId, priority: 'HIGH', status: 'TODO', plannedDate: '2026-11-23',
  dueDate: null, estimatedDuration: 25, estimatedPomodoros: 1, sortOrder: 0, completedAt: null, createdAt: now, updatedAt: now,
}

function authenticatedClient(from: ReturnType<typeof vi.fn>) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } as User }, error: null }) }, from } as any
}

describe('Cloud repositories and RLS contract', () => {
  it('读取云端任务时始终限定当前 user_id', async () => {
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const chain: any = { eq: vi.fn(() => chain), is: vi.fn(() => chain), order }
    const select = vi.fn(() => chain)
    const repository = new CloudTaskRepository(authenticatedClient(vi.fn(() => ({ select }))))
    expect((await repository.listTasks())[0].title).toBe('云端任务')
    expect(chain.eq).toHaveBeenCalledWith('user_id', userId)
  })

  it('写入任务时强制使用当前认证用户 ID', async () => {
    let payload: TaskRow | undefined
    const single = vi.fn().mockImplementation(async () => ({ data: payload, error: null }))
    const selection: any = { single }
    const upsert = vi.fn((value: TaskRow) => { payload = value; return { select: () => selection } })
    const repository = new CloudTaskRepository(authenticatedClient(vi.fn(() => ({ upsert }))))
    expect((await repository.saveTask(task)).id).toBe(taskId)
    expect(payload?.user_id).toBe(userId)
  })

  it('未登录状态无法读取或写入云端数据', async () => {
    const from = vi.fn()
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }, from } as any
    await expect(new CloudTaskRepository(client).listTasks()).rejects.toMatchObject({ operation: 'authorize' })
    expect(from).not.toHaveBeenCalled()
  })

  it('将数据库异常转换为统一 Repository 异常', async () => {
    const chain: any = { eq: vi.fn(() => chain), is: vi.fn(() => chain), order: vi.fn().mockResolvedValue({ data: null, error: { message: 'network failed' } }) }
    const repository = new CloudTaskRepository(authenticatedClient(vi.fn(() => ({ select: () => chain }))))
    await expect(repository.listTasks()).rejects.toBeInstanceOf(CloudRepositoryError)
  })

  it('迁移对全部业务表启用并强制 RLS，策略基于 auth.uid()', () => {
    const sql = migrationSql
    for (const table of ['profiles', 'categories', 'tasks', 'focus_sessions', 'timer_states', 'user_settings']) {
      expect(sql).toContain(`'${table}'`)
    }
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('force row level security')
    expect(sql).toContain('auth.uid()) = user_id')
    expect(sql).toContain('for insert to authenticated with check')
  })
})
