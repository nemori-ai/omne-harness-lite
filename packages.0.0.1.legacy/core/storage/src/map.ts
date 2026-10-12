import { StorageUnavailable } from './errors.ts'

/**
 * 把 `StorageUnavailable` 折成调用方契约里的「不可用」字面；其余异常（含 `StorageDefect`、`UniqueViolation`、
 * `ReferenceViolation`、调用方自己的错误）**重抛**——没有 catch-all。
 * 用法：`try { … } catch (e) { return mapStorageError(e, 'storage-unavailable') }`，
 * 唯一冲突与引用违反须在此之前由操作自己按契约分支处理。
 */
export function mapStorageError<F extends string>(
  error: unknown,
  unavailable: F,
): { readonly failure: F } {
  if (error instanceof StorageUnavailable) return { failure: unavailable }
  throw error
}
