import assert from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeToolCallId,
  decodeToolOperationId,
  decodeToolRevision,
} from '@omne-harness/tool-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  recordKey,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type ToolLedgerStore,
} from './ledger-store.ts'
import type { StoreCaseDependencies } from './testing-ledger-store-types.ts'

export function success<T>(answer: Outcome<T, unknown>, message = 'fixture value is valid'): T {
  assert.ok('ok' in answer, message)
  return answer.ok
}
export const revision = (text: string) => success(decodeToolRevision(text))
export const callId = (text: string) => success(decodeToolCallId(text))
export const operationId = (text: string) => success(decodeToolOperationId(text))
export const hostRecord = (key: string, value: unknown): LedgerRecord<ContentBlock> => ({
  kind: 'host',
  host: { key, value },
})
export function storeDomain(deps: StoreCaseDependencies): LedgerDomain {
  return {
    kind: 'host',
    tenant: deps.tenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
    key: 'conformance',
  }
}
export function batch(
  domain: LedgerDomain,
  records: readonly LedgerRecord<ContentBlock>[],
  expected = '0',
  next = '1',
): LedgerCommitInput<ContentBlock> {
  return {
    domain,
    expected: revision(expected),
    revision: revision(next),
    writes: records.map(record => ({ kind: 'put', record })),
  }
}
export async function complete(store: ToolLedgerStore<ContentBlock>, domain: LedgerDomain) {
  const read = await store.read(domain)
  assert.equal(read.kind, 'complete', 'store read must return a complete snapshot')
  assert.ok(read.kind === 'complete')
  return { ...read, records: sortedRecords(read.records) }
}
export function snapshot(
  read: LedgerRead<ContentBlock>,
  next: string,
  records: readonly LedgerRecord<ContentBlock>[],
  message: string,
): void {
  assert.equal(read.kind, 'complete', message)
  assert.ok(read.kind === 'complete')
  assert.equal(read.revision, next, message)
  assert.deepEqual(sortedRecords(read.records), sortedRecords(records), message)
}
function sortedRecords(records: readonly LedgerRecord<ContentBlock>[]) {
  return [...records].sort((a, b) => recordKey(a).localeCompare(recordKey(b)))
}
export function required<T>(offered: T | undefined, name: string, deps: StoreCaseDependencies): T {
  return offered === undefined ? deps.missing(name) : offered
}
