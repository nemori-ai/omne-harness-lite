import type { MediaMeasurementFact, TransportFailure } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { GLM_OWNER } from './owner.ts'
import type { ImageTokenRule } from './record.ts'

const POSITIVE = /^[1-9][0-9]*$/
const NONNEGATIVE = /^(0|[1-9][0-9]*)$/

function unavailable(diagnostic: string): Outcome<never, TransportFailure> {
  return { failure: { kind: 'unavailable', dependency: GLM_OWNER, diagnostic } }
}

/** Keep each image's contribution on its own message when calibrating a suffix. */
export function imageExtras(
  rule: ImageTokenRule | undefined,
  units: readonly Readonly<{ images: number }>[],
  media: readonly MediaMeasurementFact[],
): Outcome<readonly bigint[], TransportFailure> {
  const facts = media.filter(fact => fact.kind === 'image')
  const count = units.reduce((total, unit) => total + unit.images, 0)
  if (facts.length !== count) return unavailable('image-measurement-missing')
  if (count === 0) return { ok: units.map(() => 0n) }
  if (rule === undefined) return unavailable('image-rule-missing')
  if (
    !POSITIVE.test(rule.tilePixels) ||
    !POSITIVE.test(rule.tokensPerTile) ||
    !NONNEGATIVE.test(rule.overheadTokens)
  )
    throw new RangeError('invalid image token rule')
  const tile = BigInt(rule.tilePixels)
  const rate = BigInt(rule.tokensPerTile)
  const overhead = BigInt(rule.overheadTokens)
  const extras = []
  let position = 0
  for (const unit of units) {
    let extra = 0n
    for (let index = 0; index < unit.images; index++) {
      const fact = facts[position++]
      if (
        fact === undefined ||
        !POSITIVE.test(fact.widthPixels) ||
        !POSITIVE.test(fact.heightPixels)
      )
        return unavailable('invalid-image-dimensions')
      const across = (BigInt(fact.widthPixels) + tile - 1n) / tile
      const down = (BigInt(fact.heightPixels) + tile - 1n) / tile
      extra += across * down * rate + overhead
    }
    extras.push(extra)
  }
  return { ok: extras }
}
