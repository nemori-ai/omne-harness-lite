// node:sqlite 错误 → 协议四型。取证（Node 24.18，2026-09-22）：错误对象 { code: 'ERR_SQLITE_ERROR', errcode, errstr, message }；
// 句柄已关闭时 code 'ERR_INVALID_STATE'。扩展结果码：UNIQUE 2067、PRIMARYKEY 1555、CHECK 275、NOTNULL 1299、
// FOREIGNKEY 787（INSERT/UPDATE 向）、1811（DELETE 向，sqlite 以 CONSTRAINT_TRIGGER 报出）、BUSY 5、READONLY 8、
// IOERR 10、CANTOPEN 14；本提供者按触发语句种类分外键两向（协议 P-10），错误码只作旁证。
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
} from '@omne-harness-lite/storage'

export const SQLITE_BUSY = 5
const SQLITE_READONLY = 8
const SQLITE_IOERR = 10
const SQLITE_CANTOPEN = 14
const SQLITE_CONSTRAINT_UNIQUE = 2067
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555
const SQLITE_CONSTRAINT_FOREIGNKEY = 787
const SQLITE_CONSTRAINT_TRIGGER = 1811

export type StatementKind = 'select' | 'insert' | 'update' | 'delete' | 'other'

export interface SqliteErrorShape {
  readonly code?: unknown
  readonly errcode?: unknown
  readonly message?: unknown
}

export function isSqliteBusy(error: unknown): boolean {
  return isShape(error) && error.code === 'ERR_SQLITE_ERROR' && error.errcode === SQLITE_BUSY
}

function isShape(error: unknown): error is SqliteErrorShape {
  return typeof error === 'object' && error !== null
}

/** 把一条语句抛出的驱动错误翻成协议类型；`resolveUnique` 把报文里的列元组映射回约束名（P-11）。 */
export function translateSqliteError(
  error: unknown,
  kind: StatementKind,
  resolveUnique: (message: string) => string | undefined,
  handle: 'write' | 'read' = 'write',
): Error {
  if (!isShape(error))
    return new StorageDefect('non-error thrown by sqlite driver', { cause: error })
  if (error.code === 'ERR_INVALID_STATE')
    return new StorageUnavailable('sqlite handle is closed', { cause: error })
  if (error.code !== 'ERR_SQLITE_ERROR')
    return new StorageDefect('unexpected sqlite driver error', { cause: error })
  const errcode = typeof error.errcode === 'number' ? error.errcode : -1
  const primary = errcode & 0xff
  const message = typeof error.message === 'string' ? error.message : ''
  switch (errcode) {
    case SQLITE_CONSTRAINT_UNIQUE:
    case SQLITE_CONSTRAINT_PRIMARYKEY: {
      const constraint = resolveUnique(message)
      if (constraint === undefined) {
        return new StorageDefect(
          `unique constraint could not be mapped to a migration name: ${message}`,
          { cause: error },
        )
      }
      return new UniqueViolation(constraint, { cause: error })
    }
    case SQLITE_CONSTRAINT_FOREIGNKEY:
    case SQLITE_CONSTRAINT_TRIGGER:
      if (!message.includes('FOREIGN KEY')) break
      return new ReferenceViolation(kind === 'delete' ? 'delete-restricted' : 'missing-target', {
        cause: error,
      })
    case SQLITE_BUSY:
      return new StorageUnavailable('sqlite database is locked', { cause: error })
    case SQLITE_READONLY:
      // 读句柄（query_only=ON）上写是调用方误用；写句柄撞只读（数据目录只读挂载等）重试也不会变——两者都是缺陷
      return new StorageDefect(
        handle === 'read'
          ? 'write statement in a read-only transaction'
          : 'sqlite database is read-only',
        { cause: error },
      )
    default:
      break
  }
  if (primary === SQLITE_IOERR || primary === SQLITE_CANTOPEN || primary === SQLITE_BUSY) {
    return new StorageUnavailable(`sqlite i/o failure: ${message}`, { cause: error })
  }
  return new StorageDefect(`sqlite statement failed: ${message}`, { cause: error })
}
