import { createHash, randomBytes } from 'node:crypto'
import { entryValidator } from '../routing/schema.ts'
import type { SnapshotInspectionSession } from '@omne-harness-lite/storage'
import { readSnapshotCenterId } from '../center-id/snapshot.ts'
import { BackupInputFile } from './input.ts'
import { readBackupHeader } from './input-codec.ts'
import { metadataBytes } from './metadata.ts'
import { fileEffects } from './file-io.ts'
import { OnlineMaintenance } from './online.ts'
import { createOfflinePolicy } from './offline.ts'
import type { OnlineMaintenanceOptions, OfflineMaintenanceOptions } from './maintenance-options.ts'
import type { MaintenanceEffects } from './maintenance-ports.ts'

const effects: MaintenanceEffects = {
  validate: (definition, value) => entryValidator(definition)(value),
  files: fileEffects,
  codec: { header: readBackupHeader, bytes: metadataBytes },
  digestFactory() {
    const hash = createHash('sha256')
    return {
      update(bytes) {
        hash.update(bytes)
      },
      hex: () => hash.digest('hex'),
    }
  },
  backupName: () => `${randomBytes(16).toString('hex')}.omne-backup`,
  readCenter: readSnapshotCenterId,
  useBackup: (path, session, work) =>
    fileEffects.useInput(path, session, async physical => {
      const { metadata, dataOffset } = await effects.codec.header(physical)
      return work(
        new BackupInputFile(
          physical,
          metadata,
          dataOffset,
          effects.digestFactory,
          effects.readCenter,
        ),
      )
    }),
}
export function withBackupInput<T>(
  path: string,
  session: SnapshotInspectionSession,
  work: (input: BackupInputFile) => Promise<T>,
): Promise<T> {
  return effects.useBackup(path, session, work)
}
export function createOnlineMaintenance(options: OnlineMaintenanceOptions): OnlineMaintenance {
  return new OnlineMaintenance(options, effects)
}
export function createOfflineMaintenance(options: OfflineMaintenanceOptions) {
  return createOfflinePolicy(options, effects)
}
