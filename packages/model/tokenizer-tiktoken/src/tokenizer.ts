import { Tiktoken } from 'js-tiktoken/lite'
import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type {
  TokenizationFailure,
  TokenizationSegment,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { ranksDigest, resourceDigest, ResourceShapeError } from './digest.ts'
import { installedEngineVersion } from './engine-version.ts'
import { createOrdinaryCounter } from './ordinary-counter.ts'
import type { TiktokenResources } from './resources.ts'
import type { PieceCache } from './piece-cache.ts'
import { frozenDefinition } from './definition.ts'

type Count = Outcome<Readonly<{ tokens: string }>, TokenizationFailure>

export type WorkerTokenizer = Readonly<{
  definition: TokenizerDefinition
  count(
    input: readonly TokenizationSegment[],
    lease: number,
    cache: PieceCache,
    cancelled: () => void,
  ): Count
}>

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

/**
 * Counts a segment sequence. Adjacent text segments join into one text before encoding, because
 * token counts of separate pieces do not add up to the count of the joined text.
 */
function countSegments(
  textTokens: (text: string) => number,
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
        total += textTokens(run) + 1
        run = ''
        break
      default: {
        const _exhaustive: never = segment
        return fail({ kind: 'invalid', reason: `unknown segment ${JSON.stringify(_exhaustive)}` })
      }
    }
  }
  total += textTokens(run)
  return succeed({ tokens: String(total) })
}

/**
 * Checks the family-supplied resources once and returns a tokenizer that counts with them.
 * Any failed adoption check returns `unavailable`; no other encoding replaces the resources.
 */
export function createWorkerTokenizer(
  resources: TiktokenResources,
): Outcome<WorkerTokenizer, TokenizationFailure> {
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
  const ordinary = createOrdinaryCounter(engine)
  // Own keys only, copied now: later changes to the caller's table do not change any count.
  const allowed: ReadonlySet<string> = new Set(Object.keys(resources.specialTokens))
  const tokenizer: WorkerTokenizer = {
    definition: frozenDefinition(resources.definition),
    count: (input, lease, cache, cancelled) =>
      countSegments(
        text => ordinary(text, piece => cache.count(lease, piece.text, piece.calculate), cancelled),
        allowed,
        input,
      ),
  }
  return succeed(Object.freeze(tokenizer))
}
