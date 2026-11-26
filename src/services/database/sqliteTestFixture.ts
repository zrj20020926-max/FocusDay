import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { NativeDatabaseService } from './NativeDatabaseService'
import { sqliteMigrations } from './migrations/sqliteSchema'

const engine = initSqlJs()

export function upgradeSQLiteFixture(sqlite: Database, target = sqliteMigrations[sqliteMigrations.length - 1].toVersion) {
  const previous = Number(sqlite.exec('PRAGMA user_version')[0].values[0][0])
  for (const migration of sqliteMigrations.filter(item => item.toVersion > previous && item.toVersion <= target)) {
    sqlite.run('BEGIN')
    try {
      for (const statement of migration.statements) sqlite.run(statement)
      sqlite.run(`PRAGMA user_version = ${migration.toVersion}`)
      sqlite.run('COMMIT')
    } catch (error) { sqlite.run('ROLLBACK'); throw error }
  }
}

export async function sqliteTestFixture(snapshot?: Uint8Array) {
  const { Database } = await engine
  const files = new Map<string, Database>()
  const connect = async (name: string) => {
    const sqlite = files.get(name) ?? new Database(snapshot)
    files.set(name, sqlite)
    upgradeSQLiteFixture(sqlite)
    return {
      async beginTransaction() { sqlite.run('BEGIN'); return {} },
      async commitTransaction() { sqlite.run('COMMIT'); return {} },
      async rollbackTransaction() { sqlite.run('ROLLBACK'); return {} },
      async executeSet(statements: { statement: string; values: SqlValue[] }[]) {
        for (const { statement, values } of statements) sqlite.run(statement, values)
        return {}
      },
      async query(statement: string, values?: SqlValue[]) {
        const [result] = sqlite.exec(statement, values)
        return { values: result?.values.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))) ?? [] }
      },
    }
  }
  return {
    files,
    backend: () => new NativeDatabaseService(connect),
    close() { for (const sqlite of files.values()) sqlite.close() },
  }
}

export async function createSQLiteFixtureFile() {
  const { Database } = await engine
  return new Database()
}
