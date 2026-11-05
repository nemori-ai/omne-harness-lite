// How a port answer is taken, by the contract SPEC "端口答复的统一处置". A port answer is data
// from outside this member, so it is parsed whole, once, where it comes in: the discriminant and
// the payload, into the closed set of the port type. `answered` runs the call and the parse
// together. A port that rejects or throws, an answer that the parse does not take, and an answer
// that throws while it is read all give `undefined`: no answer. Each service says what no answer
// is for it: `unknown` for the read check and the resolution, `unavailable` for the source.
// The parse of `resolve` also takes the request: an answer about another identity, or, with a
// basis, about other material than the basis, is no answer either (S7, "引用身份一致").
import type { CapabilityId } from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { sameCapability, type SkillMaterialBasis } from '@omne-harness/skill-contract'
import type {
  CatalogResolution,
  ReadVerdict,
  Resolution,
  SkillRef,
} from '@omne-harness/skill-contract/provider'
import { adoptedOf, fieldOf, has, listOf, standInOf } from './answer-values.ts'

/** The answer of a port call in the form that `parse` gives, or `undefined` when the port did not answer. */
export async function answered<T>(
  call: () => Promise<unknown>,
  parse: (answer: unknown) => T | undefined,
): Promise<T | undefined> {
  try {
    return parse(await call())
  } catch {
    return undefined
  }
}

const GRANTED: ReadVerdict = Object.freeze({ kind: 'granted' })
const REFUSED: ReadVerdict = Object.freeze({ kind: 'refused' })
const UNDECIDED: ReadVerdict = Object.freeze({ kind: 'unknown' })
const BASIS_NOT_LAWFUL: Resolution = Object.freeze({ kind: 'basis-not-lawful' })
const NONE: Resolution = Object.freeze({ kind: 'none' })
const UNKNOWN_RESOLUTION: Resolution = Object.freeze({ kind: 'unknown' })

/** `SkillReadCheck.check`: one of the three verdicts. */
export function parseVerdict(answer: unknown): ReadVerdict | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'granted':
      return GRANTED
    case 'refused':
      return REFUSED
    case 'unknown':
      return UNDECIDED
  }
  return undefined
}

/** What one `resolve` call asked about: the identity and, when the caller gave one, the basis. */
export type ResolveRequest = Readonly<{ capability: CapabilityId; basis?: SkillMaterialBasis }>

/**
 * Whether `ref` names the material of `request`: the requested identity and, with a basis, the
 * source layer, the asset version (when the basis has one) and the digest of the basis. A basis
 * names material with a digest, so a reference without one is not that material (S7).
 */
function namesRequested(ref: SkillRef, request: ResolveRequest): boolean {
  if (!sameCapability(ref.capability, request.capability)) return false
  const { basis } = request
  if (basis === undefined) return true
  return (
    ref.layer === basis.layer &&
    (basis.assetVersion === undefined || ref.assetVersion === basis.assetVersion) &&
    ref.digest === basis.digest
  )
}

/**
 * `SkillResolution.resolve`: one of the five answers, each with its whole payload, and about
 * `request`. An `adopted` reference or a stand-in of another identity is no answer, so the value
 * that comes out names only the requested material and no later step looks at this again.
 */
export function parseResolution(
  request: ResolveRequest,
): (answer: unknown) => Resolution | undefined {
  return answer => {
    switch (fieldOf(answer, 'kind')) {
      case 'adopted': {
        const adopted = adoptedOf(answer)
        return adopted !== undefined && namesRequested(adopted.ref, request) ? adopted : undefined
      }
      case 'known-unavailable': {
        const standIn = standInOf(answer)
        return standIn !== undefined && sameCapability(standIn.capability, request.capability)
          ? standIn
          : undefined
      }
      default:
        return payloadFreeOf(answer)
    }
  }
}

/** The three answers of `resolve` without a payload. */
function payloadFreeOf(answer: unknown): Resolution | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'basis-not-lawful':
      return BASIS_NOT_LAWFUL
    case 'none':
      return NONE
    case 'unknown':
      return UNKNOWN_RESOLUTION
  }
  return undefined
}

/** One item of the lawful set: only the two answers that the set holds. The identity of an item
 * is the identity it names (`ref.capability` or `capability`): there is no request to compare. */
function parseLawfulItem(answer: unknown): CatalogResolution | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'adopted':
      return adoptedOf(answer)
    case 'known-unavailable':
      return standInOf(answer)
  }
  return undefined
}

/** `SkillResolution.adopted`: a list whose every item parses, or the failure `unknown`. One item
 * that does not parse makes the whole answer no answer: a part of the set is not the set. */
export function parseLawfulSet(
  answer: unknown,
): Outcome<readonly CatalogResolution[], 'unknown'> | undefined {
  if (has(answer, 'ok')) {
    const items = listOf(answer.ok, parseLawfulItem)
    return items === undefined ? undefined : succeed(items)
  }
  return fieldOf(answer, 'failure') === 'unknown' ? fail('unknown') : undefined
}
