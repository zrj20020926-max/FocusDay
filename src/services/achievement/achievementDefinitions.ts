import type { AchievementDefinition } from '../../types/achievement'

export const ACHIEVEMENTS = [
  { id: 'first-focus', title: '初次专注', description: '完成首次有效专注', icon: 'spark', tone: 'sage', metric: 'sessions', target: 1, unit: '次' },
  { id: 'focus-streak-7', title: '坚持不懈', description: '连续 7 个本地日期都有有效专注', icon: 'flame', tone: 'amber', metric: 'longestStreak', target: 7, unit: '天' },
  { id: 'focus-hours-100', title: '时间大师', description: '累计有效专注 100 小时', icon: 'clock', tone: 'blue', metric: 'focusHours', target: 100, unit: '小时' },
  { id: 'tasks-100', title: '行动派', description: '累计完成 100 项不同的任务', icon: 'check', tone: 'sage', metric: 'completedTasks', target: 100, unit: '项' },
  { id: 'morning-10', title: '早起达人', description: '在 05:00–10:00 完成 10 次有效专注', icon: 'sun', tone: 'amber', metric: 'morningSessions', target: 10, unit: '次' },
  { id: 'night-10', title: '深夜学者', description: '在 22:00–次日 05:00 完成 10 次有效专注', icon: 'moon', tone: 'plum', metric: 'nightSessions', target: 10, unit: '次' },
] as const satisfies readonly AchievementDefinition[]
