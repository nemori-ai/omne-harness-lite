/**
 * The serializable causal value that crosses processes, queues and recovery. It holds trace and
 * span identities and the format version only: no scope, no principal, no credential.
 */
export type Carrier = string & { readonly __brand: 'TelemetryCarrier' }

// A subset of the W3C traceparent: version 00, lowercase hexadecimal, exactly four parts.
const CARRIER = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/
const TRACE_ID = /^[0-9a-f]{32}$/
const SPAN_ID = /^[0-9a-f]{16}$/
const ALL_ZERO = /^0+$/

type Decoded =
  | Readonly<{ kind: 'ok'; traceId: string; spanId: string; sampled: boolean; carrier: Carrier }>
  | Readonly<{ kind: 'invalid' }>

const INVALID: Decoded = Object.freeze({ kind: 'invalid' })

/** Decodes any value; a value that is not a carrier text is `invalid`. */
export function decodeValue(value: unknown): Decoded {
  if (typeof value !== 'string') return INVALID
  const match = CARRIER.exec(value)
  if (match === null) return INVALID
  const [, traceId, spanId, flags] = match
  if (traceId === undefined || spanId === undefined || flags === undefined) return INVALID
  if (ALL_ZERO.test(traceId) || ALL_ZERO.test(spanId)) return INVALID
  return Object.freeze({
    kind: 'ok',
    traceId,
    spanId,
    sampled: (Number.parseInt(flags, 16) & 1) === 1,
    // The text matched the carrier format above.
    carrier: value as Carrier,
  })
}

/** Decodes a carrier text. Never throws. */
export function decodeCarrier(text: string): Decoded {
  return decodeValue(text)
}

/**
 * Encodes trace and span identities as a carrier. The identities are lowercase hexadecimal and
 * not all zero. Throws TypeError otherwise.
 */
export function encodeCarrier(
  input: Readonly<{ traceId: string; spanId: string; sampled: boolean }>,
): Carrier {
  const { traceId, spanId, sampled } = input
  if (typeof traceId !== 'string' || !TRACE_ID.test(traceId) || ALL_ZERO.test(traceId))
    throw new TypeError(
      'telemetry carrier: traceId is 32 lowercase hexadecimal digits, not all zero',
    )
  if (typeof spanId !== 'string' || !SPAN_ID.test(spanId) || ALL_ZERO.test(spanId))
    throw new TypeError(
      'telemetry carrier: spanId is 16 lowercase hexadecimal digits, not all zero',
    )
  if (typeof sampled !== 'boolean') throw new TypeError('telemetry carrier: sampled is a boolean')
  // The parts were checked above, so the text has the carrier format.
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}` as Carrier
}
