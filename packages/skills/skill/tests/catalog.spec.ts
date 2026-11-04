// The `SkillCatalog` conformance suite of `skill-contract/testing` runs on `createSkillCatalog`
// over the memory doubles, each case on a fresh fixture. A not-applicable case counts as a
// failure here: the fixture offers everything. The same suite runs in process on two violating
// implementations: one that lists a refused identity too, which fails exactly the non-disclosure
// and filter cases, and one that presses `unknown` into an empty list, which fails exactly the
// whole-unknown cases. The order tests hold the read check answers and release them first to
// last and last to first: the answer is the same.
import { AssertionError } from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createSkillCatalog } from '@omne-harness/skill'
import type { SkillCatalog } from '@omne-harness/skill-contract'
import {
  runConformanceCase,
  skillCatalogConformance,
  type CatalogFixture,
} from '@omne-harness/skill-contract/testing'
import { alice, scope, type Principal, type Scope } from './access-world.ts'
import {
  catalogFixture,
  createCatalogWorld,
  retiredEntry,
  review,
  reviewEntry,
  type CatalogWorld,
} from './catalog-world.ts'

const cases = skillCatalogConformance<Principal, Scope>()

describe('the suite', () => {
  it('has at least 12 cases over the clauses SC2 to SC7', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12)
    const clauses = new Set(cases.map(item => item.clause))
    for (const item of [2, 3, 4, 5, 6, 7]) expect(clauses).toContain(`SC${item}`)
  })
})

describe('SkillCatalog conformance: createSkillCatalog over the memory doubles', () => {
  for (const conformance of cases)
    it(`${conformance.clause} ${conformance.name}`, async () => {
      expect(await runConformanceCase(conformance, catalogFixture())).toStrictEqual({
        kind: 'passed',
      })
    })
})

/** The names of the cases that fail by an assertion. Any other error is thrown. */
async function failing(fixture: () => CatalogFixture<Principal, Scope>): Promise<string[]> {
  const failed: string[] = []
  for (const conformance of cases)
    try {
      await conformance.run(fixture())
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error
      failed.push(conformance.name)
    }
  return failed
}

/** A catalog that lists a refused identity as if it were granted. */
function listingRefused(world: CatalogWorld): SkillCatalog<Principal, Scope> {
  return createSkillCatalog({
    ...world.ports,
    readCheck: {
      async check(who, at, item) {
        const verdict = await world.ports.readCheck.check(who, at, item)
        return verdict.kind === 'refused' ? { kind: 'granted' } : verdict
      },
    },
  })
}

/** A catalog that answers an empty list where the real one answers unknown. */
function pressingUnknown(world: CatalogWorld): SkillCatalog<Principal, Scope> {
  const pressed = async <T>(answer: Promise<{ ok: T } | { failure: 'unknown' }>) => {
    const outcome = await answer
    return 'ok' in outcome ? outcome : succeed([])
  }
  return {
    summaries: (who, at, capabilities) => pressed(world.catalog.summaries(who, at, capabilities)),
    search: (who, at, query) => pressed(world.catalog.search(who, at, query)),
  }
}

describe('the suite goes red on a violating implementation', () => {
  it('fails exactly the non-disclosure and filter cases on a catalog that lists a refused identity', async () => {
    expect(await failing(() => catalogFixture(listingRefused))).toStrictEqual([
      'lists a granted identity and not a refused one',
      'filters to the identities of the request that are lawful and granted',
      'answers the same whether a refused identity is in the lawful set or does not exist',
      'answers a filter naming a refused identity the same as one naming a missing identity',
    ])
  })

  it('fails exactly the whole-unknown cases on a catalog that presses unknown into an empty list', async () => {
    expect(await failing(() => catalogFixture(pressingUnknown))).toStrictEqual([
      'answers unknown when the lawful set is unknown',
      'answers unknown when the read check of one identity is unknown',
    ])
  })

  it('passes every case on the real catalog, so the failures above come from the violations', async () => {
    expect(await failing(() => catalogFixture())).toStrictEqual([])
  })
})

describe('the answer does not depend on the order in which the read checks complete', () => {
  it('lists the same entries whether the checks complete first to last or last to first', async () => {
    const forward = createCatalogWorld()
    const reverse = createCatalogWorld()
    const heldForward = forward.controls.holdVerdicts()
    const heldReverse = reverse.controls.holdVerdicts()
    const answers = [
      forward.catalog.summaries(alice, scope),
      reverse.catalog.summaries(alice, scope),
    ]
    await setImmediate()
    expect(heldForward.pending()).toBe(3)
    expect(heldReverse.pending()).toBe(3)
    heldForward.release('forward')
    heldReverse.release('reverse')
    const [first, second] = await Promise.all(answers)
    expect(first).toStrictEqual({ ok: [retiredEntry, reviewEntry] })
    expect(second).toStrictEqual(first)
  })

  it('answers unknown whether the unknown check completes first or last', async () => {
    for (const order of ['forward', 'reverse'] as const) {
      const world = createCatalogWorld()
      world.controls.verdictUnknown(review)
      const held = world.controls.holdVerdicts()
      const answer = world.catalog.search(alice, scope, { text: '' })
      await setImmediate()
      held.release(order)
      expect(await answer).toStrictEqual({ failure: 'unknown' })
    }
  })
})
