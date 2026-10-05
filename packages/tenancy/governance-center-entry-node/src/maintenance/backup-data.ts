export const MAGIC_TEXT = 'OMNE-CENTER-BACKUP/1\n'
export const MAX_HEADER_BYTES = 16_384
export const MAX_DATA_BYTES = 1_073_741_824
export const CHUNK_BYTES = 65_536
export const BACKUP_FILE_NAME = /^[0-9a-f]{32}\.omne-backup$/

export interface Metadata {
  readonly format: 'omne-center-backup/1'
  readonly centerId: string
  readonly sourceBuildId: string | null
  readonly migrationNames: readonly string[]
  readonly startedAt: string
  readonly finishedAt: string
  readonly byteLength: number
  readonly sha256: string
}
export interface BackupDescriptor {
  readonly fileName: string
  readonly metadata: Metadata
}
