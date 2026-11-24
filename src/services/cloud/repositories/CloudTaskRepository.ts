import type { TaskDataRepository } from '../../../repositories/task/TaskRepository'
import type { Task } from '../../../types/task'
import type { TaskRow } from '../../../types/cloud'
import { assertUuid } from '../CloudRepositoryError'
import { cloudError, requireUser, type CloudClient } from './helpers'

function fromRow(row: TaskRow): Task {
  return {
    id: row.id, title: row.title, description: row.description, categoryId: row.category_id ?? '', priority: row.priority,
    status: row.status, plannedDate: row.planned_date, dueDate: row.due_date, estimatedDuration: row.estimated_duration,
    estimatedPomodoros: row.estimated_pomodoros, sortOrder: row.sort_order, completedAt: row.completed_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function toRow(task: Task, userId: string): TaskRow {
  assertUuid(task.id, '任务 ID')
  if (task.categoryId) assertUuid(task.categoryId, '分类 ID')
  return {
    id: task.id, user_id: userId, title: task.title, description: task.description, category_id: task.categoryId || null,
    priority: task.priority, status: task.status, planned_date: task.plannedDate, due_date: task.dueDate,
    estimated_duration: task.estimatedDuration, estimated_pomodoros: task.estimatedPomodoros, sort_order: task.sortOrder,
    completed_at: task.completedAt, created_at: task.createdAt, updated_at: task.updatedAt, deleted_at: null, version: 1,
  }
}

export class CloudTaskRepository implements TaskDataRepository {
  constructor(private readonly client: CloudClient) {}

  async listTasks(): Promise<Task[]> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('tasks').select('*').eq('user_id', user.id).is('deleted_at', null).order('sort_order')
    if (error) cloudError('list-tasks', error)
    return (data ?? []).map(fromRow)
  }

  async findTaskById(id: string): Promise<Task | null> {
    assertUuid(id, '任务 ID')
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('tasks').select('*').eq('user_id', user.id).eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) cloudError('find-task', error)
    return data ? fromRow(data) : null
  }

  async saveTask(task: Task): Promise<Task> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('tasks').upsert(toRow(task, user.id), { onConflict: 'id' }).select('*').single()
    if (error || !data) cloudError('save-task', error)
    return fromRow(data)
  }

  async saveTasks(tasks: Task[]): Promise<Task[]> {
    if (tasks.length === 0) return []
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('tasks').upsert(tasks.map(task => toRow(task, user.id)), { onConflict: 'id' }).select('*')
    if (error) cloudError('save-tasks', error)
    return (data ?? []).map(fromRow)
  }

  async deleteTask(id: string): Promise<boolean> {
    assertUuid(id, '任务 ID')
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('user_id', user.id).eq('id', id).is('deleted_at', null).select('id')
    if (error) cloudError('delete-task', error)
    return Boolean(data?.length)
  }
}
