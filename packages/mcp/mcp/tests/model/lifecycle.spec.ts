// P1–P8 of SPEC「性质与证据」, checked by the bounded exhaustive explorer on the real connection
// table at the bounds of `scenarios.ts`: no scenario reaches a violation. A violation fails its
// case with the shortest schedule that showed it. A1, the known limitation, is witnessed: once
// every bound fired, `closeAll` still waits behind a teardown port that hangs.
// The wide and two-key bounds are CPU-heavy (tens of thousands of states, each a replay).
import { beforeAll, describe, expect, it } from 'vitest'
import { explore, type Exploration } from './explore.ts'
import { FAULTS, REBUILD, THROWS, TWO_ACCOUNTS, TWO_KEYS, WIDE } from './scenarios.ts'

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

const EXPLORE_MS = 600_000

describe('rebuild: one key, two ensure, closeAll, lawful ports that may hang or answer late', () => {
  let result: Exploration
  beforeAll(async () => {
    result = await explore(REBUILD)
  }, EXPLORE_MS)

  it('P1–P8 hold', () => {
    expect(violations(result)).toEqual([])
  })

  it('A1: closeAll still waits once every bound fired, behind a port that hangs (known limitation)', () => {
    expect(result.closeWaits).toBeDefined()
  })
})

describe('faults: one key, ensure, release, lose, closeAll, one port failing, rejecting or unconfirmed', () => {
  let result: Exploration
  beforeAll(async () => {
    result = await explore(FAULTS)
  }, EXPLORE_MS)

  it('P1–P8 hold', () => {
    expect(violations(result)).toEqual([])
  })
})

describe('throws: one key, ensure, closeAll, one port throwing when it is called', () => {
  let result: Exploration
  beforeAll(async () => {
    result = await explore(THROWS)
  }, EXPLORE_MS)

  it('P1–P8 hold', () => {
    expect(violations(result)).toEqual([])
  })
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

describe(
  'wide: one key, two ensure, release, lose, closeAll, lawful ports',
  { tags: ['slow'] },
  () => {
    let result: Exploration
    beforeAll(async () => {
      result = await explore(WIDE)
    }, EXPLORE_MS)

    it('P1–P8 hold', { tags: ['slow'] }, () => {
      expect(violations(result)).toEqual([])
    })
  },
)

describe(
  'two keys: two tenants on one holding and revision, one ensure each',
  { tags: ['slow'] },
  () => {
    let result: Exploration
    beforeAll(async () => {
      result = await explore(TWO_KEYS)
    }, EXPLORE_MS)

    it('P1–P8 hold, P5 above all', { tags: ['slow'] }, () => {
      expect(violations(result)).toEqual([])
    })
  },
)

describe(
  'two accounts: one tenant, one holding and revision, two peer accounts, one ensure each',
  { tags: ['slow'] },
  () => {
    let result: Exploration
    beforeAll(async () => {
      result = await explore(TWO_ACCOUNTS)
    }, EXPLORE_MS)

    it('P1–P8 hold, P5 above all', { tags: ['slow'] }, () => {
      expect(violations(result)).toEqual([])
    })
  },
)
