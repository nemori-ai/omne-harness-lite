import type { ContentBlock } from '@omne-harness/content-block'
import type { DurableEvidence, ToolRenderedResult } from '@omne-harness/tool-contract'
import type { ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import { put, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { LedgerWrite } from './ledger-store.ts'
import { appendRecords, metadataSize } from './ledger-writer-decisions.ts'
import type { WriterAppendRecord, WriterRecord } from './ledger-writer-records.ts'

export function releaseUnusedWriters<B extends ContentBlock>(
  snapshot: Snapshot,
  result: ToolRenderedResult<B>,
  basis: DurableEvidence,
): readonly LedgerWrite[] {
  return releaseWriters(
    snapshot,
    [...snapshot.writers.values()].filter(
      writer =>
        writer.state.kind !== 'failed' &&
        !(
          writer.state.kind === 'sealed' &&
          result.original.kind === 'offloaded' &&
          sameFactValue(writer.state.body.source, result.original.source)
        ),
    ),
    basis,
    { kind: 'closed', reason: 'final result did not adopt this writer' },
  )
}

export function releaseWriters(
  snapshot: Snapshot,
  writers: readonly WriterRecord[],
  basis: DurableEvidence,
  failure: ToolPrimitiveFailure,
): readonly LedgerWrite[] {
  const writes: LedgerWrite[] = []
  const scopes = new Map(snapshot.writerScopes)
  for (const writer of writers) {
    const operations = new Set<WriterAppendRecord['operation']>()
    if (writer.state.kind === 'sealing' || writer.state.kind === 'sealed') {
      operations.add(writer.state.operation)
      writes.push({ kind: 'delete', key: `body-preparation:${writer.state.operation}` })
    }
    const next: WriterRecord = {
      ...writer,
      state: {
        kind: 'failed',
        failure,
        seal:
          writer.state.kind === 'sealing' || writer.state.kind === 'sealed'
            ? {
                operation: writer.state.operation,
                source: writer.state.source,
                afterSequence: writer.state.afterSequence,
              }
            : null,
      },
    }
    const metadataBytes = metadataSize(next)
    let metadataDelta = metadataBytes - writer.metadataBytes
    let stagedBytes = 0
    let stagedItems = 0
    writes.push(put({ kind: 'body-writer', writer: { ...next, metadataBytes } }))
    for (const append of appendRecords(snapshot, writer.id)) {
      operations.add(append.operation)
      if (append.state.kind === 'staged') {
        stagedBytes += append.stagedBytes
        stagedItems++
      }
      const abandoned: WriterAppendRecord = { ...append, state: { kind: 'abandoned', basis } }
      const size = metadataSize(abandoned)
      metadataDelta += size - append.metadataBytes
      writes.push(
        put({ kind: 'body-writer-append', append: { ...abandoned, metadataBytes: size } }),
      )
    }
    const scope = scopes.get(writer.start.operation)
    if (scope !== undefined)
      scopes.set(writer.start.operation, {
        ...scope,
        metadataBytes: scope.metadataBytes + metadataDelta,
        stagedBytes: scope.stagedBytes - stagedBytes,
        stagedItems: scope.stagedItems - stagedItems,
      })
    for (const operation of operations) {
      const material = snapshot.materials.get(operation)
      if (material === undefined) continue
      writes.push(
        { kind: 'delete', key: `material-use:preparation:${operation}` },
        put({
          kind: 'material-cleanup',
          cleanup: { material: material.material, writeOperation: operation, basis },
        }),
      )
    }
  }
  for (const [key, scope] of scopes)
    if (scope !== snapshot.writerScopes.get(key))
      writes.push(put({ kind: 'body-writer-scope', scope }))
  return writes
}
