import type { TaskRepository } from '../../../repositories/task/TaskRepository'
import { CloudCategoryRepository } from './CloudCategoryRepository'
import { CloudTaskRepository } from './CloudTaskRepository'
import type { CloudClient } from './helpers'

export class CloudTaskCategoryRepository implements TaskRepository {
  private readonly tasks: CloudTaskRepository
  private readonly categories: CloudCategoryRepository

  constructor(client: CloudClient) {
    this.tasks = new CloudTaskRepository(client)
    this.categories = new CloudCategoryRepository(client)
  }

  listTasks = () => this.tasks.listTasks()
  findTaskById = (id: string) => this.tasks.findTaskById(id)
  saveTask = (task: Parameters<CloudTaskRepository['saveTask']>[0]) => this.tasks.saveTask(task)
  saveTasks = (tasks: Parameters<CloudTaskRepository['saveTasks']>[0]) => this.tasks.saveTasks(tasks)
  deleteTask = (id: string) => this.tasks.deleteTask(id)
  listCategories = () => this.categories.listCategories()
  findCategoryById = (id: string) => this.categories.findCategoryById(id)
  saveCategory = (category: Parameters<CloudCategoryRepository['saveCategory']>[0]) => this.categories.saveCategory(category)
  deleteCategory = (categoryId: string, replacementCategoryId: string) => this.categories.deleteCategory(categoryId, replacementCategoryId)
}
