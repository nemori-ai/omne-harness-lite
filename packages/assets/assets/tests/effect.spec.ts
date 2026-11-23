import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  heldEffect,
  type AssetStanding,
  type BodyContract,
  type CategoryEffect,
} from '@omne-harness/assets'

const contract = (category: string): BodyContract => ({
  category,
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
})

const skill = (() => {
  const made = capabilityId('skill', 'review')
  if (!made.ok) throw new Error('capability')
  return made.id
})()

describe('what the owner of a category tells of its own', () => {
  const told: CategoryEffect = {
    impact: { of: async () => ({ kind: 'unavailable', reason: 'told by the owner' }) },
    placement: { of: async () => ({ kind: 'unavailable', reason: 'told by the owner' }) },
  }

  it('is given by the view for the category that contributed it, and not for another', () => {
    const point = createCategoryPoint()
    point.contribute({
      contract: contract('plugin'),
      display: { title: 'Plugin', summary: 'p' },
      point: 'plugin.plugins',
      effect: told,
    })
    point.contribute({
      contract: contract('skill'),
      display: { title: 'Skill', summary: 's' },
      point: 'skill.skills',
    })
    expect(point.effectOf('plugin')).toBe(told)
    expect(point.effectOf('skill')).toBeUndefined()
    expect(point.effectOf('none')).toBeUndefined()
  })

  it('is not given while two contributions of the category stand', () => {
    const point = createCategoryPoint()
    const one = {
      contract: contract('plugin'),
      display: { title: 'Plugin', summary: 'p' },
      point: 'plugin.plugins',
      effect: told,
    }
    point.contribute(one)
    point.contribute({ ...one })
    expect(point.effectOf('plugin')).toBeUndefined()
  })
})

describe('what the assets tell of a category whose owner tells nothing', () => {
  const effect = (
    standing: AssetStanding | undefined,
    point: string | undefined = 'skill.skills',
  ) => heldEffect({ point: () => point, standing: async () => standing })

  it.each([
    ['publish', '+', '→ held; the asset rules pick which one sessions get'],
    ['enable', '+', '→ held; the asset rules pick which one sessions get'],
    ['disable', '-', '→ no longer held'],
    ['remove', '-', '→ no longer held'],
  ] as const)('%s is one line on the point of the category', async (change, mark, says) => {
    expect(
      await effect({ kind: 'selected' }).impact.of({ tenant: 't', capability: skill, change }),
    ).toEqual({
      kind: 'changes',
      lines: [{ mark, of: null, point: 'skill.skills', key: 'review', says }],
      loads: null,
      advice: null,
    })
  })

  it.each([
    [{ kind: 'selected' }, 'selected', 'sessions of this tenant get this one'],
    [{ kind: 'filtered', reason: 'disabled' }, 'not in effect', 'disabled'],
    [{ kind: 'filtered', reason: 'blocked', by: 'a rule' }, 'not in effect', 'blocked by a rule'],
    [{ kind: 'unavailable', layer: 'tenant' }, 'not known', 'the tenant layer cannot be read now'],
  ] as const)('a held one stands as the asset rules have it: %o', async (standing, word, says) => {
    expect(await effect(standing).placement.of({ tenant: 't', capability: skill })).toEqual({
      kind: 'placed',
      places: [{ point: 'skill.skills', key: 'review', standing: word, says }],
      clients: null,
      advice: null,
    })
  })

  it('says so when the category has no point now, or the standing cannot be read', async () => {
    const pointless = heldEffect({
      point: () => undefined,
      standing: async () => ({ kind: 'selected' }),
    })
    const reason = 'category skill has no point now'
    expect(
      await pointless.impact.of({ tenant: 't', capability: skill, change: 'publish' }),
    ).toEqual({ kind: 'unavailable', reason })
    expect(await pointless.placement.of({ tenant: 't', capability: skill })).toEqual({
      kind: 'unavailable',
      reason,
    })
    expect(await effect(undefined).placement.of({ tenant: 't', capability: skill })).toEqual({
      kind: 'unavailable',
      reason: 'how this one stands cannot be read now',
    })
  })
})
