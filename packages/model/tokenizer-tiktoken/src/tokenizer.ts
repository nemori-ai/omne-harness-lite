import { Tiktoken } from 'js-tiktoken/lite'
import type {
  ModelTextTokenizer,
  TokenizationFailure,
  TokenizationSegment,
  TokenizerDefinition,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { ranksDigest, resourceDigest, ResourceShapeError } from './digest.ts'
import { installedEngineVersion } from './engine-version.ts'
import type { TiktokenResources } from './resources.ts'

type Count = Outcome<Readonly<{ tokens: string }>, TokenizationFailure>

function unavailable(diagnostic: string): Outcome<never, TokenizationFailure> {
  return fail({ kind: 'unavailable', diagnostic })
}

/** The first adoption check that fails, as a diagnostic, or `undefined` when all three hold. */
function adoptionMismatch(resources: TiktokenResources): string | undefined {
  const { implementation, vocabulary, configuration } = resources.definition
  const engine = installedEngineVersion()
  if ('failure' in engine) return engine.failure
  if (implementation.revision !== engine.ok)
    return `implementation revision ${implementation.revision} is not the installed js-tiktoken ${engine.ok}`
  if (vocabulary.digest !== ranksDigest(resources.ranks))
    return 'vocabulary digest does not match the SHA-256 of the canonical JSON of the ranks'
  if (configuration.digest !== resourceDigest(resources.specialTokens))
    return 'configuration digest does not match the SHA-256 of the canonical JSON of the special tokens'
  return undefined
}

/** Encodes as ordinary text: no special token is allowed, and none is refused. */
function textTokens(engine: Tiktoken, text: string): number {
  return text === '' ? 0 : engine.encode(text, [], []).length
}

/**
 * Counts a segment sequence. Adjacent text segments join into one text before encoding, because
 * token counts of separate pieces do not add up to the count of the joined text.
 */
function countSegments(
  engine: Tiktoken,
  specialTokens: ReadonlySet<string>,
  input: readonly TokenizationSegment[],
): Count {
  let total = 0
  let run = ''
  for (const segment of input) {
    switch (segment.kind) {
      case 'text':
        if (!segment.text.isWellFormed())
          return fail({ kind: 'invalid', reason: 'a text segment is not well-formed Unicode' })
        run += segment.text
        break
      case 'special-token':
        if (!specialTokens.has(segment.name))
          return fail({ kind: 'unsupported-token', name: segment.name })
        total += textTokens(engine, run) + 1
        run = ''
        break
      default: {
        const _exhaustive: never = segment
        return fail({ kind: 'invalid', reason: `unknown segment ${JSON.stringify(_exhaustive)}` })
      }
    }
  }
  total += textTokens(engine, run)
  return succeed({ tokens: String(total) })
}

function frozenDefinition(definition: TokenizerDefinition): TokenizerDefinition {
  return Object.freeze({
    adoption: Object.freeze({ ...definition.adoption }),
    implementation: Object.freeze({ ...definition.implementation }),
    vocabulary: Object.freeze({ ...definition.vocabulary }),
    configuration: Object.freeze({ ...definition.configuration }),
  })
}

/**
 * Checks the family-supplied resources once and returns a tokenizer that counts with them.
 * Any failed adoption check returns `unavailable`; no other encoding replaces the resources.
 */
export function createTiktokenTokenizer(
  resources: TiktokenResources,
): Outcome<ModelTextTokenizer, TokenizationFailure> {
  let mismatch: string | undefined
  try {
    mismatch = adoptionMismatch(resources)
  } catch (error) {
    if (error instanceof ResourceShapeError) return unavailable(error.message)
    throw error
  }
  if (mismatch !== undefined) return unavailable(mismatch)
  const { patStr, specialTokens, bpeRanks } = resources.ranks
  const engine = new Tiktoken({
    pat_str: patStr,
    special_tokens: { ...specialTokens },
    bpe_ranks: bpeRanks,
  })
  // Own keys only, copied now: later changes to the caller's table do not change any count.
  const allowed: ReadonlySet<string> = new Set(Object.keys(resources.specialTokens))
  const tokenizer: ModelTextTokenizer = {
    definition: frozenDefinition(resources.definition),
    count: input => countSegments(engine, allowed, input),
  }
  return succeed(Object.freeze(tokenizer))
}
