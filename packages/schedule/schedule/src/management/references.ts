import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import {
  ScheduleOperationRefSchema,
  type ScheduleDefinition,
  type ScheduleId,
  type ScheduleOperationAddress,
  type ScheduleOwner,
} from '@omne-harness/schedule-contract'
import type { RecoveryScope } from './types.ts'

export function managementValueEqual(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right)
}

function digest(value: unknown): string {
  const encoded = canonicalize(value)
  if (encoded === undefined) throw new TypeError('Management reference requires JSON data')
  return createHash('sha256').update(encoded, 'utf8').digest('hex')
}

export function createScheduleManagementOperationRef(
  scope: RecoveryScope,
  address: ScheduleOperationAddress,
) {
  const hash = digest(['omne.schedule.management.operation/1', scope, address])
  const variant = ((Number.parseInt(hash.slice(16, 17), 16) & 3) | 8).toString(16)
  return ScheduleOperationRefSchema.parse(
    `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
  )
}

export function createScheduleDefinitionRef(
  input: Readonly<{
    owner: ScheduleOwner
    scheduleId: ScheduleId
    definitionRevision: number
    definition: ScheduleDefinition
  }>,
): string {
  return digest([
    'omne.schedule.definition/1',
    input.owner,
    input.scheduleId,
    input.definitionRevision,
    input.definition,
  ])
}

export function createScheduleRecordRef(
  input: Readonly<{
    owner: ScheduleOwner
    scheduleId: ScheduleId
    revision: number
  }>,
): string {
  return digest(['omne.schedule.record/1', input.owner, input.scheduleId, input.revision])
}
