import type { RequestRef } from '@omne-harness/human-intervention'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical } from './encoding.ts'
import { RequestRecordSchema, type RequestRecord } from './request-schema.ts'

export function readRequest(port: ReadPort, ref: RequestRef): RequestRecord | undefined {
  const row = port.execute(
    'SELECT record FROM hi_requests WHERE tenant_ref = ? AND request_id = ? LIMIT 1',
    [ref.tenantRef, ref.requestId],
  ).rows[0]
  if (!row) return undefined
  if (typeof row[0] !== 'string') throw new TypeError('Invalid HITL request record')
  return RequestRecordSchema.parse(JSON.parse(row[0]))
}
export function writeRequest(port: ParticipantPort, request: RequestRecord) {
  port.execute(
    'INSERT INTO hi_requests (tenant_ref, request_id, record) VALUES (?, ?, ?) ON CONFLICT (tenant_ref, request_id) DO UPDATE SET record = excluded.record',
    [request.ref.tenantRef, request.ref.requestId, canonical(request)],
  )
}
