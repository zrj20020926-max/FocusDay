import type { TaskRepository } from '../../../repositories/task/TaskRepository'
import type { CategoryRecord, TaskRecord } from '../../../types/database'
import type { Task, TaskCategory } from '../../../types/task'
import { TaskDomainError } from '../../../types/task'
import { DatabaseService, databaseService } from '../DatabaseService'

const clone = <T>(value: T): T => structuredClone(value)

function taskRecord(task: Task, previous?: TaskRecord): TaskRecord {
  return {
    ...clone(task),
    deletedAt: previous?.deletedAt ?? null,
    syncStatus: 'PENDING',
    version: (previous?.version ?? 0) + 1,
  }
}

function categoryRecord(category: TaskCategory, previous?: CategoryRecord): CategoryRecord {
  return {
    ...clone(category),
    deletedAt: previous?.deletedAt ?? null,
    syncStatus: 'PENDING',
    version: (previous?.version ?? 0) + 1,
  }
}

export class IndexedDbTaskRepository implements TaskRepository {
  constructor(private readonly database: DatabaseService = databaseService) {}

  async listTasks(): Promise<Task[]> {
    await this.database.initialize()
    const records = (await this.database.db.tasks.orderBy('sortOrder').toArray()).filter(record => !record.deletedAt)
    return records.map(({ deletedAt: _deletedAt, syncStatus: _syncStatus, version: _version, ...task }) => clone(task))
  }

  async findTaskById(id: string): Promise<Task | null> {
    await this.database.initialize()
    const record = await this.database.db.tasks.get(id)
    if (!record || record.deletedAt) return null
    const { deletedAt: _deletedAt, syncStatus: _syncStatus, version: _version, ...task } = record
    return clone(task)
  }

  async saveTask(task: Task): Promise<Task> {
    await this.database.initialize()
    const previous = await this.database.db.tasks.get(task.id)
    await this.database.db.tasks.put(taskRecord(task, previous))
    return clone(task)
  }

  async saveTasks(tasks: Task[]): Promise<Task[]> {
    await this.database.transaction(async () => {
      const ids = tasks.map(task => task.id)
      const previous = await this.database.db.tasks.bulkGet(ids)
      await this.database.db.tasks.bulkPut(tasks.map((task, index) => taskRecord(task, previous[index])))
    })
    return clone(tasks)
  }

  async deleteTask(id: string): Promise<boolean> {
    await this.database.initialize()
    const current = await this.database.db.tasks.get(id)
    if (!current || current.deletedAt) return false
    const now = new Date().toISOString()
    await this.database.db.tasks.put({ ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING', version: current.version + 1 })
    return true
  }

  async listCategories(): Promise<TaskCategory[]> {
    await this.database.initialize()
    const records = (await this.database.db.categories.toArray()).filter(record => !record.deletedAt)
    return records.map(({ deletedAt: _deletedAt, syncStatus: _syncStatus, version: _version, ...category }) => clone(category))
  }

  async findCategoryById(id: string): Promise<TaskCategory | null> {
    await this.database.initialize()
    const record = await this.database.db.categories.get(id)
    if (!record || record.deletedAt) return null
    const { deletedAt: _deletedAt, syncStatus: _syncStatus, version: _version, ...category } = record
    return clone(category)
  }

  async saveCategory(category: TaskCategory): Promise<TaskCategory> {
    await this.database.initialize()
    const previous = await this.database.db.categories.get(category.id)
    await this.database.db.categories.put(categoryRecord(category, previous))
    return clone(category)
  }

  async deleteCategory(categoryId: string, replacementCategoryId: string): Promise<boolean> {
    return this.database.transaction(async () => {
      const [current, replacement] = await Promise.all([
        this.database.db.categories.get(categoryId),
        this.database.db.categories.get(replacementCategoryId),
      ])
      if (!replacement || replacement.deletedAt) throw new TaskDomainError('替代分类不存在', 'INVALID_RELATION')
      if (!current || current.deletedAt) return false
      const now = new Date().toISOString()
      const linkedTasks = await this.database.db.tasks.where('categoryId').equals(categoryId).toArray()
      await this.database.db.tasks.bulkPut(linkedTasks.filter(task => !task.deletedAt).map(task => ({
        ...task,
        categoryId: replacementCategoryId,
        updatedAt: now,
        syncStatus: 'PENDING' as const,
        version: task.version + 1,
      })))
      await this.database.db.categories.put({ ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING', version: current.version + 1 })
      return true
    })
  }
}
