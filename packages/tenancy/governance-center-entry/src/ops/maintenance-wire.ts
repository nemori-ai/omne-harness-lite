import { readJsonText } from '../json.ts'
import { validBackupInput, validBackupStatusInput, validOpsResult } from '../maintenance/inputs.ts'
import { metadataTime, type BackupDescriptor, type Metadata } from '../maintenance/metadata.ts'
import type { MaintenanceResult } from '../maintenance/results.ts'
import { RECEIVE_LIMITS } from './limits.ts'
import { formatInstant } from './wire.ts'

export type OpsRequest =
  | { readonly operation: 'full-health' | 'backup-status'; readonly payload: Record<string, never> }
  | { readonly operation: 'backup'; readonly payload: { readonly onlyIfDue: boolean } }
export type OpsReading =
  | { readonly kind: 'request'; readonly request: OpsRequest }
  | { readonly kind: 'invalid-input' }
  | { readonly kind: 'exceeds-limit' }

/** HT3: opsVersion is independent of the employee protocol version. */
export function readOpsRequest(bytes: Uint8Array): OpsReading {
  const reading = readJsonText(bytes, {
    depth: RECEIVE_LIMITS.jsonDepth,
    members: RECEIVE_LIMITS.objectMembers,
  })
  if (reading.kind === 'exceeds-limit') return { kind: 'exceeds-limit' }
  if (reading.kind !== 'value' || reading.duplicates.length !== 0) return { kind: 'invalid-input' }
  const value = reading.value
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    !('opsVersion' in value) ||
    value.opsVersion !== '1' ||
    !('operation' in value) ||
    !('payload' in value)
  )
    return { kind: 'invalid-input' }
  if (value.operation === 'backup' && validBackupInput(value.payload))
    return { kind: 'request', request: { operation: 'backup', payload: value.payload } }
  if (
    (value.operation === 'full-health' || value.operation === 'backup-status') &&
    validBackupStatusInput(value.payload)
  )
    return { kind: 'request', request: { operation: value.operation, payload: {} } }
  return { kind: 'invalid-input' }
}

function metadataWire(value: Metadata) {
  return {
    format: value.format,
    centerId: value.centerId,
    sourceBuildId: value.sourceBuildId,
    migrationNames: value.migrationNames,
    startedAt: formatInstant(metadataTime(value.startedAt)),
    finishedAt: formatInstant(metadataTime(value.finishedAt)),
    byteLength: value.byteLength,
    sha256: value.sha256,
  }
}
function descriptorWire(value: BackupDescriptor) {
  return { fileName: value.fileName, metadata: metadataWire(value.metadata) }
}

/** Exact field order and canonical instants, without changing the stored envelope. */
export function maintenanceResultBody(result: MaintenanceResult): string {
  switch (result.status) {
    case 'completed':
    case 'not-due':
      return JSON.stringify({ status: result.status, backup: descriptorWire(result.backup) })
    case 'observed':
      return JSON.stringify({
        status: result.status,
        health: result.health,
        latest: result.latest === null ? null : descriptorWire(result.latest),
        invalidCount: result.invalidCount,
      })
    case 'outcome-unknown':
      return JSON.stringify({
        status: result.status,
        fileName: result.fileName,
        targetLocation: result.targetLocation,
      })
    case 'verified':
    case 'restored-isolated':
      throw new Error('offline result reached the ops transport')
    default:
      return JSON.stringify({ status: result.status })
  }
}

/** Local command consumers validate the same accepted reply definitions as the server. */
export function readOpsReplyBody(
  operation: 'full-health' | 'backup' | 'backup-status',
  bytes: Uint8Array,
): unknown {
  const reading = readJsonText(bytes, {
    depth: RECEIVE_LIMITS.jsonDepth,
    members: RECEIVE_LIMITS.objectMembers,
  })
  if (
    reading.kind !== 'value' ||
    reading.duplicates.length !== 0 ||
    !validOpsResult(operation, reading.value)
  )
    throw new Error('invalid-ops-reply')
  return reading.value
}
