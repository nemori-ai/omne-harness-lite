import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { InputProjection } from '../projection.ts'
import { prefixDigest } from '../projection.ts'
import type { NewMeterInput, ReplayMeterInput } from '../input-meter.ts'
import type { OutputGroupSource } from './output-history.ts'

interface PrefixFact {
  readonly digest: string
  readonly envelope: string
  readonly revision: string
}
const prefixes = new WeakMap<object, ReadonlyMap<number, PrefixFact>>()
function fact(projection: InputProjection, start: number): PrefixFact | undefined {
  if (!Number.isSafeInteger(start) || start < 0 || start > projection.units.length) return undefined
  return Object.freeze({
    digest: prefixDigest(projection.units.slice(0, start)),
    envelope: projection.requestInput.inputEnvelopeDigest,
    revision: projection.requestInput.projectionRevision,
  })
}
/** Final meter identity owns only derived facts; P is never delivered to its counter. */
export function withOutputPrefix<T>(
  input: NewMeterInput | ReplayMeterInput,
  projection: InputProjection,
  call: () => T,
): T {
  if (prefixes.has(input)) throw new TypeError('active meter input')
  if (!Object.isFrozen(input)) throw new TypeError('meter input must be final')
  const facts = new Map<number, PrefixFact>()
  const spans = 'historySpans' in input ? input.historySpans : input.selectionSpans
  for (const span of spans) {
    if (facts.has(span.start)) continue
    const current = fact(projection, span.start)
    if (current) facts.set(span.start, current)
  }
  prefixes.set(input, facts)
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
  const original = source.observation.inputCalibration.requestInput
  if (
    original.kind !== 'known' ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    ExactDecimal.from(original.prefixBoundary).compare(ExactDecimal.from(start)) !== 0
  )
    return false
  const current = full ? fact(full, start) : prefixes.get(input)?.get(start)
  return (
    current !== undefined &&
    original.projectionRevision === current.revision &&
    original.inputEnvelopeDigest === current.envelope &&
    original.prefixDigest === current.digest
  )
}
