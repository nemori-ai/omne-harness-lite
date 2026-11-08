import { fail, succeed } from '@omne-harness/operation-result'
import type { SealedToolBody, ToolMaterialSeal } from '@omne-harness/tool-contract/provider'
import { bodyOf, type BodyPreparationRecord } from './ledger-body-custody.ts'
import { put, reply, type Snapshot } from './ledger-decider.ts'
import type { LedgerWrite } from './ledger-store.ts'
import {
  appendRecords,
  commit,
  reject,
  metadataSize,
  type WriterDecision,
} from './ledger-writer-decisions.ts'
import type { WriterRecord } from './ledger-writer-records.ts'

type SealingWriter = WriterRecord &
  Readonly<{ state: Extract<WriterRecord['state'], { kind: 'sealing' }> }>

export function prepareWriterAggregate(
  snapshot: Snapshot,
  writer: SealingWriter,
  bodyBytes: string,
  inputDigest: string,
): WriterDecision<BodyPreparationRecord> {
  const state = writer.state
  const current = snapshot.writers.get(writer.id)
  if (current === undefined || current.state.kind === 'failed')
    return reject('closed', 'writer was abandoned')
  const known = snapshot.bodyPreparations.get(state.operation)
  if (known !== undefined)
    return known.inputDigest === inputDigest
      ? reply(succeed(succeed(known)))
      : reject('conflict', 'aggregate preparation changed')
  const body: BodyPreparationRecord = {
    operation: state.operation,
    start: writer.start,
    source: state.source,
    inputDigest: inputDigest,
    bodyBytes: bodyBytes,
    policy: writer.policy,
    state: { kind: 'preparing' },
  }
  return commit(body, [put({ kind: 'body-preparation', body })])
}

export function confirmWriterSeal(
  snapshot: Snapshot,
  writer: SealingWriter,
  prepared: BodyPreparationRecord,
  sealed: ToolMaterialSeal,
): WriterDecision<SealedToolBody> {
  const state = writer.state
  const current = snapshot.writers.get(writer.id)
  const scope = snapshot.writerScopes.get(writer.start.operation)
  if (current === undefined || scope === undefined || current.state.kind === 'failed')
    return reject('closed', 'writer was abandoned')
  if (current.state.kind === 'sealed') return reply(succeed(succeed(current.state.body)))
  if (current.state.kind !== 'sealing' || current.state.operation !== state.operation)
    return reject('conflict', 'seal responsibility changed')
  const preparation: BodyPreparationRecord = {
    ...prepared,
    state: { kind: 'sealed', seal: sealed },
  }
  const body = bodyOf(preparation)
  if ('failure' in body) return reply(body)
  const next: WriterRecord = { ...current, state: { ...state, kind: 'sealed', body: body.ok } }
  const size = metadataSize(next)
  const total = scope.metadataBytes - current.metadataBytes + size
  if (total > scope.maxMetadataBytes)
    return reply(
      succeed(
        fail({
          kind: 'unavailable',
          operation: state.operation,
          reason: 'sealed body receipt exceeds metadata budget; preparation retained',
        }),
      ),
    )
  const writes: LedgerWrite[] = [
    put({ kind: 'body-preparation', body: preparation }),
    put({ kind: 'body-writer', writer: { ...next, metadataBytes: size } }),
    put({ kind: 'body-writer-scope', scope: { ...scope, metadataBytes: total } }),
  ]
  for (const append of appendRecords(snapshot, writer.id)) {
    if (append.state.kind !== 'retained') return reject('busy', 'not every fragment is retained')
    writes.push(
      { kind: 'delete', key: `material-use:preparation:${append.operation}` },
      put({
        kind: 'material-cleanup',
        cleanup: {
          material: append.state.seal.material,
          writeOperation: append.operation,
          basis: sealed.evidence,
        },
      }),
    )
  }
  return commit(body.ok, writes)
}
