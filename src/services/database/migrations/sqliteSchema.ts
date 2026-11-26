import { tableNames, type TableName } from '../DatabaseTables'

export const sqliteIndexes: Record<TableName, readonly string[]> = {
  tasks: ['status', 'categoryId', 'plannedDate', 'dueDate', 'completedAt', 'sortOrder', 'updatedAt', 'deletedAt', 'syncStatus', '[status+sortOrder]'],
  categories: ['name', 'updatedAt', 'deletedAt', 'syncStatus'],
  focusSessions: ['taskId', 'habitId', 'status', 'mode', 'startTime', 'endTime', 'sourceRecordId', 'createdAt', 'deletedAt', 'syncStatus', '[taskId+endTime]'],
  timerStates: ['updatedAt', 'deletedAt', 'syncStatus'],
  userSettings: ['updatedAt', 'deletedAt', 'syncStatus'],
  syncQueue: ['entityType', 'entityId', 'operation', 'status', 'createdAt', 'updatedAt', 'deletedAt', 'syncStatus', 'nextAttemptAt', '[entityType+entityId]'],
  syncMetadata: ['updatedAt', 'deletedAt', 'syncStatus'],
  syncConflicts: ['entityType', 'entityId', 'winner', 'reason', 'createdAt', 'deletedAt', '[entityType+entityId]'],
  habits: ['status', 'goalType', 'frequency', 'startDate', 'updatedAt', 'deletedAt', 'syncStatus'],
  habitRecords: ['habitId', 'recordDate', 'updatedAt', 'deletedAt', 'syncStatus', '[habitId+recordDate]'],
}

export function indexColumns(index: string): string[] {
  return index.startsWith('[') ? index.slice(1, -1).split('+') : [index]
}

// Keep record JSON identical to the IndexedDB representation. Generated columns let
// SQLite query the same indexes without maintaining a second copy of field values.
export const sqliteMigrations = [
  {
    toVersion: 1,
    statements: tableNames.flatMap(table => {
      const indexes = sqliteIndexes[table]
      const columns = [...new Set(indexes.flatMap(indexColumns))]
      return [
        `CREATE TABLE IF NOT EXISTS "${table}" (id TEXT NOT NULL PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), ${
          columns.map(column => `"${column}" GENERATED ALWAYS AS (json_extract(data, '$.${column}')) VIRTUAL`).join(', ')
        }, CHECK(json_extract(data, '$.id') IS id)${table === 'timerStates' ? ", CHECK(id = 'active')" : ''})`,
        ...indexes.map(index => {
          const fields = indexColumns(index)
          const unique = table === 'habitRecords' && index === '[habitId+recordDate]' ? 'UNIQUE ' : ''
          return `CREATE ${unique}INDEX IF NOT EXISTS "${table}_${fields.join('_')}" ON "${table}" (${fields.map(field => `"${field}"`).join(', ')})`
        }),
      ]
    }),
  },
  {
    toVersion: 2,
    statements: ['CREATE INDEX IF NOT EXISTS "focusSessions_status_endTime" ON "focusSessions" ("status", "endTime")'],
  },
  {
    toVersion: 3,
    statements: [
      'CREATE UNIQUE INDEX IF NOT EXISTS "categories_active_name" ON "categories" (lower("name")) WHERE "deletedAt" IS NULL',
      'CREATE UNIQUE INDEX IF NOT EXISTS "focusSessions_source_unique" ON "focusSessions" ("sourceRecordId") WHERE "sourceRecordId" IS NOT NULL',
    ],
  },
]
