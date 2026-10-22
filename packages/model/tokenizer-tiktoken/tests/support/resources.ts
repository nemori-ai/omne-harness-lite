import { readFileSync } from 'node:fs'
import o200k from 'js-tiktoken/ranks/o200k_base'
import type { Adoption } from '@omne-harness/model-contract'
import type { TiktokenRanks, TiktokenResources } from '@omne-harness/tokenizer-tiktoken'

/** The js-tiktoken version that the repository catalog pins. */
export const ENGINE_REVISION = '1.0.21'

/**
 * SHA-256 of the canonical JSON (sorted keys, no white space) of each resource. The values were
 * computed outside this package, with Python `json.dumps(sort_keys=True, separators=(',', ':'),
 * ensure_ascii=False)`, so they check the canonical form and not only its self-consistency.
 */
export const DIGESTS = {
  o200kRanks: '6cf16f9e2292763021bb70ffed8e113a55f8d26f34110514c2518f47db1ea806',
  o200kSpecialTokens: '94c390bc2638a0888b4ce311255bb8ba2c1f8240037ea4a6ad069bdde7e7ee04',
  syntheticRanks: 'a36135f4394243b725759ba3c48664004809ca4717a3ecffc4b79ff62410bb8c',
  syntheticSpecialTokens: 'c9d17a539029617dbd8ef5a3aad19ad255d63cd5deae9ef9bdda7b788e453de5',
  emptyTable: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
} as const

/** The o200k ranks from js-tiktoken, renamed to the camel-case shape of `TiktokenRanks`. */
export const o200kRanks: TiktokenRanks = {
  patStr: o200k.pat_str,
  specialTokens: o200k.special_tokens,
  bpeRanks: o200k.bpe_ranks,
}

/** The fixed special-token table that the o200k tests allow. */
export const o200kSpecialTokens: Readonly<Record<string, number>> = {
  '<|endoftext|>': 199999,
  '<|endofprompt|>': 200018,
}

function isIdTable(value: unknown): value is Readonly<Record<string, number>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(id => typeof id === 'number')
  )
}

function isRanks(value: unknown): value is TiktokenRanks {
  if (typeof value !== 'object' || value === null) return false
  return (
    typeof Reflect.get(value, 'patStr') === 'string' &&
    typeof Reflect.get(value, 'bpeRanks') === 'string' &&
    isIdTable(Reflect.get(value, 'specialTokens'))
  )
}

function readRanks(file: URL): TiktokenRanks {
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!isRanks(value)) throw new TypeError(`${file.pathname} is not a tiktoken ranks fixture`)
  return value
}

/** A second, synthetic vocabulary; see `tests/fixtures/README.md` for its tokens. */
export const syntheticRanks: TiktokenRanks = readRanks(
  new URL('../fixtures/synthetic-ranks.json', import.meta.url),
)

export const syntheticSpecialTokens: Readonly<Record<string, number>> = { '<|fim|>': 300 }

function adoption(name: string, revision: string, digest: string): Adoption {
  return { owner: 'tokenizer-tiktoken-tests', name, revision, digest }
}

/** Resources whose three adoption checks hold, unless a test overrides a part. */
export function o200kResources(): TiktokenResources {
  return {
    definition: {
      adoption: adoption('o200k-test', '1', DIGESTS.o200kRanks),
      implementation: adoption('js-tiktoken', ENGINE_REVISION, DIGESTS.o200kRanks),
      vocabulary: adoption('o200k_base', '1', DIGESTS.o200kRanks),
      configuration: adoption('o200k-test-special-tokens', '1', DIGESTS.o200kSpecialTokens),
    },
    ranks: o200kRanks,
    specialTokens: o200kSpecialTokens,
  }
}

export function syntheticResources(): TiktokenResources {
  return {
    definition: {
      adoption: adoption('synthetic-test', '1', DIGESTS.syntheticRanks),
      implementation: adoption('js-tiktoken', ENGINE_REVISION, DIGESTS.syntheticRanks),
      vocabulary: adoption('synthetic', '1', DIGESTS.syntheticRanks),
      configuration: adoption('synthetic-special-tokens', '1', DIGESTS.syntheticSpecialTokens),
    },
    ranks: syntheticRanks,
    specialTokens: syntheticSpecialTokens,
  }
}
