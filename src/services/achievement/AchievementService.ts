import type { AchievementDefinition, AchievementMetric, UserAchievement } from '../../types/achievement'
import type { Task } from '../../types/task'
import type { FocusSession } from '../../types/focusSession'
import { normalizeStatisticsSessions, resolvedTimeZone, StatisticsCalculator } from '../statistics/StatisticsCalculator'
import { ACHIEVEMENTS } from './achievementDefinitions'

export interface AchievementActivity {
  tasks: Pick<Task, 'id' | 'completedAt' | 'status'>[]
  sessions: FocusSession[]
}

export interface AchievementProgress {
  definition: AchievementDefinition
  progress: number
  unlock: UserAchievement | null
}

export interface AchievementRepositoryPort {
  unlock(record: UserAchievement): Promise<{ record: UserAchievement; created: boolean }>
}

const HOUR = 60 * 60_000

export function calculateAchievementMetrics(activity: AchievementActivity, now = Date.now(), timeZone = resolvedTimeZone()): Record<AchievementMetric, number> {
  const sessions = normalizeStatisticsSessions(activity.sessions.filter(session => session.endTime <= now && Number.isFinite(session.duration)))
  const hours = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' })
  let duration = 0
  let morningSessions = 0
  let nightSessions = 0
  for (const session of sessions) {
    duration += session.duration
    const hour = Number(hours.format(session.endTime))
    if (hour >= 5 && hour < 10) morningSessions++
    if (hour >= 22 || hour < 5) nightSessions++
  }
  return {
    sessions: sessions.length,
    longestStreak: StatisticsCalculator.streakMetrics(sessions, now, timeZone).longest,
    focusHours: duration / HOUR,
    completedTasks: new Set(activity.tasks.filter(task => task.status === 'COMPLETED'
      && task.completedAt && Date.parse(task.completedAt) <= now).map(task => task.id)).size,
    morningSessions,
    nightSessions,
  }
}

export class AchievementService {
  constructor(
    private readonly repository: AchievementRepositoryPort,
    private readonly definitions: readonly AchievementDefinition[] = ACHIEVEMENTS,
  ) {}

  async reconcile(activity: AchievementActivity, records: UserAchievement[], now = Date.now(), timeZone = resolvedTimeZone()) {
    const metrics = calculateAchievementMetrics(activity, now, timeZone)
    const unlocked = new Map(records.map(record => [record.definitionId, record]))
    const newlyUnlocked: AchievementProgress[] = []
    const progress: AchievementProgress[] = []
    for (const definition of this.definitions) {
      const count = metrics[definition.metric]
      let unlock = unlocked.get(definition.id) ?? null
      let created = false
      if (!unlock && count >= definition.target) {
        const result = await this.repository.unlock({ definitionId: definition.id, unlockedAt: new Date(now).toISOString() })
        unlock = result.record
        created = result.created
      }
      const item = { definition, progress: unlock ? definition.target : Math.min(definition.target, count), unlock }
      if (created) newlyUnlocked.push(item)
      progress.push(item)
    }
    return { progress, newlyUnlocked }
  }
}
