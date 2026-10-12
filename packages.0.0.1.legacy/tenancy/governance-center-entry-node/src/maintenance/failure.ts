import { SnapshotFailure } from '@omne-harness-lite/storage'

export interface UnknownResult {
  readonly status: 'outcome-unknown'
  readonly fileName: string | null
  readonly targetLocation: string | null
}
export class PublicationUnknown extends Error {
  override readonly name = 'PublicationUnknown'
  constructor(
    readonly result: UnknownResult,
    cause: unknown,
  ) {
    super('maintenance publication durability is unknown', { cause })
  }
}

export type MaintenanceFailureKind =
  | 'invalid-input'
  | 'busy'
  | 'unavailable'
  | 'capacity'
  | 'invalid-backup'
  | 'target-exists'
  | 'cancelled'

export class MaintenanceFailure extends Error {
  override readonly name = 'MaintenanceFailure'
  constructor(
    readonly kind: MaintenanceFailureKind,
    options?: ErrorOptions,
  ) {
    super(`center maintenance: ${kind}`, options)
  }
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Only declared infrastructure failures cross the normal-result boundary. */
export function maintenanceFailure(error: unknown): unknown {
  if (error instanceof MaintenanceFailure) return error
  if (error instanceof SnapshotFailure)
    return new MaintenanceFailure(error.kind === 'invalid-data' ? 'invalid-backup' : error.kind, {
      cause: error,
    })
  if (hasCode(error, 'ENOSPC')) return new MaintenanceFailure('capacity', { cause: error })
  if (
    [
      'ENOENT',
      'EACCES',
      'EPERM',
      'EIO',
      'ENOMEM',
      'EBADF',
      'EBUSY',
      'EROFS',
      'ELOOP',
      'ENOTDIR',
      'EXDEV',
    ].some(code => hasCode(error, code))
  )
    return new MaintenanceFailure('unavailable', { cause: error })
  return error
}

/** A cleanup failure must not replace a programming defect with an ordinary result. */
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
    const closing = maintenanceFailure(error)
    if (
      !outcome.ok &&
      outcome.error instanceof PublicationUnknown &&
      closing instanceof MaintenanceFailure
    )
      throw outcome.error
    if (
      !outcome.ok &&
      (!(maintenanceFailure(outcome.error) instanceof MaintenanceFailure) ||
        !(closing instanceof MaintenanceFailure))
    )
      throw new AggregateError([outcome.error, closing], 'maintenance operation and cleanup failed')
    throw error
  }
  if (!outcome.ok) throw outcome.error
  return outcome.value
}
