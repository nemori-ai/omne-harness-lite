import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { InputProjection } from '../projection.ts'
import { prefixDigest } from '../projection.ts'
import type { OutputGroupSource } from './output-history.ts'

const prefixes = new WeakMap<object, InputProjection>()
/** Synchronous planner capability. No DTO, durable record or clone carries it. */
export function withOutputPrefix<T>(input: object, projection: InputProjection, call: () => T): T {
  if (prefixes.has(input)) throw new TypeError('active meter input')
  prefixes.set(input, projection)
  try {
    return call()
  } finally {
    prefixes.delete(input)
  }
}
export function signedPrefixApplies(
  input: object,
  source: OutputGroupSource,
  start: number,
  full?: InputProjection,
): boolean {
  const projection = full ?? prefixes.get(input)
  const original = source.observation.inputCalibration.requestInput
  if (
    !projection ||
    original.kind !== 'known' ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    start > projection.units.length ||
    ExactDecimal.from(original.prefixBoundary).compare(ExactDecimal.from(start)) !== 0
  )
    return false
  return (
    original.projectionRevision === projection.requestInput.projectionRevision &&
    original.inputEnvelopeDigest === projection.requestInput.inputEnvelopeDigest &&
    original.prefixDigest === prefixDigest(projection.units.slice(0, start))
  )
}
