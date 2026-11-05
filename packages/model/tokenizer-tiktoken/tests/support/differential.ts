import { Tiktoken } from 'js-tiktoken/lite'
import type { TiktokenRanks, TiktokenResources } from '../../src/resources.ts'
import { ranksDigest, resourceDigest } from '../../src/digest.ts'
import { createTiktokenTokenizer } from '../../src/tokenizer.ts'
import { syntheticResources } from './resources.ts'

export function ranksOf(
  tokens: Readonly<Record<string, number>>,
  patStr = '[\\s\\S]+',
): TiktokenRanks {
  return {
    patStr,
    specialTokens: { '<|special|>': 500 },
    bpeRanks: Object.entries(tokens)
      .map(([token, rank]) => `! ${String(rank)} ${Buffer.from(token).toString('base64')}`)
      .join('\n'),
  }
}

export function resourcesOf(ranks: TiktokenRanks): TiktokenResources {
  const given = syntheticResources()
  return {
    ...given,
    ranks,
    specialTokens: ranks.specialTokens,
    definition: {
      ...given.definition,
      vocabulary: { ...given.definition.vocabulary, digest: ranksDigest(ranks) },
      configuration: {
        ...given.definition.configuration,
        digest: resourceDigest(ranks.specialTokens),
      },
    },
  }
}

export function pairOf(ranks: TiktokenRanks) {
  const result = createTiktokenTokenizer(resourcesOf(ranks))
  if ('failure' in result) throw new Error(JSON.stringify(result.failure))
  return {
    tokenizer: result.ok,
    oracle: new Tiktoken({
      pat_str: ranks.patStr,
      bpe_ranks: ranks.bpeRanks,
      special_tokens: ranks.specialTokens,
    }),
  }
}

export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
}

export function words(alphabet: readonly string[], maximum: number): string[] {
  const result = ['']
  let level = ['']
  for (let length = 1; length <= maximum; length++) {
    level = level.flatMap(prefix => alphabet.map(letter => prefix + letter))
    result.push(...level)
  }
  return result
}
