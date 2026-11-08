import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import { encodeToolMaterial } from '@omne-harness/tool'
import { isObject, oneRow, text, integer, textOf, type JsonObject } from './support.ts'

export type HistoryCleanupFacts = Readonly<{
  intent: 'history-cleanup'
  tenant: string
  call: string
  operation: string
  expected: string
  copy: JsonObject
  publication: JsonObject
  receipt: JsonObject
}>
export function parseHistoryCleanup(value: JsonObject): HistoryCleanupFacts | null {
  const tenant = textOf(value, 'tenant'),
    call = textOf(value, 'call'),
    operation = textOf(value, 'operation'),
    expected = textOf(value, 'expected')
  const copy = value.copy,
    publication = value.publication,
    receipt = value.receipt
  if (
    tenant === null ||
    call === null ||
    operation === null ||
    expected === null ||
    !isObject(copy) ||
    !isObject(publication) ||
    !isObject(receipt) ||
    !['operation', 'kind', 'inputDigest', 'bytes', 'chunks', 'sha256', 'seal'].every(
      key => typeof copy[key] === 'string',
    ) ||
    !isObject(copy.answer)
  )
    return null
  return {
    intent: 'history-cleanup',
    tenant,
    call,
    operation,
    expected,
    copy,
    publication,
    receipt,
  }
}
function same(left: unknown, right: unknown): boolean {
  const a = encodeToolMaterial(left),
    b = encodeToolMaterial(right)
  return 'ok' in a && 'ok' in b && a.ok.fingerprint.digest === b.ok.fingerprint.digest
}
const conflict = (): ParticipantReply => ({ kind: 'conflict', basis: { reason: 'history-copy' } })

/** The publication and original manifest are checked in the transaction that removes each batch. */
export function cleanupHistoricalCopy(
  facts: HistoryCleanupFacts,
  port: ParticipantPort,
): ParticipantReply {
  const call = oneRow(
    port,
    "SELECT revision FROM tl_domain WHERE tenant = ? AND kind = 'call' AND name = ? LIMIT 1",
    [facts.tenant, facts.call],
  )
  if (call === undefined || text(call.revision) !== facts.expected) return conflict()
  const row = oneRow(
    port,
    "SELECT record FROM tl_record WHERE tenant = ? AND kind = 'call' AND name = ? AND key = ? LIMIT 1",
    [facts.tenant, facts.call, `history-migration:${facts.operation}`],
  )
  const record: JsonValue = row === undefined ? null : JSON.parse(text(row.record))
  const migration =
    isObject(record) && record.kind === 'history-migration' ? record.migration : null
  if (
    !isObject(migration) ||
    !isObject(migration.progress) ||
    !['published', 'cleaned'].includes(String(migration.progress.kind)) ||
    !same(migration.progress.receipt, facts.publication) ||
    !Array.isArray(migration.cleanup) ||
    !migration.cleanup.some(copy => same(copy, facts.copy))
  )
    return conflict()
  const key = [facts.tenant, facts.call, String(facts.copy.operation)]
  const manifest = oneRow(
    port,
    'SELECT kind, digest, bytes, chunks, sha256, seal, answer FROM tl_manifest WHERE tenant = ? AND call = ? AND operation = ? LIMIT 1',
    key,
  )
  if (
    manifest === undefined ||
    manifest.kind !== facts.copy.kind ||
    manifest.digest !== facts.copy.inputDigest ||
    integer(manifest.bytes) !== facts.copy.bytes ||
    integer(manifest.chunks) !== facts.copy.chunks ||
    manifest.sha256 !== facts.copy.sha256 ||
    manifest.seal !== facts.copy.seal
  )
    return conflict()
  const previous: JsonValue = JSON.parse(text(manifest.answer))
  let receipt = facts.receipt
  if (isObject(previous) && previous.kind === 'history-copy-cleanup') {
    if (
      previous.operation !== facts.operation ||
      !same(previous.copy, facts.copy) ||
      !same(previous.publication, facts.publication) ||
      !isObject(previous.receipt)
    )
      return conflict()
    receipt = previous.receipt
    if (previous.state === 'deleted')
      return { kind: 'participated', response: { kind: 'deleted', receipt } }
    if (previous.state !== 'deleting') return conflict()
  } else {
    const original = encodeToolMaterial(previous)
    if ('failure' in original || !same(original.ok.fingerprint, facts.copy.answer))
      return conflict()
  }
  port.execute(
    `DELETE FROM tl_chunk WHERE tenant = ? AND call = ? AND operation = ? AND idx IN
    (SELECT idx FROM tl_chunk WHERE tenant = ? AND call = ? AND operation = ? ORDER BY idx LIMIT 128)`,
    [...key, ...key],
  )
  const remaining = oneRow(
    port,
    'SELECT idx FROM tl_chunk WHERE tenant = ? AND call = ? AND operation = ? LIMIT 1',
    key,
  )
  const state = remaining === undefined ? 'deleted' : 'deleting'
  const tombstone = {
    kind: 'history-copy-cleanup',
    operation: facts.operation,
    copy: facts.copy,
    publication: facts.publication,
    state,
    receipt,
  }
  port.execute(
    'UPDATE tl_manifest SET answer = ? WHERE tenant = ? AND call = ? AND operation = ?',
    [JSON.stringify(tombstone), ...key],
  )
  return {
    kind: 'participated',
    response: state === 'deleted' ? { kind: 'deleted', receipt } : { kind: 'pending' },
  }
}
