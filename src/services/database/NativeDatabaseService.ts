import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { DatabaseObserver, DatabaseTables, TableName } from './DatabaseTables'
import { SQLiteTable, type SQLiteExecutor } from './SQLiteTable'
import { sqliteMigrations } from './migrations/sqliteSchema'

type Connection = Pick<SQLiteDBConnection, 'query' | 'executeSet' | 'beginTransaction' | 'commitTransaction' | 'rollbackTransaction'> &
  Partial<Pick<SQLiteDBConnection, 'close'>>
const CONNECTION_KEY = 'focus-day.sqlite-connection'

export function sqliteName(owner: string | null): string {
  if (!owner) return 'focus_day_guest'
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(owner)) throw new Error('本地账号标识无效')
  return 'focus_day_user_' + owner.replace(/-/g, '').toLowerCase()
}

async function openSQLite(name: string): Promise<Connection> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  // A manual reload can discard JavaScript between BEGIN and COMMIT while the
  // native bridge survives. Roll back that abandoned transaction before closing.
  const previous = sessionStorage.getItem(CONNECTION_KEY)
  if (previous && /^focus_day_(guest|user_[a-f0-9]{32})$/.test(previous)) {
    const options = { database: previous, readonly: false }
    const state = await CapacitorSQLite.isTransactionActive(options).catch(() => null)
    if (state?.result) await CapacitorSQLite.rollbackTransaction(options)
  }
  await sqlite.checkConnectionsConsistency()
  sessionStorage.setItem(CONNECTION_KEY, name)
  await sqlite.addUpgradeStatement(name, sqliteMigrations)
  const version = sqliteMigrations[sqliteMigrations.length - 1].toVersion
  const connection = await sqlite.createConnection(name, false, 'no-encryption', version, false)
  try {
    await connection.open()
    return connection
  } catch (error) {
    await sqlite.closeConnection(name, false).catch(() => undefined)
    throw error
  }
}

export class NativeDatabaseService {
  private connection: Promise<Connection> | null = null
  private pending = Promise.resolve<unknown>(undefined)
  private scope: { owner: string | null; name: string } | null = null
  private closing = false
  private readonly changes = new EventTarget()

  constructor(private readonly connect = openSQLite) {}

  get owner() { return this.scope?.owner }

  selectOwner(owner: string | null) {
    if (this.scope && this.scope.owner !== owner) throw new Error('切换账号时必须重新加载本地数据空间')
    this.scope = { owner, name: sqliteName(owner) }
  }

  initialize(): Promise<Connection> {
    if (!this.scope) return Promise.reject(new Error('本地账号空间尚未初始化'))
    const { name } = this.scope
    this.connection ??= this.connect(name).catch(error => {
      this.connection = null
      throw Object.assign(new Error('SQLite 数据库初始化或升级失败'), { cause: error })
    })
    return this.connection
  }

  readonly tables = this.makeTables({
    read: query => this.use(false, connection => query(connection)),
    write: async (table, write) => {
      const result = await this.use(true, write)
      this.publish(new Set([table]))
      return result
    },
  })

  private makeTables(executor: SQLiteExecutor): DatabaseTables {
    return {
      tasks: new SQLiteTable('tasks', executor),
      categories: new SQLiteTable('categories', executor),
      focusSessions: new SQLiteTable('focusSessions', executor),
      timerStates: new SQLiteTable('timerStates', executor),
      userSettings: new SQLiteTable('userSettings', executor),
      syncQueue: new SQLiteTable('syncQueue', executor),
      syncMetadata: new SQLiteTable('syncMetadata', executor),
      syncConflicts: new SQLiteTable('syncConflicts', executor),
      habits: new SQLiteTable('habits', executor),
      habitRecords: new SQLiteTable('habitRecords', executor),
    }
  }

  private use<T>(write: boolean, body: (connection: Connection) => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('正在关闭当前 SQLite 数据空间'))
    const operation = this.pending.then(async () => {
      const connection = await this.initialize()
      if (!write) return body(connection)
      await connection.beginTransaction()
      try {
        const value = await body(connection)
        await connection.commitTransaction()
        return value
      } catch (error) {
        try { await connection.rollbackTransaction() }
        catch (rollbackError) {
          this.connection = null
          throw Object.assign(new Error('SQLite 事务回滚失败，请重新打开应用'), { cause: rollbackError })
        }
        throw error
      }
    })
    this.pending = operation.catch(() => undefined)
    return operation
  }

  async closeForReload(): Promise<void> {
    this.closing = true
    await this.pending
    const connection = await this.connection
    await connection?.close?.()
    this.connection = null
  }

  async transaction<T>(body: (tables: DatabaseTables) => Promise<T>, writable = true): Promise<T> {
    const changed = new Set<TableName>()
    const result = await this.use(writable, async connection => {
      let tail = Promise.resolve<unknown>(undefined)
      let open = true
      const serialize = <T>(operation: (connection: Connection) => Promise<T>): Promise<T> => {
        if (!open) return Promise.reject(new Error('SQLite 事务已结束'))
        const next = tail.then(() => operation(connection))
        tail = next
        void next.catch(() => undefined)
        return next
      }
      const tables = this.makeTables({
        read: serialize,
        write: (table, operation) => {
          if (!writable) return Promise.reject(new Error('不能修改只读 SQLite 事务'))
          changed.add(table)
          return serialize(operation)
        },
      })
      try { return await body(tables) }
      finally { open = false; await tail }
    })
    this.publish(changed)
    return result
  }

  private publish(changed: Set<TableName>) {
    if (changed.size) this.changes.dispatchEvent(new CustomEvent('commit', { detail: changed }))
  }

  observe<T>(tables: TableName[], query: () => Promise<T>) {
    return {
      subscribe: (observer: DatabaseObserver<T>) => {
        const { next, error: onError } = typeof observer === 'function' ? { next: observer, error: undefined } : observer
        let active = true
        let revision = 0
        const run = async () => {
          const current = ++revision
          try {
            const result = await query()
            if (active && current === revision) next(result)
          } catch (error) { if (active && current === revision) onError?.(error) }
        }
        const changed = (event: Event) => {
          if (tables.some(table => (event as CustomEvent<Set<TableName>>).detail.has(table))) void run()
        }
        this.changes.addEventListener('commit', changed)
        void run()
        return { unsubscribe: () => { active = false; this.changes.removeEventListener('commit', changed) } }
      },
    }
  }
}
