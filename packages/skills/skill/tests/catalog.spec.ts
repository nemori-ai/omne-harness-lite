// The `SkillCatalog` conformance suite of `skill-contract/testing` runs on `createSkillCatalog`
// over the memory doubles, each case on a fresh fixture. A not-applicable case counts as a
// failure here: the fixture offers everything. The same suite runs in process on two violating
// implementations: one that lists a refused identity too, which fails exactly the four cases
// that look for the refused identity in the answer (SC3 refused, SC5 filter, the two SC7
// cases), and one that presses `unknown` into an empty list, which fails exactly the two
// whole-unknown cases (SC2 lawful set, SC3 read check). The shape of the suite is checked in
// `skill-contract/tests/catalog-suite.spec.ts`, not here. The order tests hold the read check
// answers and release them first to last and last to first: the answer is the same.
import { AssertionError } from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import { succeed } from '@omne-harness/operation-result'
import { createSkillCatalog } from '@omne-harness/skill'
import { isSafeReason, isSkillName, type SkillCatalog } from '@omne-harness/skill-contract'
import type { CatalogResolution } from '@omne-harness/skill-contract/provider'
import {
  runConformanceCase,
  skillCatalogConformance,
  type CatalogFixture,
} from '@omne-harness/skill-contract/testing'
import { alice, granted, reviewLocator, scope, type Principal, type Scope } from './access-world.ts'
import {
  catalogFixture,
  createCatalogWorld,
  retiredEntry,
  review,
  reviewEntry,
  type CatalogWorld,
} from './catalog-world.ts'

const cases = skillCatalogConformance<Principal, Scope>()

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
  it('fails exactly the four cases that look for the refused identity in the answer, on a catalog that lists it', async () => {
    expect(await failing(() => catalogFixture(listingRefused))).toStrictEqual([
      'lists a granted identity and not a refused one',
      'filters to the identities of the request that are lawful and granted',
      'answers the same whether a refused identity is in the lawful set or does not exist',
      'answers a filter naming a refused identity like one naming a missing identity',
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

describe('the order and the shape of the entries', () => {
  function identity(category: string, name: string): CapabilityId {
    const id = capabilityId(category, name)
    if (!id.ok) throw new Error(`${category}:${name}`)
    return id.id
  }

  function adopted(category: string, name: string): CatalogResolution {
    const capability = identity(category, name)
    return {
      kind: 'adopted',
      ref: { capability, layer: 'tenant', locator: reviewLocator },
      declared: { name: granted(isSkillName, name), tools: [], scripts: [], settings: [] },
    }
  }

  const standIn: CatalogResolution = {
    kind: 'known-unavailable',
    capability: identity('skill', 'b'),
    name: granted(isSkillName, 'b'),
    reason: granted(isSafeReason, 'Gone.'),
  }

  /** A catalog over a lawful set of `answers` that the read check grants in full. */
  function catalogOf(answers: readonly CatalogResolution[]): SkillCatalog<Principal, Scope> {
    return createSkillCatalog<Principal, Scope>({
      readCheck: { check: async () => ({ kind: 'granted' }) },
      resolution: {
        resolve: async () => ({ kind: 'none' }),
        adopted: async () => succeed(answers),
      },
    })
  }

  const answers = [adopted('skill', 'c'), standIn, adopted('skill', 'a'), adopted('a-skill', 'z')]

  const expected = [
    { kind: 'adopted', capability: identity('a-skill', 'z'), name: 'z', dependencies: [] },
    { kind: 'adopted', capability: identity('skill', 'a'), name: 'a', dependencies: [] },
    { kind: 'stand-in', capability: identity('skill', 'b'), name: 'b', reason: 'Gone.' },
    { kind: 'adopted', capability: identity('skill', 'c'), name: 'c', dependencies: [] },
  ]

  it('orders by category, then by name, and leaves out an absent description', async () => {
    expect(await catalogOf(answers).summaries(alice, scope)).toStrictEqual({ ok: expected })
  })

  it('gives the same order for the lawful set in the reverse order', async () => {
    expect(await catalogOf([...answers].reverse()).summaries(alice, scope)).toStrictEqual({
      ok: expected,
    })
  })
})

describe('an identity listed twice in the lawful set', () => {
  it('keeps the first answer of the port and leaves the later one out', async () => {
    const world = createCatalogWorld()
    const catalog = createSkillCatalog<Principal, Scope>({
      ...world.ports,
      resolution: {
        ...world.ports.resolution,
        async adopted(who, at) {
          const listed = await world.ports.resolution.adopted(who, at)
          if (!('ok' in listed)) return listed
          const review = listed.ok.find(answer => answer.kind === 'adopted')
          if (review?.kind !== 'adopted') throw new Error('the world adopts no Skill')
          const later = { ...review, declared: { ...review.declared, description: 'Later.' } }
          return succeed([...listed.ok, later])
        },
      },
    })
    expect(await catalog.summaries(alice, scope, [reviewEntry.capability])).toStrictEqual({
      ok: [reviewEntry],
    })
  })
})

describe('an empty request', () => {
  it('calls neither the lawful set nor the read check', async () => {
    const world = createCatalogWorld()
    const calls = { adopted: 0, check: 0 }
    const counted = createSkillCatalog<Principal, Scope>({
      readCheck: {
        check(...args) {
          calls.check += 1
          return world.ports.readCheck.check(...args)
        },
      },
      resolution: {
        ...world.ports.resolution,
        adopted(...args) {
          calls.adopted += 1
          return world.ports.resolution.adopted(...args)
        },
      },
    })
    expect(await counted.summaries(alice, scope, [])).toStrictEqual({ ok: [] })
    expect(calls).toStrictEqual({ adopted: 0, check: 0 })
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
