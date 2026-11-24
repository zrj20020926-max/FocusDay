import type { TaskRepository } from '../../repositories/task/TaskRepository'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskDomainError,
  localDateKey,
  type CreateTaskInput,
  type Task,
  type TaskFilter,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskInput,
} from '../../types/task'

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function assertDate(value: string | null | undefined, field: string): void {
  if (value == null || value === '') return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TaskDomainError(`${field}格式无效`, 'VALIDATION_ERROR')
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new TaskDomainError(`${field}不是有效日期`, 'VALIDATION_ERROR')
  }
}

function assertNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) throw new TaskDomainError(`${field}必须是非负数`, 'VALIDATION_ERROR')
}

function assertInteger(value: number, field: string): void {
  assertNumber(value, field)
  if (!Number.isInteger(value)) throw new TaskDomainError(`${field}必须是整数`, 'VALIDATION_ERROR')
}

export class TaskService {
  private readonly pendingCreates = new Set<string>()

  constructor(private readonly repository: TaskRepository) {}

  async getAll(): Promise<Task[]> {
    return (await this.repository.listTasks()).sort((a, b) => a.sortOrder - b.sortOrder)
  }

  async getById(id: string): Promise<Task> {
    const task = await this.repository.findTaskById(id)
    if (!task) throw new TaskDomainError('任务不存在', 'TASK_NOT_FOUND')
    return task
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const title = input.title.trim()
    if (!title) throw new TaskDomainError('任务名称不能为空', 'VALIDATION_ERROR')
    const key = `${title.toLocaleLowerCase()}|${input.plannedDate ?? localDateKey()}`
    if (this.pendingCreates.has(key)) throw new TaskDomainError('任务正在创建，请勿重复提交', 'DUPLICATE_SUBMISSION')
    this.pendingCreates.add(key)
    try {
      const categories = await this.repository.listCategories()
      const categoryId = input.categoryId ?? categories.find(category => category.isDefault && category.name === '其他')?.id ?? categories[0]?.id
      if (!categories.some(category => category.id === categoryId)) throw new TaskDomainError('任务分类不存在', 'INVALID_RELATION')
      const priority = input.priority ?? 'MEDIUM'
      const status = input.status ?? 'TODO'
      this.assertPriority(priority)
      this.assertStatus(status)
      const plannedDate = input.plannedDate === undefined ? localDateKey() : input.plannedDate
      const dueDate = input.dueDate === undefined ? plannedDate : input.dueDate
      assertDate(plannedDate, '计划日期')
      assertDate(dueDate, '截止日期')
      const estimatedDuration = input.estimatedDuration ?? 25
      const estimatedPomodoros = input.estimatedPomodoros ?? Math.max(1, Math.ceil(estimatedDuration / 25))
      assertNumber(estimatedDuration, '预计时长')
      assertInteger(estimatedPomodoros, '预计番茄数')
      const tasks = await this.getAll()
      const now = new Date().toISOString()
      const task: Task = {
        id: createId(),
        title,
        description: input.description?.trim() ?? '',
        categoryId,
        priority,
        status,
        plannedDate,
        dueDate,
        estimatedDuration,
        estimatedPomodoros,
        sortOrder: tasks.length,
        completedAt: status === 'COMPLETED' ? now : null,
        createdAt: now,
        updatedAt: now,
      }
      return await this.repository.saveTask(task)
    } finally {
      this.pendingCreates.delete(key)
    }
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const current = await this.getById(id)
    const next: Task = { ...current, ...input, updatedAt: new Date().toISOString() }
    next.title = next.title.trim()
    next.description = next.description.trim()
    if (!next.title) throw new TaskDomainError('任务名称不能为空', 'VALIDATION_ERROR')
    this.assertPriority(next.priority)
    this.assertStatus(next.status)
    assertDate(next.plannedDate, '计划日期')
    assertDate(next.dueDate, '截止日期')
    assertNumber(next.estimatedDuration, '预计时长')
    assertInteger(next.estimatedPomodoros, '预计番茄数')
    if (!await this.repository.findCategoryById(next.categoryId)) throw new TaskDomainError('任务分类不存在', 'INVALID_RELATION')
    if (next.status === 'COMPLETED' && !next.completedAt) next.completedAt = new Date().toISOString()
    if (next.status !== 'COMPLETED') next.completedAt = null
    return await this.repository.saveTask(next)
  }

  async delete(id: string): Promise<void> {
    if (!await this.repository.deleteTask(id)) throw new TaskDomainError('要删除的任务不存在', 'TASK_NOT_FOUND')
    await this.normalizeOrder()
  }

  async complete(id: string): Promise<Task> { return this.update(id, { status: 'COMPLETED' }) }
  async uncomplete(id: string): Promise<Task> { return this.update(id, { status: 'TODO' }) }
  async moveToStatus(id: string, status: TaskStatus): Promise<Task> {
    this.assertStatus(status)
    return this.update(id, { status })
  }

  async reorder(draggedId: string, targetId: string): Promise<Task[]> {
    if (draggedId === targetId) return this.getAll()
    const tasks = await this.getAll()
    const from = tasks.findIndex(task => task.id === draggedId)
    const to = tasks.findIndex(task => task.id === targetId)
    if (from < 0 || to < 0) throw new TaskDomainError('排序任务不存在', 'TASK_NOT_FOUND')
    const [dragged] = tasks.splice(from, 1)
    tasks.splice(to, 0, dragged)
    const now = new Date().toISOString()
    return this.repository.saveTasks(tasks.map((task, index) => ({ ...task, sortOrder: index, updatedAt: now })))
  }

  filter(tasks: Task[], filter: TaskFilter): Task[] {
    const search = filter.search?.trim().toLocaleLowerCase()
    return tasks.filter(task => {
      if (search && !`${task.title} ${task.description}`.toLocaleLowerCase().includes(search)) return false
      if (filter.categoryId && task.categoryId !== filter.categoryId) return false
      if (filter.priority && task.priority !== filter.priority) return false
      if (filter.status && task.status !== filter.status) return false
      if (filter.plannedDate !== undefined && task.plannedDate !== filter.plannedDate) return false
      return true
    }).sort((a, b) => a.sortOrder - b.sortOrder)
  }

  private async normalizeOrder(): Promise<void> {
    const tasks = await this.getAll()
    await this.repository.saveTasks(tasks.map((task, index) => ({ ...task, sortOrder: index })))
  }

  private assertStatus(status: string): asserts status is TaskStatus {
    if (!TASK_STATUSES.includes(status as TaskStatus)) throw new TaskDomainError('任务状态异常', 'VALIDATION_ERROR')
  }

  private assertPriority(priority: string): asserts priority is TaskPriority {
    if (!TASK_PRIORITIES.includes(priority as TaskPriority)) throw new TaskDomainError('任务优先级异常', 'VALIDATION_ERROR')
  }
}
