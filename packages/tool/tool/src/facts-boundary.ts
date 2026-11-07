// Facts cross from a trusted execution producer, but their data still needs a fixed, closed view.
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Adoption,
  type Effect,
  type DurableEvidence,
  type ProcessBlock,
  type RawOutput,
  type ToolFailure,
  type ToolStartRecord,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
  decodeToolWaitId,
  type FactBatch,
  type FactReceipt,
  type ResultPolicy,
  type ToolExecutionFact,
  type ToolFinalEnvelope,
  type ToolFinalPointer,
} from '@omne-harness/tool-contract/provider'

import { readOwnSlot } from '@omne-harness/tool-contract/binding'
import {
  invalid,
  isTenantShape,
  judgeAdoptionField,
  judgeCallInput,
  judgeEvidenceField,
} from './boundary.ts'

type Data = Record<string, unknown>
function object(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function closed(value: unknown, keys: readonly string[]): value is Data {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  )
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function decimal(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]+$/u.test(value)
}

/** Own data properties only. The copy never evaluates accessors or serializes credentials. */
export function copyData(value: unknown, path = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || value === null || path.has(value))
    throw new TypeError('non-data')
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new TypeError('non-plain')
  path.add(value)
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('array-fields')
      const result: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        const slot = readOwnSlot(value, String(index))
        if (slot.kind !== 'value') throw new TypeError('array-slot')
        result.push(copyData(slot.value, path))
      }
      return Object.freeze(result)
    }
    const result: Data = Object.create(null)
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('symbol')
      const slot = readOwnSlot(value, key)
      if (slot.kind !== 'value') throw new TypeError('accessor')
      result[key] = copyData(slot.value, path)
    }
    return Object.freeze(result)
  } finally {
    path.delete(value)
  }
}

function start(value: unknown): Outcome<ToolStartRecord, ToolFailure> {
  if (
    !object(value) ||
    !closed(
      value,
      value.kind === 'resume'
        ? ['operation', 'executor', 'execution', 'kind', 'checkpoint']
        : ['operation', 'executor', 'execution', 'kind'],
    )
  )
    return invalid('start', 'shape')
  const operation = decodeToolOperationId(value.operation)
  const executor = judgeAdoptionField(value.executor, 'start.executor')
  const execution = value.execution
  if (
    !closed(execution, ['tenant', 'call', 'instance', 'generation']) ||
    !isTenantShape(execution.tenant)
  )
    return invalid('start.execution', 'shape')
  const base = judgeCallInput({ ...execution, principal: null }, 'write')
  const instance = decodeToolInstanceId(execution.instance)
  if (
    'failure' in operation ||
    'failure' in executor ||
    'failure' in base ||
    'failure' in instance ||
    !text(execution.generation)
  )
    return invalid('start', 'shape')
  const common = {
    operation: operation.ok,
    executor: executor.ok,
    execution: {
      tenant: base.ok.tenant,
      call: base.ok.call,
      instance: instance.ok,
      generation: execution.generation,
    },
  }
  if (value.kind === 'start') return succeed({ ...common, kind: 'start' })
  if (value.kind !== 'resume') return invalid('start.kind', 'variant')
  const checkpoint = judgeEvidenceField(value.checkpoint, 'start.checkpoint')
  return 'failure' in checkpoint
    ? checkpoint
    : succeed({ ...common, kind: 'resume', checkpoint: checkpoint.ok })
}

function process(value: unknown): Outcome<ProcessBlock, ToolFailure> {
  if (
    !closed(value, ['index', 'mode', 'state', 'sequence', 'content', 'trim']) ||
    !text(value.index) ||
    !decimal(value.sequence) ||
    (value.mode !== 'append' && value.mode !== 'replace') ||
    (value.state !== 'open' && value.state !== 'closed')
  )
    return invalid('batch.events.fact.blocks', 'shape')
  const content = judgeContentBlock(value.content)
  if ('rejected' in content || !content.ok.visibility.toHuman)
    return invalid('batch.events.fact.blocks.content', 'human-content')
  const trim = value.trim
  if (
    trim !== null &&
    (!closed(trim, ['removed', 'reason']) || !decimal(trim.removed) || !text(trim.reason))
  )
    return invalid('batch.events.fact.blocks.trim', 'shape')
  return succeed({
    index: value.index,
    mode: value.mode,
    state: value.state,
    sequence: value.sequence,
    content: content.ok,
    trim: trim === null ? null : { removed: String(trim.removed), reason: String(trim.reason) },
  })
}

function terminal(value: unknown): value is ToolTerminal {
  if (!object(value)) return false
  switch (value.kind) {
    case 'completed':
      return closed(value, ['kind'])
    case 'failed':
      return (
        closed(value, ['kind', 'cause', 'diagnostic']) &&
        typeof value.cause === 'string' &&
        ['arguments', 'environment', 'executor', 'runtime-lost', 'result'].includes(value.cause) &&
        typeof value.diagnostic === 'string'
      )
    case 'unavailable':
      return closed(value, ['kind', 'reason']) && text(value.reason)
    case 'no-response':
      return (
        closed(value, ['kind', 'wait', 'reason']) &&
        'ok' in decodeToolWaitId(value.wait) &&
        text(value.reason)
      )
    case 'interrupted': {
      const cause = value.cause
      if (!closed(value, ['kind', 'cause']) || !object(cause)) return false
      if (cause.kind === 'foreground-limit') return closed(cause, ['kind'])
      if (cause.kind === 'control')
        return (
          closed(cause, ['kind', 'operation', 'withdrawn']) &&
          'ok' in decodeToolOperationId(cause.operation) &&
          typeof cause.withdrawn === 'boolean'
        )
      return (
        cause.kind === 'resume-rejected' &&
        closed(cause, ['kind', 'exclusion']) &&
        'ok' in judgeEvidenceField(cause.exclusion, 'terminal.cause.exclusion')
      )
    }
    default:
      return false
  }
}
function effect(value: unknown): value is Effect {
  if (!object(value)) return false
  if (value.kind === 'not-started') return closed(value, ['kind'])
  if (value.kind === 'unknown')
    return closed(value, ['kind', 'diagnostic']) && typeof value.diagnostic === 'string'
  return (
    (value.kind === 'occurred' || value.kind === 'not-occurred') &&
    closed(value, ['kind', 'evidence']) &&
    'ok' in judgeEvidenceField(value.evidence, 'effect.evidence')
  )
}
function raw(value: unknown): Outcome<RawOutput, ToolFailure> {
  if (!closed(value, ['codec', 'content', 'custody']))
    return invalid('batch.events.fact.raw', 'shape')
  const codec = judgeAdoptionField(value.codec, 'raw.codec')
  const custody = judgeEvidenceField(value.custody, 'raw.custody')
  const content = judgeContentBlock({
    kind: 'file',
    id: 'raw',
    visibility: { toHuman: false, toModel: false },
    ref: value.content,
    transcript: null,
  })
  if ('failure' in codec || 'failure' in custody || 'rejected' in content || !('ref' in content.ok))
    return invalid('batch.events.fact.raw', 'shape')
  return succeed({ codec: codec.ok, custody: custody.ok, content: content.ok.ref })
}
function fact<B extends ContentBlock>(
  value: unknown,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Outcome<Exclude<ToolExecutionFact, { kind: 'final' }> | ToolFinalEnvelope<B>, ToolFailure> {
  if (!object(value)) return invalid('batch.events.fact', 'shape')
  if (value.kind === 'process') {
    if (!closed(value, ['kind', 'blocks']) || !Array.isArray(value.blocks))
      return invalid('batch.events.fact.blocks', 'shape')
    const blocks: ProcessBlock[] = []
    for (const block of value.blocks) {
      const checked = process(block)
      if ('failure' in checked) return checked
      blocks.push(checked.ok)
    }
    return succeed({ kind: 'process', blocks })
  }
  if (value.kind !== 'final') {
    if (['wait', 'continued', 'account', 'program-scheduling'].includes(String(value.kind)))
      return {
        failure: {
          kind: 'unsupported',
          adoption,
          reason: `receiveFacts supports process/final; ${String(value.kind)} blocks the complete batch`,
        },
      }
    return invalid('batch.events.fact.kind', 'variant')
  }
  if (
    !closed(value, ['kind', 'raw', 'result', 'terminal', 'effect']) ||
    !terminal(value.terminal) ||
    !effect(value.effect)
  )
    return invalid('batch.events.fact', 'shape')
  const original = raw(value.raw)
  if ('failure' in original) return original
  // The result policy owns runtime validation and the narrower B, just as in result rendering.
  const result = policy.judgeResult(value.result as Parameters<typeof policy.judgeResult>[0])
  if ('failure' in result) return invalid('batch.events.fact.result', 'policy')
  return succeed({
    kind: 'final',
    raw: original.ok,
    result: result.ok,
    terminal: value.terminal,
    effect: value.effect,
  })
}

function finalPointer(value: Data, adoption: Adoption): Outcome<ToolFinalPointer, ToolFailure> {
  if (
    !closed(value, ['kind', 'raw', 'terminal', 'effect', 'value', 'envelope']) ||
    !terminal(value.terminal) ||
    !effect(value.effect)
  )
    return invalid('batch.events.fact', 'pointer-shape')
  const original = raw(value.raw)
  if ('failure' in original) return original
  const fingerprint = value.value
  const seal = value.envelope
  if (
    !closed(fingerprint, ['codec', 'algorithm', 'digest', 'bytes']) ||
    typeof fingerprint.codec !== 'string' ||
    fingerprint.algorithm !== 'sha256' ||
    typeof fingerprint.digest !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(fingerprint.digest) ||
    !decimal(fingerprint.bytes) ||
    !closed(seal, ['material', 'codec', 'bytes', 'sha256', 'evidence']) ||
    !closed(seal.material, ['id', 'generation', 'provider']) ||
    !text(seal.material.id) ||
    !text(seal.material.generation) ||
    seal.bytes !== fingerprint.bytes ||
    seal.sha256 !== fingerprint.digest
  )
    return invalid('batch.events.fact', 'pointer-seal')
  if (fingerprint.codec !== 'tool-canonical-json-v1')
    return {
      failure: {
        kind: 'unsupported',
        adoption,
        reason: `unsupported final fingerprint codec: ${fingerprint.codec}`,
      },
    }
  const id = decodeToolMaterialId(seal.material.id)
  const generation = decodeToolMaterialGeneration(seal.material.generation)
  const provider = judgeAdoptionField(seal.material.provider, 'material.provider')
  const codec = judgeAdoptionField(seal.codec, 'material.codec')
  const evidence = judgeEvidenceField(seal.evidence, 'material.evidence')
  if (
    'failure' in id ||
    'failure' in generation ||
    'failure' in provider ||
    'failure' in codec ||
    'failure' in evidence
  )
    return invalid('batch.events.fact', 'pointer-evidence')
  return succeed({
    kind: 'final',
    raw: original.ok,
    terminal: value.terminal,
    effect: value.effect,
    value: {
      codec: 'tool-canonical-json-v1',
      algorithm: 'sha256',
      digest: fingerprint.digest,
      bytes: fingerprint.bytes,
    },
    envelope: {
      material: { id: id.ok, generation: generation.ok, provider: provider.ok },
      codec: codec.ok,
      bytes: fingerprint.bytes,
      sha256: fingerprint.digest,
      evidence: evidence.ok,
    },
  })
}

export function fixFactInput<B extends ContentBlock>(
  input: unknown,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Outcome<Readonly<{ start: ToolStartRecord; batch: FactBatch }>, ToolFailure> {
  try {
    if (!object(input)) return invalid('input', 'type')
    const startSlot = readOwnSlot(input, 'start')
    const batchSlot = readOwnSlot(input, 'batch')
    if (startSlot.kind !== 'value' || batchSlot.kind !== 'value')
      return invalid('batch', 'own-data-required')
    const invocation = start(copyData(startSlot.value))
    const data = copyData(batchSlot.value)
    if ('failure' in invocation) return invocation
    if (
      !closed(data, ['start', 'source', 'batch', 'after', 'cursor', 'events']) ||
      !text(data.batch) ||
      !text(data.cursor) ||
      (data.after !== null && !text(data.after)) ||
      !Array.isArray(data.events)
    )
      return invalid('batch', 'shape')
    const original = start(data.start)
    const source = judgeEvidenceField(data.source, 'batch.source')
    if ('failure' in original) return original
    if ('failure' in source) return source
    const events: FactBatch['events'][number][] = []
    for (const event of data.events) {
      if (!closed(event, ['event', 'fact']) || !text(event.event))
        return invalid('batch.events', 'shape')
      const checked =
        object(event.fact) && event.fact.kind === 'final'
          ? finalPointer(event.fact, adoption)
          : fact(event.fact, policy, adoption)
      if ('failure' in checked) return checked
      if (checked.ok.kind === 'final' && 'result' in checked.ok)
        return invalid('batch.events.fact', 'pointer-required')
      events.push({ event: event.event, fact: checked.ok })
    }
    // Fix policy-produced data too. A provider cannot mutate the accepted result during access.
    const batch = {
      start: original.ok,
      source: source.ok,
      batch: data.batch,
      after: data.after,
      cursor: data.cursor,
      events,
    }
    copyData(batch)
    return succeed({ start: invocation.ok, batch: structuredClone(batch) })
  } catch {
    return invalid('batch', 'unserializable-or-invalid-data')
  }
}

export function fixFactBasis(input: unknown) {
  try {
    if (!object(input)) return invalid('input', 'type')
    const basis = readOwnSlot(input, 'basis')
    return basis.kind === 'value'
      ? judgeEvidenceField(basis.value, 'basis')
      : invalid('basis', 'own-data-required')
  } catch {
    return invalid('basis', 'invalid-data')
  }
}

/** Fixes acknowledgement data before qualification or any external confirmation call. */
export function fixFactAcknowledgement(
  input: unknown,
): Outcome<Readonly<{ receipt: FactReceipt; sourceReceipt: DurableEvidence }>, ToolFailure> {
  try {
    if (!object(input)) return invalid('input', 'type')
    const receiptSlot = readOwnSlot(input, 'receipt')
    const sourceSlot = readOwnSlot(input, 'sourceReceipt')
    if (receiptSlot.kind !== 'value' || sourceSlot.kind !== 'value')
      return invalid('receipt', 'own-data-required')
    const data = copyData(receiptSlot.value)
    if (
      !closed(data, ['start', 'batch', 'cursor', 'custody']) ||
      !text(data.batch) ||
      !text(data.cursor)
    )
      return invalid('receipt', 'shape')
    const operation = decodeToolOperationId(data.start)
    if ('failure' in operation) return invalid('receipt.start', operation.failure.reason)
    const custody = judgeEvidenceField(data.custody, 'receipt.custody')
    if ('failure' in custody) return custody
    const sourceReceipt = judgeEvidenceField(copyData(sourceSlot.value), 'sourceReceipt')
    if ('failure' in sourceReceipt) return sourceReceipt
    return succeed({
      receipt: { start: operation.ok, batch: data.batch, cursor: data.cursor, custody: custody.ok },
      sourceReceipt: sourceReceipt.ok,
    })
  } catch {
    return invalid('receipt', 'unserializable-or-invalid-data')
  }
}

export function fixFinalCustodyInput<B extends ContentBlock>(
  input: unknown,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Outcome<
  Readonly<{ start: ToolStartRecord; source: DurableEvidence; final: ToolFinalEnvelope<B> }>,
  ToolFailure
> {
  try {
    if (!object(input)) return invalid('input', 'type')
    const fields: Data = {}
    for (const key of ['start', 'source', 'final']) {
      const slot = readOwnSlot(input, key)
      if (slot.kind !== 'value') return invalid(key, 'own-data-required')
      fields[key] = copyData(slot.value)
    }
    const checkedStart = start(fields.start)
    if ('failure' in checkedStart) return checkedStart
    const source = judgeEvidenceField(fields.source, 'source')
    if ('failure' in source) return source
    const final = fact(fields.final, policy, adoption)
    if ('failure' in final) return final
    if (final.ok.kind !== 'final') return invalid('final', 'final-required')
    return succeed({ start: checkedStart.ok, source: source.ok, final: structuredClone(final.ok) })
  } catch {
    return invalid('final', 'unserializable-or-invalid-data')
  }
}
