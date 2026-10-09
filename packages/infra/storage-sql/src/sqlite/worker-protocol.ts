import type { DatabaseSyncOptions, SQLInputValue, SQLOutputValue } from 'node:sqlite'

/** Private messages for one native connection. No transaction callbacks cross the port. */
export interface SqliteWorkerInput {
  readonly file: string
  readonly options: DatabaseSyncOptions
}

export type SqliteRow = Record<string, SQLOutputValue>
export interface BackupLimits {
  readonly pageSize: number
  readonly maxBytes: number
  readonly walFile: string
}
export type SqliteCommand =
  | { readonly kind: 'exec'; readonly sql: string }
  | {
      readonly kind: 'all' | 'get' | 'run'
      readonly sql: string
      readonly parameters: readonly SQLInputValue[]
      readonly limit?: number
    }
  | { readonly kind: 'rollback' | 'close' }
  | {
      readonly kind: 'backup'
      readonly file: string
      readonly control: SharedArrayBuffer
      readonly limits?: BackupLimits
      readonly progress: boolean
    }

export interface SqliteRequest {
  readonly id: number
  readonly command: SqliteCommand
}

export interface SqliteFailure {
  readonly name: string
  readonly message: string
  readonly stack?: string
  readonly code?: string
  readonly errcode?: number
  readonly errstr?: string
}

export type SqliteReply = {
  readonly id: number
  readonly open: boolean
} & (
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: SqliteFailure }
)

export interface SqliteProgress {
  readonly id: number
  readonly progress: true
}

export function sqliteFailure(error: unknown): SqliteFailure {
  if (!(error instanceof Error)) return { name: 'Error', message: String(error) }
  return {
    name: error.name,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
    ...('errcode' in error && typeof error.errcode === 'number' ? { errcode: error.errcode } : {}),
    ...('errstr' in error && typeof error.errstr === 'string' ? { errstr: error.errstr } : {}),
  }
}

export function restoreSqliteFailure(failure: SqliteFailure): Error {
  return Object.assign(new Error(failure.message), failure)
}
