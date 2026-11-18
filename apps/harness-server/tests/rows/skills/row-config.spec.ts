import { describe, expect, it } from 'vitest'
import { SEARCH_RANKING } from '../../../src/entry/search-ranking.ts'
import { skillsRowConfig } from '../../../src/rows/skills/index.ts'

describe('the skills row configuration', () => {
  it('takes a package root and the search parameters, b from 0 to 1 included', () => {
    for (const b of [0, SEARCH_RANKING.b, 1])
      expect(
        skillsRowConfig.parse({ packageRoot: '/state/assets', ranking: { k1: 1.2, b } }),
      ).toEqual({ packageRoot: '/state/assets', ranking: { k1: 1.2, b } })
  })

  it.each([
    ['an empty package root', { packageRoot: '', ranking: SEARCH_RANKING }],
    ['k1 of zero', { packageRoot: '/a', ranking: { k1: 0, b: 0.75 } }],
    ['b below zero', { packageRoot: '/a', ranking: { k1: 1.2, b: -0.1 } }],
    ['b above one', { packageRoot: '/a', ranking: { k1: 1.2, b: 1.1 } }],
    ['no ranking', { packageRoot: '/a' }],
    ['an unknown key', { packageRoot: '/a', ranking: SEARCH_RANKING, cache: true }],
  ])('refuses %s', (_, config) => {
    expect(skillsRowConfig.safeParse(config).success).toBe(false)
  })
})
