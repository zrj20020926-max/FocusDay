import type { SQLiteDBConnection, capSQLiteSet } from '@capacitor-community/sqlite'
import type { Collection, Index, IndexKey, RecordTable, Row, TableName } from './DatabaseTables'
import { indexColumns, sqliteIndexes } from './migrations/sqliteSchema'

type Connection = Pick<SQLiteDBConnection, 'query' | 'executeSet'>
type Predicate<T> = (row: T) => boolean
type Value = string | number
interface Selection {
  where?: string
  values?: Value[]
  order?: string[]
}

export interface SQLiteExecutor {
  read<T>(action: (connection: Connection) => Promise<T>): Promise<T>
  write<T>(table: TableName, action: (connection: Connection) => Promise<T>): Promise<T>
}

export class SQLiteTable<K extends TableName, T extends Row<K> = Row<K>> implements RecordTable<T> {
  constructor(private readonly table: K, private readonly executor: SQLiteExecutor) {}

  private async select(connection: Connection, selection: Selection = {}, limit = ''): Promise<T[]> {
    const { where, values, order } = selection
    const result = await connection.query(`SELECT data FROM "${this.table}"${where ? ' WHERE ' + where : ''}${
      order ? ' ORDER BY ' + order.join(', ') + ', id' : ''}${limit}`, values)
    return (result.values ?? []).map(row => JSON.parse(row.data) as T)
  }

  private async execute(connection: Connection, statements: capSQLiteSet[]) {
    if (!statements.length) return
    try { await connection.executeSet(statements, false) }
    catch (error) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error)
      if (/constraint/i.test(message)) {
        const constraint = Object.assign(new Error('SQLite 唯一约束或记录校验失败'), { cause: error })
        constraint.name = 'ConstraintError'
        throw constraint
      }
      throw error
    }
  }

  private insert(row: T, upsert = true): capSQLiteSet {
    return { statement: `INSERT INTO "${this.table}" (id, data) VALUES (?, ?)${upsert ? ' ON CONFLICT(id) DO UPDATE SET data = excluded.data' : ''}`,
      values: [row.id, JSON.stringify(row)] }
  }

  private remove(id: string): capSQLiteSet {
    return { statement: `DELETE FROM "${this.table}" WHERE id = ?`, values: [id] }
  }

  async get(id: string) { return this.where('id').equals(id).first() }
  async bulkGet(ids: string[]) {
    const rows = new Map((await this.where('id').anyOf(ids).toArray()).map(row => [row.id, row]))
    return ids.map(id => rows.get(id))
  }
  async add(row: T) {
    await this.executor.write(this.table, connection => this.execute(connection, [this.insert(row, false)]))
    return row.id
  }
  put(row: T) { return this.bulkPut([row]) }
  async bulkPut(rows: T[]) {
    if (rows.length) await this.executor.write(this.table, connection => this.execute(connection, rows.map(row => this.insert(row))))
    return rows[rows.length - 1]?.id ?? ''
  }
  update(id: string, changes: Partial<T>) { return this.where('id').equals(id).modify(changes) }
  delete(id: string) { return this.bulkDelete([id]) }
  async bulkDelete(ids: string[]) {
    if (ids.length) await this.executor.write(this.table, connection => this.execute(connection, ids.map(id => this.remove(id))))
  }
  clear() { return this.executor.write(this.table, connection => this.execute(connection, [{ statement: `DELETE FROM "${this.table}"`, values: [] }])) }
  count() { return this.collection().count() }
  toArray() { return this.executor.read(connection => this.select(connection)) }
  filter(predicate: Predicate<T>) { return this.collection({}, [predicate]) }

  private columns(index: string) {
    if (index !== 'id' && !sqliteIndexes[this.table].includes(index)) throw new Error(`SQLite 索引不存在：${this.table}.${index}`)
    return indexColumns(index).map(column => `"${column}"`)
  }
  orderBy(index: string) {
    const order = this.columns(index)
    return this.collection({ where: order.map(column => `${column} IS NOT NULL`).join(' AND '), order })
  }
  where(index: string): Index<T> {
    const columns = this.columns(index)
    const target = columns.length === 1 ? columns[0] : `(${columns.join(', ')})`
    const placeholder = columns.length === 1 ? '?' : '(' + columns.map(() => '?').join(', ') + ')'
    const valuesOf = (key: IndexKey) => Array.isArray(key) ? key : [key]
    const compare = (operator: string, key: IndexKey) => this.collection({ where: `${target} ${operator} ${placeholder}`, values: valuesOf(key), order: columns })
    return {
      equals: key => compare('=', key),
      above: key => compare('>', key),
      between: (low, high, includeLow = true, includeHigh = false) => this.collection({
        where: `${target} ${includeLow ? '>=' : '>'} ${placeholder} AND ${target} ${includeHigh ? '<=' : '<'} ${placeholder}`,
        values: [...valuesOf(low), ...valuesOf(high)], order: columns,
      }),
      anyOf: keys => {
        const fields = columns.length === 1 ? 'value' : columns.map((_, i) => `json_extract(value, '$[${i}]')`).join(', ')
        return this.collection({ where: `${target} IN (SELECT ${fields} FROM json_each(?))`, values: [JSON.stringify(keys)], order: columns })
      },
      startsWith: prefix => this.collection({
        where: `${target} >= ? AND substr(${target}, 1, length(?)) = ?`, values: [prefix, prefix, prefix], order: columns,
      }),
    }
  }

  private collection(selection: Selection = {}, predicates: Predicate<T>[] = []): Collection<T> {
    const filter = (rows: T[]) => predicates.length ? rows.filter(row => predicates.every(predicate => predicate(row))) : rows
    const read = async (connection: Connection) => filter(await this.select(connection, selection))
    const append = (predicate: Predicate<T>) => this.collection(selection, [...predicates, predicate])
    return {
      toArray: () => this.executor.read(read),
      first: () => this.executor.read(async connection => (
        filter(await this.select(connection, selection, predicates.length ? '' : ' LIMIT 1'))
      )[0]),
      count: () => this.executor.read(async connection => {
        if (predicates.length) return (await read(connection)).length
        const result = await connection.query(`SELECT count(*) AS total FROM "${this.table}"${selection.where ? ' WHERE ' + selection.where : ''}`, selection.values)
        return Number(result.values?.[0]?.total ?? 0)
      }),
      and: append,
      filter: append,
      delete: () => this.executor.write(this.table, async connection => {
        const rows = await read(connection)
        await this.execute(connection, rows.map(row => this.remove(row.id)))
        return rows.length
      }),
      modify: changes => this.executor.write(this.table, async connection => {
        const rows = await read(connection)
        await this.execute(connection, rows.map(row => this.insert({ ...row, ...changes })))
        return rows.length
      }),
    }
  }
}
