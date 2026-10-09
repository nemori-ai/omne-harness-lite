import { entryValidator } from '../routing/schema.ts'
import { MaintenanceFailure } from './failure.ts'
import { MAGIC_TEXT, MAX_HEADER_BYTES, MAX_DATA_BYTES, type Metadata } from './backup-data.ts'
import { metadataTime } from './metadata-policy.ts'

export const MAGIC = Buffer.from(MAGIC_TEXT, 'ascii')

function validMetadata(value: unknown): value is Metadata {
  return entryValidator('Metadata')(value)
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
  if (
    value.clockCheckpoint.writtenAt > value.clockCheckpoint.upperBound ||
    metadataTime(value.finishedAt) > value.clockCheckpoint.writtenAt
  )
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
    clockCheckpoint,
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
      clockCheckpoint,
    }),
    'utf8',
  )
  if (header.length > MAX_HEADER_BYTES) throw new MaintenanceFailure('capacity')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(header.length)
  return Buffer.concat([MAGIC, length, header])
}
