import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { entryValidator } from '../routing/schema.ts'
import { MaintenanceFailure } from './failure.ts'

export const MAGIC = Buffer.from('OMNE-CENTER-BACKUP/1\n', 'ascii')
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

function validMetadata(value: unknown): value is Metadata {
  return entryValidator('Metadata')(value)
}
export function metadataTime(value: string): number {
  const parsed = instantFromRfc3339(value)
  if (!('ok' in parsed)) throw new MaintenanceFailure('invalid-backup')
  return parsed.ok
}
export function parseMetadata(value: unknown): Metadata {
  if (
    typeof value === 'object' &&
    value !== null &&
    'byteLength' in value &&
    typeof value.byteLength === 'number' &&
    value.byteLength > MAX_DATA_BYTES
  )
    throw new MaintenanceFailure('capacity')
  if (!validMetadata(value)) throw new MaintenanceFailure('invalid-backup')
  if (metadataTime(value.startedAt) > metadataTime(value.finishedAt))
    throw new MaintenanceFailure('invalid-backup')
  return value
}

/** HT3 canonical output order; parsing accepts any valid field order. */
export function metadataBytes(metadata: Metadata): Buffer {
  const {
    format,
    centerId,
    sourceBuildId,
    migrationNames,
    startedAt,
    finishedAt,
    byteLength,
    sha256,
  } = parseMetadata(metadata)
  const header = Buffer.from(
    JSON.stringify({
      format,
      centerId,
      sourceBuildId,
      migrationNames,
      startedAt,
      finishedAt,
      byteLength,
      sha256,
    }),
    'utf8',
  )
  if (header.length > MAX_HEADER_BYTES) throw new MaintenanceFailure('capacity')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(header.length)
  return Buffer.concat([MAGIC, length, header])
}
