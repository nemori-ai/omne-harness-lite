// P1–P8 of SPEC「性质与证据」, checked by the bounded exhaustive explorer on the real connection
// table at the bounds of `scenarios.ts`. A case that holds passes. A counterexample known at
// 1160e92c8 is an expected failure: the case asserts the property and fails on the explorer's
// shortest counterexample; once the fix of `w3-mcp-lifecycle` lands, it fails the other way and
// moves to the passing cases. A violation that is neither is a new counterexample: it fails
// "explains every violation" and its shortest schedule is in the failure message.
// The wide and two-key bounds are CPU-heavy (tens of thousands of states, each a replay).
import { beforeAll, describe, expect, it } from 'vitest'
import { explore, type Exploration, type Violation } from './explore.ts'
import { FAULTS, KNOWN, REBUILD, THROWS, TWO_KEYS, WIDE } from './scenarios.ts'

/** The P8 T2 counterexamples every scenario reaches: a build's teardown or mark that hangs. */
const STALLS: readonly string[] = ['P2', 'N1']

/** Known: a stalled `ensure` (P2, N1), or anything behind a port that threw at a known place. */
function known(violation: Violation): boolean {
  if (violation.cause === 'B1' || violation.cause === 'N2' || violation.cause === 'N3') return true
  return violation.property === 'P8' && STALLS.includes(violation.signature)
}

function unexplained(result: Exploration): readonly string[] {
  return result.violations
    .filter(violation => !known(violation))
    .map(item => `${item.property} ${item.signature}: ${item.detail}\n  ${item.trace.join('\n  ')}`)
}

function stalls(result: Exploration, signature: string): readonly Violation[] {
  return result.violations.filter(item => item.property === 'P8' && item.signature === signature)
}

function causedBy(result: Exploration, cause: string): readonly Violation[] {
  return result.violations.filter(item => item.cause === cause)
}

/** The violations of `properties` the run found. */
function violated(result: Exploration, ...properties: readonly string[]): readonly Violation[] {
  return result.violations.filter(item => properties.includes(item.property))
}

/**
 * What a run found, without the history-dependent cause and trace: each property and signature
 * with the length of its shortest schedule.
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

  it('explains every violation', () => {
    expect(unexplained(result)).toEqual([])
  })

  it('P1–P7 hold', () => {
    expect(violated(result, 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')).toEqual([])
  })

  it('A1: closeAll still waits once every bound fired, behind a port that hangs (known limitation)', () => {
    expect(result.closeWaits).toBeDefined()
  })

  it.fails(`P8 T2 holds — expected failure P2: ${KNOWN.P2}`, () => {
    expect(stalls(result, 'P2')).toEqual([])
  })

  it.fails(`P8 T2 holds — expected failure N1: ${KNOWN.N1}`, () => {
    expect(stalls(result, 'N1')).toEqual([])
  })
})

describe('faults: one key, ensure, release, lose, closeAll, one port failing, rejecting or unconfirmed', () => {
  let result: Exploration
  beforeAll(async () => {
    result = await explore(FAULTS)
  }, EXPLORE_MS)

  it('explains every violation', () => {
    expect(unexplained(result)).toEqual([])
  })

  it('P1–P7 hold', () => {
    expect(violated(result, 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')).toEqual([])
  })
})

describe('throws: one key, ensure, closeAll, one port throwing when it is called', () => {
  let result: Exploration
  beforeAll(async () => {
    result = await explore(THROWS)
  }, EXPLORE_MS)

  it('explains every violation', () => {
    expect(unexplained(result)).toEqual([])
  })

  it('P4–P6 hold', () => {
    expect(violated(result, 'P4', 'P5', 'P6')).toEqual([])
  })

  it.fails(`P7 holds — expected failure B1: ${KNOWN.B1}`, () => {
    expect(causedBy(result, 'B1')).toEqual([])
  })

  it.fails(`P7 holds — expected failure N2: ${KNOWN.N2}`, () => {
    expect(causedBy(result, 'N2')).toEqual([])
  })

  it.fails(`P1–P3 hold — expected failure N3: ${KNOWN.N3}`, () => {
    expect(causedBy(result, 'N3')).toEqual([])
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

    it('explains every violation', { tags: ['slow'] }, () => {
      expect(unexplained(result)).toEqual([])
    })

    it('P1–P7 hold', { tags: ['slow'] }, () => {
      expect(violated(result, 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')).toEqual([])
    })
  },
)

describe('two keys: two tenants on one holding, one ensure each', { tags: ['slow'] }, () => {
  let result: Exploration
  beforeAll(async () => {
    result = await explore(TWO_KEYS)
  }, EXPLORE_MS)

  it('explains every violation', { tags: ['slow'] }, () => {
    expect(unexplained(result)).toEqual([])
  })

  it('P1–P7 hold, P5 above all', { tags: ['slow'] }, () => {
    expect(violated(result, 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7')).toEqual([])
  })
})
