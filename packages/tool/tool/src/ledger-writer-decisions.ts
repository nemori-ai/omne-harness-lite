import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolStartRecord } from '@omne-harness/tool-contract'
import type { ToolBodyFrame, ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { MutationInput } from './boundary.ts'
import type { ToolLedgerConfiguration } from './construction.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import { put, reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { LedgerWrite } from './ledger-store.ts'
import type {
  WriterAppendRecord,
  WriterRecord,
  WriterScopeRecord,
} from './ledger-writer-records.ts'
import { encodeToolMaterial } from './material-codec.ts'
import { resultBodyPolicy } from './result-offloading.ts'
import { currentBodyExecution } from './ledger-body-admission.ts'
import { bodyRepresentation } from './body-representation.ts'

export type WriterInput<P> = MutationInput<P> &
  Readonly<{
    start: ToolStartRecord
    source: DurableEvidence
    key: string
  }>
export type WriterAnswer<T> = Outcome<T, ToolPrimitiveFailure>
export type WriterDecision<T> = Decision<WriterAnswer<T>>
export function reject<T>(
  kind: 'invalid' | 'closed' | 'conflict' | 'capacity' | 'too-large' | 'unsupported' | 'busy',
  reason: string,
): WriterDecision<T> {
  return reply(succeed(fail({ kind, reason })))
}
export function commit<T>(value: T, writes: readonly LedgerWrite[]): WriterDecision<T> {
  return { kind: 'commit', value: succeed(value), writes }
}
export function writerIdentity(start: ToolStartRecord, key: string): string {
  return digestOf({ start, key })
}
export function metadataSize(value: unknown): number {
  const encoded = encodeToolMaterial(value)
  return 'failure' in encoded ? Infinity : encoded.ok.bytes.byteLength + 32
}
export function originalStart(snapshot: Snapshot, start: unknown): ToolStartRecord | null {
  const original = snapshot.call?.start
  return original !== undefined && original !== null && sameFactValue(original, start)
    ? original
    : null
}
export function newAdmission(
  snapshot: Snapshot,
  start: ToolStartRecord,
): ToolPrimitiveFailure | null {
  const call = snapshot.call
  if (
    call === null ||
    (call.state.phase !== 'starting' && call.state.phase !== 'running') ||
    !currentBodyExecution(call, start)
  )
    return { kind: 'closed', reason: 'execution is not current and running' }
  if (snapshot.writerScopes.get(start.operation)?.state.kind === 'closed')
    return { kind: 'closed', reason: 'writer scope is closed' }
  return null
}
export function scopeFor(
  snapshot: Snapshot,
  start: ToolStartRecord,
  configuration: ToolLedgerConfiguration,
): WriterScopeRecord {
  return (
    snapshot.writerScopes.get(start.operation) ?? {
      start,
      bufferBytes: configuration.authorBufferBytes,
      bufferItems: configuration.authorBufferItems,
      maxMetadataBytes: configuration.offloading.maxWriterMetadataBytes,
      metadataBytes: 0,
      stagedBytes: 0,
      stagedItems: 0,
      state: { kind: 'open' },
    }
  )
}
export function appendRecords(snapshot: Snapshot, writer: string): readonly WriterAppendRecord[] {
  return [...snapshot.writerAppends.values()]
    .filter(record => record.writer === writer)
    .sort((a, b) => (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1))
}
export function operationUsed(
  snapshot: Snapshot,
  operation: WriterInput<unknown>['operation'],
): boolean {
  return (
    snapshot.operations.has(operation) ||
    snapshot.bodyPreparations.has(operation) ||
    [...snapshot.writers.values()].some(
      writer =>
        writer.operation === operation ||
        ((writer.state.kind === 'sealing' || writer.state.kind === 'sealed') &&
          writer.state.operation === operation),
    ) ||
    [...snapshot.writerAppends.values()].some(append => append.operation === operation) ||
    [...snapshot.writerScopes.values()].some(
      scope => scope.state.kind === 'closed' && scope.state.operation === operation,
    )
  )
}

export function beginWriter<P>(
  snapshot: Snapshot,
  mint: Mint,
  input: WriterInput<P>,
  representation: unknown,
  configuration: ToolLedgerConfiguration,
): WriterDecision<WriterRecord> {
  const id = writerIdentity(input.start, input.key)
  const inputDigest = digestOf({
    start: input.start,
    source: input.source,
    key: input.key,
    representation,
  })
  const known = snapshot.writers.get(id)
  if (known !== undefined)
    return known.operation === input.operation && known.inputDigest === inputDigest
      ? reply(succeed(succeed(known)))
      : reject('conflict', 'writer key already has a different begin')
  const refusal = newAdmission(snapshot, input.start)
  if (refusal !== null) return reply(succeed(fail(refusal)))
  if (operationUsed(snapshot, input.operation)) return reject('conflict', 'operation already used')
  if (snapshot.call === null) return reject('invalid', 'original call required')
  const policy = resultBodyPolicy(
    snapshot.call.request,
    configuration.offloading,
    configuration.readResultArguments,
  )
  if ('failure' in policy) return reply(policy)
  if (policy.ok.declaration.kind !== 'text' && policy.ok.declaration.kind !== 'json-document')
    return reject('unsupported', 'structured writer is not available')
  if (!sameFactValue(bodyRepresentation(policy.ok.declaration), representation))
    return reject('invalid', 'representation must match the fixed declaration')
  const record: WriterRecord = {
    id,
    key: input.key,
    start: input.start,
    operation: input.operation,
    source: input.source,
    inputDigest,
    custody: mintEvidence(
      'body-write',
      { tenant: input.tenant, call: input.call, operation: input.operation },
      mint.revision,
      inputDigest,
    ),
    policy: policy.ok,
    nextSequence: '1',
    bodyBytes: 0,
    metadataBytes: 0,
    state: { kind: 'open' },
  }
  const metadataBytes = metadataSize(record)
  const scope = scopeFor(snapshot, input.start, configuration)
  if (scope.metadataBytes + metadataBytes > scope.maxMetadataBytes)
    return reject('too-large', 'writer metadata budget exceeded')
  const writer = { ...record, metadataBytes }
  return commit(writer, [
    put({ kind: 'body-writer', writer }),
    put({
      kind: 'body-writer-scope',
      scope: { ...scope, metadataBytes: scope.metadataBytes + metadataBytes },
    }),
  ])
}

export function admitAppend<P>(
  snapshot: Snapshot,
  input: WriterInput<P>,
  sequence: string,
  frame: Extract<ToolBodyFrame, { kind: 'text' | 'json-fragment' }>,
): WriterDecision<WriterAppendRecord> {
  const writerId = writerIdentity(input.start, input.key)
  const writer = snapshot.writers.get(writerId)
  if (writer === undefined) return reject('invalid', 'writer does not exist')
  const id = JSON.stringify([writerId, sequence])
  const inputDigest = digestOf({
    start: input.start,
    source: input.source,
    key: input.key,
    sequence,
    frame,
  })
  const known = snapshot.writerAppends.get(id)
  if (known !== undefined)
    return known.operation === input.operation && known.inputDigest === inputDigest
      ? reply(succeed(succeed(known)))
      : reject('conflict', 'sequence already has different input')
  const refusal = newAdmission(snapshot, input.start)
  if (refusal !== null) return reply(succeed(fail(refusal)))
  if (writer.state.kind !== 'open') return reject('closed', 'writer is not open')
  if (
    writer.policy.declaration.kind === 'text'
      ? frame.kind !== 'text'
      : frame.kind !== 'json-fragment'
  )
    return reject('invalid', 'frame must match the fixed body representation')
  if (sequence !== writer.nextSequence)
    return reject('conflict', 'sequence must be the next admitted sequence')
  if (operationUsed(snapshot, input.operation)) return reject('conflict', 'operation already used')
  if (
    appendRecords(snapshot, writerId).some(
      record =>
        frame.kind === 'text' &&
        record.frame.kind === 'text' &&
        record.frame.block === frame.block &&
        record.frame.end,
    )
  )
    return reject('closed', 'text block is already closed')
  const bytes = Buffer.byteLength(frame.text, 'utf8')
  if (writer.bodyBytes + bytes > writer.policy.maxBodyBytes)
    return reject('too-large', 'body size exceeded')
  if (
    writer.policy.jsonLimits !== null &&
    writer.bodyBytes + bytes > writer.policy.jsonLimits.maxBytes
  )
    return reject('too-large', 'JSON document validation budget exceeded')
  const scope = snapshot.writerScopes.get(input.start.operation)
  if (scope === undefined) return reject('invalid', 'writer scope missing')
  const stagedBytes = metadataSize(frame)
  if (stagedBytes > scope.bufferBytes) return reject('too-large', 'fragment exceeds staging budget')
  if (scope.stagedBytes + stagedBytes > scope.bufferBytes || scope.stagedItems >= scope.bufferItems)
    return reject('capacity', 'staging budget is occupied')
  const base = {
    id,
    writer: writerId,
    sequence,
    operation: input.operation,
    source: input.source,
    inputDigest,
    frame:
      frame.kind === 'text'
        ? ({ kind: 'text', block: frame.block, end: frame.end } as const)
        : ({ kind: 'json-fragment' } as const),
    bodyBytes: bytes,
    metadataBytes: 0,
    stagedBytes,
  }
  const metadataBytes = metadataSize(base)
  if (scope.metadataBytes + metadataBytes > scope.maxMetadataBytes)
    return reject('too-large', 'writer metadata budget exceeded')
  const append: WriterAppendRecord = {
    ...base,
    metadataBytes,
    state: { kind: 'staged', payload: frame },
  }
  return commit(append, [
    put({ kind: 'body-writer-append', append }),
    put({
      kind: 'body-writer',
      writer: {
        ...writer,
        nextSequence: String(BigInt(sequence) + 1n),
        bodyBytes: writer.bodyBytes + bytes,
      },
    }),
    put({
      kind: 'body-writer-scope',
      scope: {
        ...scope,
        metadataBytes: scope.metadataBytes + metadataBytes,
        stagedBytes: scope.stagedBytes + stagedBytes,
        stagedItems: scope.stagedItems + 1,
      },
    }),
  ])
}

export function admitSeal<P>(
  snapshot: Snapshot,
  input: WriterInput<P>,
  afterSequence: string,
): WriterDecision<WriterRecord> {
  const writer = snapshot.writers.get(writerIdentity(input.start, input.key))
  if (writer === undefined) return reject('invalid', 'writer does not exist')
  if (writer.state.kind === 'failed' && writer.state.seal !== null) {
    const seal = writer.state.seal
    return seal.operation === input.operation &&
      seal.afterSequence === afterSequence &&
      sameFactValue(seal.source, input.source)
      ? reply(succeed(fail(writer.state.failure)))
      : reject('conflict', 'different seal already admitted')
  }
  if (writer.state.kind === 'sealing' || writer.state.kind === 'sealed')
    return writer.state.operation === input.operation &&
      writer.state.afterSequence === afterSequence &&
      sameFactValue(writer.state.source, input.source)
      ? reply(succeed(succeed(writer)))
      : reject('conflict', 'different seal already admitted')
  const refusal = newAdmission(snapshot, input.start)
  if (refusal !== null) return reply(succeed(fail(refusal)))
  if (writer.state.kind !== 'open') return reject('closed', 'writer is not open')
  if (String(BigInt(writer.nextSequence) - 1n) !== afterSequence)
    return reject('conflict', 'seal must include all admitted sequences')
  if (operationUsed(snapshot, input.operation)) return reject('conflict', 'operation already used')
  const blocks = new Map<string, boolean>()
  for (const append of appendRecords(snapshot, writer.id))
    if (append.frame.kind === 'text') blocks.set(append.frame.block, append.frame.end)
  if ([...blocks.values()].some(closed => !closed))
    return reject('invalid', 'text blocks must be closed before seal')
  const next: WriterRecord = {
    ...writer,
    state: { kind: 'sealing', operation: input.operation, afterSequence, source: input.source },
  }
  const scope = snapshot.writerScopes.get(input.start.operation)
  if (scope === undefined) return reject('invalid', 'writer scope missing')
  const metadataBytes = metadataSize(next)
  const total = scope.metadataBytes - writer.metadataBytes + metadataBytes
  if (total > scope.maxMetadataBytes) return reject('too-large', 'writer metadata budget exceeded')
  return commit({ ...next, metadataBytes }, [
    put({ kind: 'body-writer', writer: { ...next, metadataBytes } }),
    put({ kind: 'body-writer-scope', scope: { ...scope, metadataBytes: total } }),
  ])
}
