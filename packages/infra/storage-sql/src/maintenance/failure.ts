import { SnapshotFailure, StorageDefect } from '@omne-harness-lite/storage'

export function physicalFailure(error: unknown): unknown {
  if (error instanceof SnapshotFailure || error instanceof StorageDefect) return error
  if (error instanceof Error && 'errcode' in error && typeof error.errcode === 'number') {
    const primary = error.errcode & 0xff
    if (primary === 11 || primary === 26)
      return new SnapshotFailure('invalid-data', { cause: error })
    if (primary === 13) return new SnapshotFailure('capacity', { cause: error })
    if ([5, 6, 7, 10, 14].includes(primary))
      return new SnapshotFailure('unavailable', { cause: error })
  }
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'ENOENT',
      'EACCES',
      'EPERM',
      'EIO',
      'ENOMEM',
      'EBADF',
      'EBUSY',
      'EROFS',
      'EEXIST',
      'ENOTDIR',
      'EISDIR',
      'ELOOP',
      'ENAMETOOLONG',
      'EMFILE',
      'ENFILE',
    ].includes(error.code)
  )
    return new SnapshotFailure('unavailable', { cause: error })
  if (error instanceof Error && 'code' in error && error.code === 'ENOSPC')
    return new SnapshotFailure('capacity', { cause: error })
  return error
}

/** Cleanup can replace an ordinary refusal, but must never erase an internal defect. */
export function combineFailure(primary: unknown, cleanup: unknown): unknown {
  if (primary === cleanup) return primary
  const first = physicalFailure(primary)
  const second = physicalFailure(cleanup)
  if (first instanceof SnapshotFailure && second instanceof SnapshotFailure) return second
  return new AggregateError([first, second], 'maintenance operation and cleanup failed')
}

/** Both branches settle before their owner can release resources. */
export async function withCleanup<T>(
  work: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  try {
    outcome = { ok: true, value: await work() }
  } catch (error) {
    outcome = { ok: false, error }
  }
  try {
    await cleanup()
  } catch (error) {
    throw outcome.ok ? error : combineFailure(outcome.error, error)
  }
  if (!outcome.ok) throw outcome.error
  return outcome.value
}
