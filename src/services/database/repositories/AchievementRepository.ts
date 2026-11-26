import { ACHIEVEMENT_PREFIX, achievementKey, readAchievement, type UserAchievement } from '../../../types/achievement'
import type { AchievementActivity } from '../../achievement/AchievementService'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SettingsRepository } from './SettingsRepository'
import type { DatabaseTables } from '../DatabaseTables'

export class AchievementRepository {
  private readonly settings: SettingsRepository

  constructor(private readonly database: DatabaseService = databaseService) {
    this.settings = new SettingsRepository(database)
  }

  async unlock(record: UserAchievement, transaction?: DatabaseTables) {
    const key = achievementKey(record.definitionId)
    const result = await this.settings.setOnce(key, record, transaction)
    return { record: readAchievement(key, result.value) ?? record, created: result.created }
  }

  observe() { return this.database.observe(['tasks', 'focusSessions', 'userSettings'], () => this.snapshot()) }

  async snapshot(): Promise<{ activity: AchievementActivity; records: UserAchievement[] }> {
    await this.database.initialize()
    return this.database.read(['tasks', 'focusSessions', 'userSettings'], async db => {
      const [tasks, sessions, settings] = await Promise.all([
        db.tasks.where('status').equals('COMPLETED').toArray(),
        db.focusSessions.where('status').equals('COMPLETED').filter(session => !session.deletedAt).toArray(),
        db.userSettings.where('id').startsWith(ACHIEVEMENT_PREFIX).filter(record => !record.deletedAt).toArray(),
      ])
      const records = settings.flatMap(row => {
        const record = readAchievement(row.id, row.value)
        return record ? [record] : []
      })
      return { activity: { tasks, sessions }, records }
    })
  }
}
