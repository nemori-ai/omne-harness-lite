import { fail, succeed } from '@omne-harness/operation-result'
import type { SealedToolBody, ToolBodyWriteReply } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { bodyOf, type BodyPreparationRecord } from './ledger-body-custody.ts'
import { put, reply, type Snapshot } from './ledger-decider.ts'
import { createLedgerMaterialCustody } from './ledger-material-custody.ts'
import { readMaterialBytes } from './ledger-material-read.ts'
import type { LedgerWrite } from './ledger-store.ts'
import { fromReply, type WriterPorts, type WriterMutation } from './ledger-writer-access.ts'
import {
  originalStart,
  appendRecords,
  commit,
  reject,
  metadataSize,
  type WriterInput,
} from './ledger-writer-decisions.ts'
import type { WriterAppendRecord, WriterRecord } from './ledger-writer-records.ts'
import { encodeToolMaterial } from './material-codec.ts'
import { encodeTextBody } from './text-body-codec.ts'

export function createWriterProgress<P>(
  ports: Pick<WriterPorts<P>, 'materials' | 'load' | 'entry' | 'transact'>,
  transact: WriterMutation<P>,
) {
  const custody = createLedgerMaterialCustody({
    materials: ports.materials,
    transact: ports.transact,
    entry: input => ports.entry(input, 'write'),
  })
  const checkWriter = (snapshot: Snapshot, writer: WriterRecord) => {
    const current = snapshot.writers.get(writer.id)
    return current !== undefined &&
      current.state.kind !== 'failed' &&
      originalStart(snapshot, writer.start) !== null
      ? succeed(undefined)
      : invalid('writer', 'original writer responsibility no longer exists')
  }
  const retainAppend = async (
    input: WriterInput<P>,
    append: WriterAppendRecord,
  ): ToolBodyWriteReply<WriterAppendRecord> => {
    if (append.state.kind === 'retained') return succeed(append)
    if (append.state.kind === 'abandoned')
      return fail({ kind: 'closed', reason: 'append was abandoned' })
    const encoded = encodeTextBody([{ text: append.state.payload.text }])
    const identity = encodeToolMaterial({ writer: append.writer, input: append.inputDigest })
    if ('failure' in identity) return fromReply(identity, input.operation)
    const sealed = await custody.preserve(
      { ...input, operation: append.operation, source: append.source },
      encoded,
      identity.ok.fingerprint,
      'body-fragment',
      snapshot => {
        const record = snapshot.writerAppends.get(append.id)
        const writer = snapshot.writers.get(append.writer)
        return record !== undefined &&
          record.state.kind !== 'abandoned' &&
          record.inputDigest === append.inputDigest &&
          writer !== undefined
          ? checkWriter(snapshot, writer)
          : invalid('append', 'original staged append required')
      },
    )
    if ('failure' in sealed) return fromReply(sealed, append.operation)
    return transact({ ...input, operation: append.operation, source: append.source }, snapshot => {
      const known = snapshot.writerAppends.get(append.id)
      const scope = snapshot.writerScopes.get(input.start.operation)
      if (known === undefined || scope === undefined || known.inputDigest !== append.inputDigest)
        return reject('conflict', 'append responsibility changed')
      if (known.state.kind === 'retained') return reply(succeed(succeed(known)))
      if (known.state.kind !== 'staged') return reject('closed', 'append was abandoned')
      const next: WriterAppendRecord = {
        ...known,
        state: { kind: 'retained', seal: sealed.ok, custody: sealed.ok.evidence },
      }
      const size = metadataSize(next)
      const total = scope.metadataBytes - known.metadataBytes + size
      if (total > scope.maxMetadataBytes)
        return reply(
          succeed(
            fail({
              kind: 'unavailable',
              operation: append.operation,
              reason: 'material receipt exceeds metadata budget; staged input retained',
            }),
          ),
        )
      return commit({ ...next, metadataBytes: size }, [
        put({ kind: 'body-writer-append', append: { ...next, metadataBytes: size } }),
        put({
          kind: 'body-writer-scope',
          scope: {
            ...scope,
            metadataBytes: total,
            stagedBytes: scope.stagedBytes - known.stagedBytes,
            stagedItems: scope.stagedItems - 1,
          },
        }),
      ])
    })
  }
  const sealWriter = async (
    input: WriterInput<P>,
    writer: WriterRecord,
  ): ToolBodyWriteReply<SealedToolBody> => {
    if (writer.state.kind === 'sealed') return succeed(writer.state.body)
    if (writer.state.kind !== 'sealing')
      return fail({ kind: 'closed', reason: 'writer is not sealing' })
    const state = writer.state
    const materialInput = { ...input, operation: state.operation, source: state.source }
    const loaded = await ports.load(input)
    if ('failure' in loaded) return fromReply(loaded, state.operation)
    const frames: { text: string }[] = []
    for (const append of appendRecords(loaded.ok, writer.id)) {
      const retained = await retainAppend(input, append)
      if ('failure' in retained) return retained
      if (retained.ok.state.kind !== 'retained' || ports.materials === undefined)
        return fail({
          kind: 'unavailable',
          operation: state.operation,
          reason: 'retained fragment material is unavailable',
        })
      const bytes = await readMaterialBytes(input, retained.ok.state.seal, ports.materials.store)
      if ('failure' in bytes) return fromReply(bytes, state.operation)
      try {
        frames.push({ text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.ok) })
      } catch {
        return fail({ kind: 'invalid', reason: 'fragment has invalid UTF-8' })
      }
    }
    const encoded = encodeTextBody(frames)
    const identity = encodeToolMaterial({
      writer: writer.id,
      operation: state.operation,
      afterSequence: state.afterSequence,
      body: encoded.fingerprint,
    })
    if ('failure' in identity) return fromReply(identity, state.operation)
    const prepared = await transact<BodyPreparationRecord>(materialInput, snapshot => {
      const current = snapshot.writers.get(writer.id)
      if (current === undefined || current.state.kind === 'failed')
        return reject('closed', 'writer was abandoned')
      const known = snapshot.bodyPreparations.get(state.operation)
      if (known !== undefined)
        return known.inputDigest === identity.ok.fingerprint.digest
          ? reply(succeed(succeed(known)))
          : reject('conflict', 'aggregate preparation changed')
      const body: BodyPreparationRecord = {
        operation: state.operation,
        start: writer.start,
        source: state.source,
        inputDigest: identity.ok.fingerprint.digest,
        bodyBytes: encoded.fingerprint.bytes,
        policy: writer.policy,
        state: { kind: 'preparing' },
      }
      return commit(body, [put({ kind: 'body-preparation', body })])
    })
    if ('failure' in prepared) return prepared
    const sealed = await custody.preserve(
      materialInput,
      encoded,
      identity.ok.fingerprint,
      'body',
      snapshot => checkWriter(snapshot, writer),
    )
    if ('failure' in sealed) return fromReply(sealed, state.operation)
    return transact(materialInput, snapshot => {
      const current = snapshot.writers.get(writer.id)
      const scope = snapshot.writerScopes.get(input.start.operation)
      if (current === undefined || scope === undefined || current.state.kind === 'failed')
        return reject('closed', 'writer was abandoned')
      if (current.state.kind === 'sealed') return reply(succeed(succeed(current.state.body)))
      if (current.state.kind !== 'sealing' || current.state.operation !== state.operation)
        return reject('conflict', 'seal responsibility changed')
      const preparation: BodyPreparationRecord = {
        ...prepared.ok,
        state: { kind: 'sealed', seal: sealed.ok },
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
        if (append.state.kind !== 'retained')
          return reject('busy', 'not every fragment is retained')
        writes.push(
          { kind: 'delete', key: `material-use:preparation:${append.operation}` },
          put({
            kind: 'material-cleanup',
            cleanup: {
              material: append.state.seal.material,
              writeOperation: append.operation,
              basis: sealed.ok.evidence,
            },
          }),
        )
      }
      return commit(body.ok, writes)
    })
  }
  return { retainAppend, sealWriter }
}
