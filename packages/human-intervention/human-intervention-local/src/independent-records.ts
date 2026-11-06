import type { OperationRef, WaitRef } from '@omne-harness/human-intervention'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest } from './encoding.ts'
import {
  ActiveWaitSchema,
  IndependentControlSchema,
  InboxEntrySchema,
  type IndependentControl,
} from './independent-schema.ts'

export function waitKey(tenant: OperationRef['tenantRef'], wait: WaitRef) {
  return digest([tenant, wait])
}
function parseCell(value: unknown): unknown {
  if (typeof value !== 'string') throw new TypeError('Invalid independent wait record')
  return JSON.parse(value)
}
export function readControl(port: ReadPort, key: string) {
  const row = port.execute('SELECT record FROM hi_wait_controls WHERE wait_key = ? LIMIT 1', [key])
    .rows[0]
  return row ? IndependentControlSchema.parse(parseCell(row[0])) : undefined
}
export function writeControl(port: ParticipantPort, key: string, state: IndependentControl) {
  port.execute(
    'INSERT INTO hi_wait_controls (wait_key, record) VALUES (?, ?) ON CONFLICT (wait_key) DO UPDATE SET record = excluded.record',
    [key, canonical(state)],
  )
}
export function readActive(port: ReadPort, key: string) {
  const row = port.execute('SELECT record FROM hi_wait_active WHERE wait_key = ? LIMIT 1', [key])
    .rows[0]
  return row ? ActiveWaitSchema.parse(parseCell(row[0])) : undefined
}
export function readInboxEntries(port: ReadPort, key: string) {
  return port
    .execute('SELECT record FROM hi_wait_inbox WHERE wait_key = ? ORDER BY sequence LIMIT 64', [
      key,
    ])
    .rows.map(row => InboxEntrySchema.parse(parseCell(row[0])))
}
