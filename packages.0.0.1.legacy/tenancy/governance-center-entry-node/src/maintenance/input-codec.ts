import { readJsonText } from '../json.ts'
import { MaintenanceFailure } from './failure.ts'
import { MAX_DATA_BYTES, MAX_HEADER_BYTES } from './backup-data.ts'
import { MAGIC, parseMetadata } from './metadata.ts'
import type { BackupCodec } from './maintenance-ports.ts'

export const readBackupHeader: BackupCodec['header'] = async input => {
  if (input.size > MAGIC.length + 4 + MAX_HEADER_BYTES + MAX_DATA_BYTES)
    throw new MaintenanceFailure('capacity')
  if (input.size < MAGIC.length + 5) throw new MaintenanceFailure('invalid-backup')
  const prefix = Buffer.from(await input.read(0, MAGIC.length + 4))
  if (!prefix.subarray(0, MAGIC.length).equals(MAGIC))
    throw new MaintenanceFailure('invalid-backup')
  const headerLength = prefix.readUInt32BE(MAGIC.length)
  if (headerLength > MAX_HEADER_BYTES) throw new MaintenanceFailure('capacity')
  const dataOffset = MAGIC.length + 4 + headerLength
  if (headerLength < 1 || dataOffset >= input.size) throw new MaintenanceFailure('invalid-backup')
  const header = readJsonText(await input.read(MAGIC.length + 4, headerLength), {
    depth: 8,
    members: 16,
  })
  if (header.kind !== 'value' || header.duplicates.length !== 0)
    throw new MaintenanceFailure('invalid-backup')
  const metadata = parseMetadata(header.value)
  if (input.size !== dataOffset + metadata.byteLength)
    throw new MaintenanceFailure('invalid-backup')
  return { metadata, dataOffset }
}
