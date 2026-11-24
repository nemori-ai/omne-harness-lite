import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import {
  ScheduleJobIdSchema,
  ScheduleOperationRefSchema,
  ScheduleReceiptIdSchema,
  type ScheduleId,
  type ScheduleInstant,
  type ScheduleOwner,
} from '@omne-harness/schedule-contract'

function uuid(value: unknown): string {
  const hash = createHash('sha256')
    .update(String(canonicalize(value)), 'utf8')
    .digest('hex')
  const variant = ((Number.parseInt(hash.slice(16, 17), 16) & 3) | 8).toString(16)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

/** One slot of one schedule has one admission: its operation, receipt and Job have the same names on every try. */
export function admissionRefs(
  owner: ScheduleOwner,
  scheduleId: ScheduleId,
  slotAt: ScheduleInstant,
) {
  const at = ['omne.schedule.dispatch.admission/1', owner, scheduleId, slotAt]
  return {
    operationRef: ScheduleOperationRefSchema.parse(uuid([...at, 'operation'])),
    receiptId: ScheduleReceiptIdSchema.parse(uuid([...at, 'receipt'])),
    jobId: ScheduleJobIdSchema.parse(uuid([...at, 'job'])),
  }
}
