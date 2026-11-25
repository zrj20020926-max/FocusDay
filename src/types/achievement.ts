export type AchievementMetric = 'sessions' | 'longestStreak' | 'focusHours' | 'completedTasks' | 'morningSessions' | 'nightSessions'

export interface AchievementDefinition {
  id: string
  title: string
  description: string
  icon: 'spark' | 'flame' | 'clock' | 'check' | 'sun' | 'moon'
  tone: 'sage' | 'amber' | 'blue' | 'plum'
  metric: AchievementMetric
  target: number
  unit: string
}

export interface UserAchievement {
  definitionId: string
  unlockedAt: string
}

export const ACHIEVEMENT_PREFIX = 'achievement:'
export const achievementKey = (id: string) => ACHIEVEMENT_PREFIX + id
export const isAchievementKey = (key: unknown): key is string => typeof key === 'string' && key.startsWith(ACHIEVEMENT_PREFIX)

export function readAchievement(key: string, value: unknown): UserAchievement | null {
  if (!isAchievementKey(key) || !value || typeof value !== 'object' || !('definitionId' in value) || !('unlockedAt' in value)) return null
  const { definitionId, unlockedAt } = value
  return typeof definitionId === 'string' && definitionId !== '' && achievementKey(definitionId) === key
    && typeof unlockedAt === 'string' && Number.isFinite(Date.parse(unlockedAt)) ? { definitionId, unlockedAt } : null
}
