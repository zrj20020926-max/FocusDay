import type { Task, TaskCategory } from '../../types/task'

export interface TaskRepository {
  listTasks(): Promise<Task[]>
  findTaskById(id: string): Promise<Task | null>
  saveTask(task: Task): Promise<Task>
  saveTasks(tasks: Task[]): Promise<Task[]>
  deleteTask(id: string): Promise<boolean>

  listCategories(): Promise<TaskCategory[]>
  findCategoryById(id: string): Promise<TaskCategory | null>
  saveCategory(category: TaskCategory): Promise<TaskCategory>
  deleteCategory(categoryId: string, replacementCategoryId: string): Promise<boolean>
}
