// How a port answer is taken, by the contract SPEC "端口答复的统一处置". A port answer is data
// from outside this member, so it is parsed whole, once, where it comes in: the discriminant and
// the payload, into the closed set of the port type. `answered` runs the call and the parse
// together. A port that rejects or throws, an answer that the parse does not take, and an answer
// that throws while it is read all give `undefined`: no answer. Each service says what no answer
// is for it: `unknown` for the read check and the resolution, `unavailable` for the source.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CatalogResolution,
  ReadVerdict,
  Resolution,
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

/** `SkillResolution.resolve`: one of the five answers, each with its whole payload. */
export function parseResolution(answer: unknown): Resolution | undefined {
  switch (fieldOf(answer, 'kind')) {
    case 'adopted':
      return adoptedOf(answer)
    case 'known-unavailable':
      return standInOf(answer)
    case 'basis-not-lawful':
      return BASIS_NOT_LAWFUL
    case 'none':
      return NONE
    case 'unknown':
      return UNKNOWN_RESOLUTION
  }
  return undefined
}

/** One item of the lawful set: only the two answers that the set holds. */
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
