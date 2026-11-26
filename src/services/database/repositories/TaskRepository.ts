import type { TaskRepository } from '../../../repositories/task/TaskRepository'
import type { CategoryRecord, TaskRecord } from '../../../types/database'
import type { Task, TaskCategory } from '../../../types/task'
import { TaskDomainError } from '../../../types/task'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SyncQueueService } from '../../sync/SyncQueueService'

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
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }

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
    await this.database.transaction(async db => {
      const previous = await db.tasks.get(task.id)
      const record = taskRecord(task, previous)
      await db.tasks.put(record)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'TASK', entityId: task.id, operation: previous ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: previous?.version ?? 0, baseUpdatedAt: previous?.updatedAt ?? null })
    })
    return clone(task)
  }

  async saveTasks(tasks: Task[]): Promise<Task[]> {
    await this.database.transaction(async db => {
      const ids = tasks.map(task => task.id)
      const previous = await db.tasks.bulkGet(ids)
      const records = tasks.map((task, index) => taskRecord(task, previous[index]))
      await db.tasks.bulkPut(records)
      await Promise.all(records.map((record, index) => this.queue.enqueueWithinTransaction(db, { entityType: 'TASK', entityId: record.id,
        operation: previous[index] ? 'UPDATE' : 'INSERT', payload: record, baseVersion: previous[index]?.version ?? 0,
        baseUpdatedAt: previous[index]?.updatedAt ?? null })))
    })
    return clone(tasks)
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.database.transaction(async db => {
      const current = await db.tasks.get(id)
      if (!current || current.deletedAt) return false
      const now = new Date().toISOString()
      const record = { ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING' as const, version: current.version + 1 }
      await db.tasks.put(record)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'TASK', entityId: id, operation: 'DELETE', payload: record,
        baseVersion: current.version, baseUpdatedAt: current.updatedAt })
      return true
    })
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
    await this.database.transaction(async db => {
      const previous = await db.categories.get(category.id)
      const record = categoryRecord(category, previous)
      await db.categories.put(record)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'CATEGORY', entityId: category.id, operation: previous ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: previous?.version ?? 0, baseUpdatedAt: previous?.updatedAt ?? null })
    })
    return clone(category)
  }

  async deleteCategory(categoryId: string, replacementCategoryId: string): Promise<boolean> {
    return this.database.transaction(async db => {
      const [current, replacement] = await Promise.all([
        db.categories.get(categoryId),
        db.categories.get(replacementCategoryId),
      ])
      if (!replacement || replacement.deletedAt) throw new TaskDomainError('替代分类不存在', 'INVALID_RELATION')
      if (!current || current.deletedAt) return false
      const now = new Date().toISOString()
      const linkedTasks = await db.tasks.where('categoryId').equals(categoryId).toArray()
      const activeTasks = linkedTasks.filter(task => !task.deletedAt)
      const movedTasks = activeTasks.map(task => ({
        ...task,
        categoryId: replacementCategoryId,
        updatedAt: now,
        syncStatus: 'PENDING' as const,
        version: task.version + 1,
      }))
      await db.tasks.bulkPut(movedTasks)
      await Promise.all(movedTasks.map((task, index) => this.queue.enqueueWithinTransaction(db, { entityType: 'TASK', entityId: task.id,
        operation: 'UPDATE', payload: task, baseVersion: activeTasks[index]?.version ?? task.version - 1,
        baseUpdatedAt: activeTasks[index]?.updatedAt ?? null })))
      const deleted = { ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING' as const, version: current.version + 1 }
      await db.categories.put(deleted)
      await this.queue.enqueueWithinTransaction(db, { entityType: 'CATEGORY', entityId: categoryId, operation: 'DELETE', payload: deleted,
        baseVersion: current.version, baseUpdatedAt: current.updatedAt })
      return true
    })
  }
}
