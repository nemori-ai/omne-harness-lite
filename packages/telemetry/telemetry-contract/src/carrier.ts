export type Carrier = string & { readonly __brand: 'TelemetryCarrier' }

const CARRIER = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/
const TRACE_ID = /^[0-9a-f]{32}$/
const SPAN_ID = /^[0-9a-f]{16}$/
const ALL_ZERO = /^0+$/

type Decoded =
  | Readonly<{ kind: 'ok'; traceId: string; spanId: string; sampled: boolean; carrier: Carrier }>
  | Readonly<{ kind: 'invalid' }>

const INVALID: Decoded = Object.freeze({ kind: 'invalid' })

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
    carrier: value as Carrier,
  })
}

export function decodeCarrier(text: string): Decoded {
  return decodeValue(text)
}

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
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}` as Carrier
}
