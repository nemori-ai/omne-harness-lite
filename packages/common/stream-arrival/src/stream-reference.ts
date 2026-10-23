import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'

declare const streamIdBrand: unique symbol
declare const streamPositionBrand: unique symbol
declare const streamRefBrand: unique symbol
declare const streamCursorBrand: unique symbol

export type StreamProducer = 'model' | 'tool'
export type StreamId = string & { readonly [streamIdBrand]: true }
export type StreamPosition = string & { readonly [streamPositionBrand]: true }
export type StreamRef = string & { readonly [streamRefBrand]: true }
export type StreamCursor = string & { readonly [streamCursorBrand]: true }
export type StreamEnvelope = Readonly<{
  producer: StreamProducer
  call: string
  stream: StreamId
}>
export type StreamCursorParts = Readonly<{ ref: StreamRef; position: StreamPosition }>
export type StreamValueRejection = Readonly<{
  field: 'StreamId' | 'StreamPosition' | 'StreamRef' | 'StreamCursor'
  reason:
    | 'type'
    | 'length'
    | 'syntax'
    | 'domain'
    | 'version'
    | 'shape'
    | 'producer'
    | 'identity'
    | 'position'
    | 'unreadable'
}>
export type StreamCallFailure =
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ kind: 'invalid-tenant' }>
  | Readonly<{ kind: 'foreign-tenant' }>
export type StreamCallCodec = Readonly<{
  producer: StreamProducer
  resolve(input: Readonly<{ text: unknown; tenant: TenantId }>): Outcome<string, StreamCallFailure>
}>
export type StreamReferenceFailure =
  | Readonly<{ kind: 'invalid-envelope'; rejection: StreamValueRejection }>
  | Readonly<{ kind: 'wrong-producer' }>
  | StreamCallFailure
export type StreamCursorFailure =
  | Readonly<{ kind: 'invalid'; rejection: StreamValueRejection }>
  | Readonly<{ kind: 'foreign-stream' }>

export const STREAM_ID_MAX_LENGTH = 256
export const STREAM_POSITION_MAX_LENGTH = 256
export const STREAM_CALL_MAX_LENGTH = 1668
export const STREAM_REFERENCE_MAX_LENGTH = 4096
export const STREAM_CURSOR_MAX_LENGTH = 8192

type Field = StreamValueRejection['field']
type Reason = StreamValueRejection['reason']

function reject(field: Field, reason: Reason): { failure: StreamValueRejection } {
  return { failure: { field, reason } }
}

function parseText(
  value: unknown,
  field: Field,
  limit: number,
): Outcome<string, StreamValueRejection> {
  if (typeof value !== 'string') return reject(field, 'type')
  if (value.length === 0 || value.length > limit) return reject(field, 'length')
  return { ok: value }
}

export function decodeStreamId(value: unknown): Outcome<StreamId, StreamValueRejection> {
  const text = parseText(value, 'StreamId', STREAM_ID_MAX_LENGTH)
  if ('failure' in text) return text
  if (/^str_[A-Za-z0-9_-]+$/u.exec(text.ok)?.[0] !== text.ok) return reject('StreamId', 'identity')
  return { ok: text.ok as StreamId }
}

export function decodeStreamPosition(
  value: unknown,
): Outcome<StreamPosition, StreamValueRejection> {
  const text = parseText(value, 'StreamPosition', STREAM_POSITION_MAX_LENGTH)
  if ('failure' in text) return text
  if (/^(?:0|[1-9][0-9]*)$/u.exec(text.ok)?.[0] !== text.ok)
    return reject('StreamPosition', 'position')
  return { ok: text.ok as StreamPosition }
}

function parseTuple(
  value: unknown,
  field: 'StreamRef' | 'StreamCursor',
  limit: number,
  domain: string,
  size: number,
): Outcome<readonly unknown[], StreamValueRejection> {
  const text = parseText(value, field, limit)
  if ('failure' in text) return text
  let tuple: unknown
  try {
    tuple = JSON.parse(text.ok)
  } catch {
    return reject(field, 'syntax')
  }
  if (!Array.isArray(tuple)) return reject(field, 'shape')
  if (tuple[0] !== domain) return reject(field, 'domain')
  if (tuple[1] !== 1) return reject(field, 'version')
  if (tuple.length !== size) return reject(field, 'shape')
  return { ok: tuple }
}

function parseEnvelopeFields(
  producer: unknown,
  call: unknown,
  stream: unknown,
): Outcome<StreamEnvelope, StreamValueRejection> {
  if (producer !== 'model' && producer !== 'tool') return reject('StreamRef', 'producer')
  if (typeof call !== 'string') return reject('StreamRef', 'shape')
  if (call.length === 0 || call.length > STREAM_CALL_MAX_LENGTH)
    return reject('StreamRef', 'length')
  const identity = decodeStreamId(stream)
  if ('failure' in identity) return reject('StreamRef', 'identity')
  return { ok: Object.freeze({ producer, call, stream: identity.ok }) }
}

export function parseStreamEnvelope(value: unknown): Outcome<StreamEnvelope, StreamValueRejection> {
  const tuple = parseTuple(value, 'StreamRef', STREAM_REFERENCE_MAX_LENGTH, 'stream-ref', 5)
  if ('failure' in tuple) return tuple
  return parseEnvelopeFields(tuple.ok[2], tuple.ok[3], tuple.ok[4])
}

function captureRecord<T extends object>(
  input: T,
  keys: readonly (keyof T & string)[],
): Outcome<T, 'shape' | 'unreadable'> {
  if (typeof input !== 'object' || input === null) return { failure: 'shape' }
  try {
    const prototype: unknown = Object.getPrototypeOf(input)
    const descriptors = Object.getOwnPropertyDescriptors(input)
    if (prototype !== Object.prototype && prototype !== null) return { failure: 'shape' }
    if (Reflect.ownKeys(descriptors).length !== keys.length) return { failure: 'shape' }
    const entries: [string, unknown][] = []
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
        return { failure: 'shape' }
      entries.push([key, descriptor.value])
    }
    // The typed record's exact own data properties have been captured without property reads.
    return { ok: Object.fromEntries(entries) as T }
  } catch {
    return { failure: 'unreadable' }
  }
}

function canonicalReference(envelope: StreamEnvelope): string {
  return JSON.stringify(['stream-ref', 1, envelope.producer, envelope.call, envelope.stream])
}

function resolveEnvelope(
  envelope: StreamEnvelope,
  tenant: TenantId,
  codec: StreamCallCodec,
): Outcome<StreamRef, StreamReferenceFailure> {
  if (envelope.producer !== codec.producer) return { failure: { kind: 'wrong-producer' } }
  const call = codec.resolve({ text: envelope.call, tenant })
  if ('failure' in call) return call
  if (
    typeof call.ok !== 'string' ||
    call.ok.length === 0 ||
    call.ok.length > STREAM_CALL_MAX_LENGTH
  )
    throw new TypeError('Invalid stream call codec output')
  const ref = canonicalReference({ ...envelope, call: call.ok })
  if (ref.length > STREAM_REFERENCE_MAX_LENGTH)
    return {
      failure: { kind: 'invalid-envelope', rejection: { field: 'StreamRef', reason: 'length' } },
    }
  return { ok: ref as StreamRef }
}

export function encodeStreamRef(
  input: StreamEnvelope & Readonly<{ tenant: TenantId }>,
  codec: StreamCallCodec,
): Outcome<StreamRef, StreamReferenceFailure> {
  const captured = captureRecord(input, ['tenant', 'producer', 'call', 'stream'])
  if ('failure' in captured)
    return {
      failure: {
        kind: 'invalid-envelope',
        rejection: { field: 'StreamRef', reason: captured.failure },
      },
    }
  const { tenant, producer, call, stream } = captured.ok
  if (!tenantCodec.encode(tenant).ok) return { failure: { kind: 'invalid-tenant' } }
  const envelope = parseEnvelopeFields(producer, call, stream)
  if ('failure' in envelope)
    return { failure: { kind: 'invalid-envelope', rejection: envelope.failure } }
  return resolveEnvelope(envelope.ok, tenant, codec)
}

export function judgeStreamRef(
  input: Readonly<{ value: unknown; tenant: TenantId }>,
  codec: StreamCallCodec,
): Outcome<StreamRef, StreamReferenceFailure> {
  if (!tenantCodec.encode(input.tenant).ok) return { failure: { kind: 'invalid-tenant' } }
  const envelope = parseStreamEnvelope(input.value)
  if ('failure' in envelope)
    return { failure: { kind: 'invalid-envelope', rejection: envelope.failure } }
  return resolveEnvelope(envelope.ok, input.tenant, codec)
}

export function readStreamRef(ref: StreamRef): StreamEnvelope {
  const envelope = parseStreamEnvelope(ref)
  if ('failure' in envelope || canonicalReference(envelope.ok) !== ref)
    throw new TypeError('Invalid StreamRef')
  return envelope.ok
}

type ParsedCursor = Readonly<{ ref: string; position: StreamPosition }>

function parseCursor(value: unknown): Outcome<ParsedCursor, StreamValueRejection> {
  const tuple = parseTuple(value, 'StreamCursor', STREAM_CURSOR_MAX_LENGTH, 'stream-cursor', 4)
  if ('failure' in tuple) return tuple
  const ref = tuple.ok[2]
  if (typeof ref !== 'string') return reject('StreamCursor', 'shape')
  if (ref.length === 0 || ref.length > STREAM_REFERENCE_MAX_LENGTH)
    return reject('StreamCursor', 'length')
  const position = decodeStreamPosition(tuple.ok[3])
  if ('failure' in position) return reject('StreamCursor', 'position')
  return { ok: { ref, position: position.ok } }
}

function canonicalCursor(parts: ParsedCursor): string {
  return JSON.stringify(['stream-cursor', 1, parts.ref, parts.position])
}

export function encodeStreamCursor(
  parts: StreamCursorParts,
): Outcome<StreamCursor, StreamCursorFailure> {
  const captured = captureRecord(parts, ['ref', 'position'])
  if ('failure' in captured)
    return {
      failure: { kind: 'invalid', rejection: { field: 'StreamCursor', reason: captured.failure } },
    }
  const { ref, position } = captured.ok
  readStreamRef(ref)
  const decoded = decodeStreamPosition(position)
  if ('failure' in decoded)
    return {
      failure: { kind: 'invalid', rejection: { field: 'StreamCursor', reason: 'position' } },
    }
  const cursor = canonicalCursor({ ref, position: decoded.ok })
  if (cursor.length > STREAM_CURSOR_MAX_LENGTH)
    return { failure: { kind: 'invalid', rejection: { field: 'StreamCursor', reason: 'length' } } }
  return { ok: cursor as StreamCursor }
}

export function judgeStreamCursor(
  input: Readonly<{ value: unknown; ref: StreamRef }>,
): Outcome<StreamCursor, StreamCursorFailure> {
  const parsed = parseCursor(input.value)
  if ('failure' in parsed) return { failure: { kind: 'invalid', rejection: parsed.failure } }
  if (parsed.ok.ref !== input.ref) return { failure: { kind: 'foreign-stream' } }
  return { ok: canonicalCursor(parsed.ok) as StreamCursor }
}

export function readStreamCursor(cursor: StreamCursor): StreamCursorParts {
  const parsed = parseCursor(cursor)
  if ('failure' in parsed || canonicalCursor(parsed.ok) !== cursor)
    throw new TypeError('Invalid StreamCursor')
  readStreamRef(parsed.ok.ref as StreamRef)
  return Object.freeze({ ref: parsed.ok.ref as StreamRef, position: parsed.ok.position })
}

export function compareStreamPositions(left: StreamPosition, right: StreamPosition): -1 | 0 | 1 {
  if (left === right) return 0
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left < right ? -1 : 1
}
