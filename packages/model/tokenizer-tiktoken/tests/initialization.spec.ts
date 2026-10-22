import type { Adoption } from '@omne-harness/model-contract'
import { createTiktokenTokenizer, type TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { describe, expect, it } from 'vitest'
import { DIGESTS, o200kResources, syntheticResources } from './support/resources.ts'

type Part = 'implementation' | 'vocabulary' | 'configuration'

function withAdoption(
  resources: TiktokenResources,
  part: Part,
  change: Partial<Adoption>,
): TiktokenResources {
  const definition = resources.definition
  return { ...resources, definition: { ...definition, [part]: { ...definition[part], ...change } } }
}

function expectUnavailable(resources: TiktokenResources, diagnostic: RegExp): void {
  const created = createTiktokenTokenizer(resources)
  expect(created).toEqual({
    failure: { kind: 'unavailable', diagnostic: expect.stringMatching(diagnostic) },
  })
}

describe('the three adoption checks', () => {
  it('accept resources whose revision and digests match', () => {
    expect('ok' in createTiktokenTokenizer(o200kResources())).toBe(true)
    expect('ok' in createTiktokenTokenizer(syntheticResources())).toBe(true)
  })

  it('return unavailable when the implementation revision is not the installed js-tiktoken', () => {
    for (const revision of ['1.0.20', '1.0.22', '']) {
      expectUnavailable(
        withAdoption(o200kResources(), 'implementation', { revision }),
        /implementation revision .* is not the installed js-tiktoken 1\.0\.21/,
      )
    }
  })

  it('return unavailable when the vocabulary digest names other ranks', () => {
    expectUnavailable(
      withAdoption(o200kResources(), 'vocabulary', { digest: DIGESTS.syntheticRanks }),
      /^vocabulary digest/,
    )
  })

  it('return unavailable when the ranks change under an adopted vocabulary digest', () => {
    const resources = o200kResources()
    const ranks = { ...resources.ranks, bpeRanks: `${resources.ranks.bpeRanks}! 999999 AA==\n` }
    expectUnavailable({ ...resources, ranks }, /^vocabulary digest/)
    const special = { ...resources.ranks, specialTokens: { '<|endoftext|>': 199999 } }
    expectUnavailable({ ...resources, ranks: special }, /^vocabulary digest/)
  })

  it('return unavailable when the configuration digest does not match the special-token table', () => {
    expectUnavailable(
      withAdoption(o200kResources(), 'configuration', { digest: DIGESTS.emptyTable }),
      /^configuration digest/,
    )
    expectUnavailable(
      { ...o200kResources(), specialTokens: { '<|endoftext|>': 199999, '<|extra|>': 1 } },
      /^configuration digest/,
    )
  })

  it('compare the digest exactly, so an upper-case spelling of the same digest does not match', () => {
    expectUnavailable(
      withAdoption(o200kResources(), 'vocabulary', { digest: DIGESTS.o200kRanks.toUpperCase() }),
      /^vocabulary digest/,
    )
  })

  it('return unavailable for a special-token id that has no canonical JSON form', () => {
    for (const id of [Number.NaN, -1, 1.5]) {
      expectUnavailable(
        { ...syntheticResources(), specialTokens: { '<|fim|>': id } },
        /not a non-negative safe integer/,
      )
    }
  })
})
