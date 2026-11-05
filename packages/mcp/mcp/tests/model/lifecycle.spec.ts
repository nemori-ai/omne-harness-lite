// P1–P8 of SPEC「性质与证据」, checked by the bounded exhaustive explorer on the real connection
// table at the bounds of `scenarios.ts`: no scenario reaches a violation. A violation fails its
// case with the shortest schedule that showed it. A1, the known limitation, is witnessed: once
// every bound fired, `closeAll` still waits behind a teardown port that hangs.
// The bounds, wide and two-key scenarios are CPU-heavy (tens of thousands of states, each a replay).
// Each exploration runs inside a case, not in a hook: per-case coverage then sees it, and mutation
// testing runs only the cases that reach a mutant instead of every case for each one.
import { describe, expect, it } from 'vitest'
import { explore, type Exploration, type Scenario } from './explore.ts'
import { BOUNDS, FAULTS, REBUILD, THROWS, TWO_ACCOUNTS, TWO_KEYS, WIDE } from './scenarios.ts'

function violations(result: Exploration): readonly string[] {
  return result.violations.map(
    item => `${item.property} ${item.signature}: ${item.detail}\n  ${item.trace.join('\n  ')}`,
  )
}

/**
 * What a run found, without the trace: each property and signature with the length of its
 * shortest schedule.
 */
function kinds(result: Exploration): readonly string[] {
  const shortest = new Map<string, number>()
  for (const { property, signature, depth } of result.violations) {
    const kind = `${property} ${signature}`
    shortest.set(kind, Math.min(depth, shortest.get(kind) ?? depth))
  }
  return [...shortest].map(([kind, depth]) => `${kind} at ${depth}`).sort()
}

/** Explores once, in the first case that asks; later cases of the scenario reuse the result. */
function exploration(scenario: Scenario): () => Promise<Exploration> {
  let run: Promise<Exploration> | undefined
  return () => (run ??= explore(scenario))
}

const EXPLORE_MS = 600_000

describe('rebuild: one key, two ensure, closeAll, lawful ports that may hang or answer late', () => {
  const rebuild = exploration(REBUILD)

  it(
    'P1–P8 hold',
    async () => {
      expect(violations(await rebuild())).toEqual([])
    },
    EXPLORE_MS,
  )

  it(
    'A1: closeAll still waits once every bound fired, behind a port that hangs (known limitation)',
    async () => {
      expect((await rebuild()).closeWaits).toBeDefined()
    },
    EXPLORE_MS,
  )
})

describe('faults: one key, ensure, release, lose, closeAll, one port failing, rejecting or unconfirmed', () => {
  it(
    'P1–P8 hold',
    async () => {
      expect(violations(await explore(FAULTS))).toEqual([])
    },
    EXPLORE_MS,
  )
})

describe('throws: one key, ensure, closeAll, one port throwing when it is called', () => {
  it(
    'P1–P8 hold',
    async () => {
      expect(violations(await explore(THROWS))).toEqual([])
    },
    EXPLORE_MS,
  )
})

describe('the projection: merging states of equal projection loses no violation', () => {
  it(
    'finds on throws what every schedule of throws shows',
    async () => {
      const merged = await explore(THROWS)
      const every = await explore({ ...THROWS, exhaustivePaths: true })
      expect(every.states).toBeGreaterThan(merged.states)
      expect(kinds(merged)).toEqual(kinds(every))
    },
    EXPLORE_MS,
  )
})

describe('bounds: as rebuild, with bounds of different lengths that fire in any order', () => {
  it('P1–P8 hold, P8 T2 above all', { tags: ['slow'], timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(BOUNDS))).toEqual([])
  })
})

describe('wide: one key, two ensure, release, lose, closeAll, lawful ports', () => {
  it('P1–P8 hold', { tags: ['slow'], timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(WIDE))).toEqual([])
  })
})

describe('two keys: two tenants on one holding and revision, one ensure each', () => {
  it('P1–P8 hold, P5 above all', { tags: ['slow'], timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(TWO_KEYS))).toEqual([])
  })
})

describe('two accounts: one tenant, one holding and revision, two peer accounts, one ensure each', () => {
  it('P1–P8 hold, P5 above all', { tags: ['slow'], timeout: EXPLORE_MS }, async () => {
    expect(violations(await explore(TWO_ACCOUNTS))).toEqual([])
  })
})
