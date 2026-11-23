export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface Task {
  id: string
  title: string
  description: string
  categoryId: string
  priority: TaskPriority
  status: TaskStatus
  plannedDate: string | null
  dueDate: string | null
  estimatedDuration: number
  estimatedPomodoros: number
  sortOrder: number
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskCategory {
  id: string
  name: string
  color: string
  icon: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  categoryId?: string
  priority?: TaskPriority
  status?: TaskStatus
  plannedDate?: string | null
  dueDate?: string | null
  estimatedDuration?: number
  estimatedPomodoros?: number
}

export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder' | 'completedAt'>>

export interface TaskFilter {
  search?: string
  categoryId?: string
  priority?: TaskPriority
  status?: TaskStatus
  plannedDate?: string | null
}

export interface CreateCategoryInput {
  name: string
  color: string
  icon: string
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>

export class TaskDomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'VALIDATION_ERROR'
      | 'TASK_NOT_FOUND'
      | 'CATEGORY_NOT_FOUND'
      | 'DUPLICATE_SUBMISSION'
      | 'INVALID_RELATION'
      | 'PERSISTENCE_ERROR',
  ) {
    super(message)
    this.name = 'TaskDomainError'
  }
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
