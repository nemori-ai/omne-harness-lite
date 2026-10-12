import { cleanupFailure } from './resources.ts'
import { SnapshotFailure, type SnapshotInspectionSession } from '@omne-harness-lite/storage'
import {
  hasCode,
  MaintenanceFailure,
  maintenanceFailure,
  PublicationUnknown,
  type UnknownResult,
} from './failure.ts'
import type { MaintenanceReporter } from './maintenance-options.ts'
import type { Directory, FileEffects, Output } from './maintenance-ports.ts'

export function checkCancelled(session: SnapshotInspectionSession): void {
  if (session.cancelled) throw new SnapshotFailure('cancelled')
}

export async function withTemporaryOutput<T>(
  workRoot: string,
  session: SnapshotInspectionSession,
  report: MaintenanceReporter,
  fn: (output: Output & { markPublished(path: string): void }) => Promise<T>,
  files: FileEffects,
): Promise<T> {
  checkCancelled(session)
  let publishedLocation: string | null = null
  return files.useTemporary(
    workRoot,
    session,
    output =>
      fn({
        ...output,
        markPublished(value) {
          publishedLocation = value
        },
      }),
    (error, path) => {
      report({ event: 'maintenance-residual', temporaryLocation: path, publishedLocation })
      throw cleanupFailure(error, path)
    },
  )
}

/** Publication is exclusive and never retried or undone by this function. */
export async function publishOutput(
  temporary: string,
  destination: string,
  directory: Directory,
  session: SnapshotInspectionSession,
  unknown: UnknownResult,
  markPublished: (path: string) => void,
  files: FileEffects,
  confirmParent?: () => Promise<void>,
): Promise<void> {
  checkCancelled(session)
  await directory.stable()
  checkCancelled(session)
  try {
    await files.link(temporary, destination)
  } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new MaintenanceFailure('target-exists', { cause: error })
    throw error
  }
  markPublished(destination)
  // Once visible, cancellation must not change the outcome to cancelled or delete it.
  try {
    await directory.confirm()
    await confirmParent?.()
  } catch (error) {
    if (!(maintenanceFailure(error) instanceof MaintenanceFailure)) throw error
    throw new PublicationUnknown(unknown, error)
  }
}
