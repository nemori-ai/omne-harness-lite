import {
  SnapshotFailure,
  StorageDefect,
  type SnapshotInspectionSession,
} from '@omne-harness-lite/storage'
import { maintenanceFailure, MaintenanceFailure } from './failure.ts'

export function cleanupFailure(error: unknown, location: string): unknown {
  const residual = new SnapshotFailure('unavailable', { cause: error, residual: location })
  if (maintenanceFailure(error) instanceof MaintenanceFailure) return residual
  return new AggregateError([error, residual], 'maintenance resource cleanup failed')
}

/** Local resource location accompanies cleanup failures, without exposing contents. */
export function ownResourceAt(
  session: SnapshotInspectionSession,
  close: () => void | Promise<void>,
  isClosed: () => boolean,
  location: string,
): () => Promise<void> {
  return session.ownResource(async () => {
    try {
      await close()
      if (!isClosed()) throw new StorageDefect('maintenance resource remains open after close')
    } catch (error) {
      throw cleanupFailure(error, location)
    }
  }, isClosed)
}
