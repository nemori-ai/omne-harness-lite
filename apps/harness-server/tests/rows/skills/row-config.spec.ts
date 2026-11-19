import { describe, expect, it } from 'vitest'
import { SEARCH_RANKING } from '../../../src/entry/search-ranking.ts'
import { skillsRowConfig } from '../../../src/rows/skills/index.ts'
import { tenantAssetsRowConfig } from '../../../src/rows/tenant-assets/index.ts'

describe('the skills row configuration', () => {
  it('takes the search parameters, b from 0 to 1 included', () => {
    for (const b of [0, SEARCH_RANKING.b, 1])
      expect(skillsRowConfig.parse({ ranking: { k1: 1.2, b } })).toEqual({
        ranking: { k1: 1.2, b },
      })
  })

  it.each([
    ['k1 of zero', { ranking: { k1: 0, b: 0.75 } }],
    ['b below zero', { ranking: { k1: 1.2, b: -0.1 } }],
    ['b above one', { ranking: { k1: 1.2, b: 1.1 } }],
    ['no ranking', {}],
    [
      'a package root, which belongs to the tenant-assets row',
      { packageRoot: '/a', ranking: SEARCH_RANKING },
    ],
  ])('refuses %s', (_, config) => {
    expect(skillsRowConfig.safeParse(config).success).toBe(false)
  })
})

describe('the tenant-assets row configuration', () => {
  it('takes a package root and the upload policy, with defaults for the policy, and nothing else', () => {
    expect(tenantAssetsRowConfig.parse({ packageRoot: '/state/assets' })).toEqual({
      packageRoot: '/state/assets',
      uploads: { idleSeconds: 3600, maxOpen: 8, partBytes: 524_288 },
    })
    expect(
      tenantAssetsRowConfig.parse({ packageRoot: '/a', uploads: { idleSeconds: 60, maxOpen: 1 } }),
    ).toEqual({ packageRoot: '/a', uploads: { idleSeconds: 60, maxOpen: 1, partBytes: 524_288 } })
    expect(tenantAssetsRowConfig.safeParse({ packageRoot: '' }).success).toBe(false)
    expect(tenantAssetsRowConfig.safeParse({}).success).toBe(false)
    expect(tenantAssetsRowConfig.safeParse({ packageRoot: '/a', cache: true }).success).toBe(false)
    expect(
      tenantAssetsRowConfig.safeParse({ packageRoot: '/a', uploads: { maxOpen: 0 } }).success,
    ).toBe(false)
  })
})
