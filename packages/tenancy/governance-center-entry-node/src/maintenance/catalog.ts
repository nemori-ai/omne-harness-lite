import { join } from 'node:path'
import type { SnapshotInspectionSession } from '@omne-harness-lite/storage'
import type { SnapshotFormat } from './maintenance-options.ts'
import type { MaintenanceEffects } from './maintenance-ports.ts'
import { maintenanceFailure, MaintenanceFailure, PublicationUnknown } from './failure.ts'
import { BACKUP_FILE_NAME, type BackupDescriptor } from './backup-data.ts'
import { metadataTime } from './metadata-policy.ts'
import { checkCancelled } from './publication.ts'
import type { ObservedBackups } from './results.ts'

async function names(
  path: string,
  session: SnapshotInspectionSession,
  files: MaintenanceEffects['files'],
): Promise<string[]> {
  return files.withNames(path, session, async directory => {
    const candidates: string[] = []
    for (;;) {
      checkCancelled(session)
      const entry = await directory.read()
      if (entry === null) break
      if (!BACKUP_FILE_NAME.test(entry)) continue
      candidates.push(entry)
      if (candidates.length > 256) throw new MaintenanceFailure('capacity')
    }
    return candidates.sort()
  })
}

/** Complete validation and center filtering precede all time/durability decisions. */
export async function observeBackups(
  path: string,
  session: SnapshotInspectionSession,
  format: SnapshotFormat,
  centerId: string,
  now: number,
  effects: MaintenanceEffects,
): Promise<ObservedBackups> {
  return effects.files.useDirectory(path, session, true, async directory => {
    const candidates = await names(path, session, effects.files)
    let latest: BackupDescriptor | null = null
    let invalidCount = 0
    for (const fileName of candidates) {
      checkCancelled(session)
      const source = join(path, fileName)
      if (!(await effects.files.isPlainFile(source))) {
        invalidCount += 1
        continue
      }
      try {
        const descriptor = await effects.useBackup(source, session, async input => {
          const metadata = await input.inspect(session, format)
          if (metadata.centerId !== centerId) return null
          if (metadataTime(metadata.startedAt) > now) throw new MaintenanceFailure('unavailable')
          checkCancelled(session)
          try {
            await input.confirm()
            await directory.confirm()
          } catch (error) {
            if (!(maintenanceFailure(error) instanceof MaintenanceFailure)) throw error
            throw new PublicationUnknown(
              { status: 'outcome-unknown', fileName, targetLocation: null },
              error,
            )
          }
          return { fileName, metadata }
        })
        if (descriptor === null) {
          invalidCount += 1
          continue
        }
        if (
          latest === null ||
          metadataTime(descriptor.metadata.startedAt) > metadataTime(latest.metadata.startedAt) ||
          (metadataTime(descriptor.metadata.startedAt) ===
            metadataTime(latest.metadata.startedAt) &&
            descriptor.fileName < latest.fileName)
        )
          latest = descriptor
      } catch (error) {
        const failure = maintenanceFailure(error)
        if (failure instanceof MaintenanceFailure && failure.kind === 'invalid-backup')
          invalidCount += 1
        else throw error
      }
    }
    await directory.stable()
    return {
      status: 'observed',
      health:
        latest === null
          ? 'missing'
          : now - metadataTime(latest.metadata.startedAt) > 86_400_000
            ? 'overdue'
            : 'current',
      latest,
      invalidCount,
    }
  })
}
