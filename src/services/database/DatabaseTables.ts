import type { DatabaseExport } from '../../types/database'

export type TableName = keyof DatabaseExport['data']
export type Row<K extends TableName> = DatabaseExport['data'][K][number]
type KeyPart = string | number
export type IndexKey = KeyPart | KeyPart[]

export interface Collection<T> {
  toArray(): Promise<T[]>
  first(): Promise<T | undefined>
  count(): Promise<number>
  filter(predicate: (row: T) => boolean): Collection<T>
  and(predicate: (row: T) => boolean): Collection<T>
  modify(changes: Partial<T>): Promise<number>
  delete(): Promise<number>
}

export interface Index<T> {
  equals(key: IndexKey): Collection<T>
  above(key: IndexKey): Collection<T>
  between(low: IndexKey, high: IndexKey, includeLow?: boolean, includeHigh?: boolean): Collection<T>
  anyOf(keys: IndexKey[]): Collection<T>
  startsWith(prefix: string): Collection<T>
}

export interface RecordTable<T extends { id: string }> {
  get(id: string): Promise<T | undefined>
  bulkGet(ids: string[]): Promise<(T | undefined)[]>
  put(row: T): Promise<string>
  bulkPut(rows: T[]): Promise<string>
  add(row: T): Promise<string>
  update(id: T['id'], changes: Partial<T>): Promise<number>
  delete(id: string): Promise<void>
  bulkDelete(ids: string[]): Promise<void>
  clear(): Promise<void>
  count(): Promise<number>
  toArray(): Promise<T[]>
  filter(predicate: (row: T) => boolean): Collection<T>
  where(index: string): Index<T>
  orderBy(index: string): Collection<T>
}

export type DatabaseTables = { [K in TableName]: RecordTable<Row<K>> }
export type DatabaseObserver<T> = ((value: T) => void) | { next: (value: T) => void; error?: (error: unknown) => void }

export const tableNames = [
  'tasks', 'categories', 'focusSessions', 'timerStates', 'userSettings',
  'syncQueue', 'syncMetadata', 'syncConflicts', 'habits', 'habitRecords',
] as const satisfies readonly TableName[]
