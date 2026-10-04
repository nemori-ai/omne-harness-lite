import { entryValidator } from '../routing/schema.ts'

export interface BackupInput {
  readonly onlyIfDue: boolean
}
export function validBackupInput(value: unknown): value is BackupInput {
  return entryValidator('BackupInput')(value)
}
export function validBackupStatusInput(value: unknown): boolean {
  return entryValidator('BackupStatusInput')(value)
}
export function validMaintenanceLocation(value: unknown): value is string {
  return entryValidator('MaintenanceLocation')(value)
}
export function validOpsResult(
  operation: 'full-health' | 'backup' | 'backup-status',
  value: unknown,
): boolean {
  return entryValidator(
    operation === 'full-health'
      ? 'FullHealthReply'
      : operation === 'backup'
        ? 'BackupResult'
        : 'BackupStatusResult',
  )(value)
}
