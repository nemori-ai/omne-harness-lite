// Self-proof of the ToolClock suite: it passes on the conforming clock, each case fails under
// a violating variant that breaks the rule of that case, and a fixture without control handles
// reports the cases that need them as not applicable.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  clockAnswers,
  memoryToolClockFixture,
  toolClockConformance,
  type ToolClockFixture,
} from '@omne-harness/tool-contract/testing'
import type { ToolClock } from '@omne-harness/tool-contract'
import {
  expectEveryCaseIsCaught,
  expectWellFormed,
  itFailsExactly,
  itPassesLegal,
  judge,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import {
  generated,
  refusesAfterSetBack,
  shortWaits,
  waitAnswersOnTheNextTick,
} from './clock-legal.ts'

const NAMES = {
  K1: 'begin answers a marker that names its operation',
  K2: 'a segment that is only begun leaves the other segments alone',
  K3: 'elapsed measures the time since the marker',
  K4: 'time going backwards never adds budget',
  K5: 'a marker of an epoch that cannot be compared is not measured',
  K6: 'waitUntil answers cancelled when the signal aborts',
  K7: 'waitUntil on a signal already aborted answers cancelled',
  K8: 'waitUntil answers elapsed once the instant is reached',
  K9: 'waitUntil does not answer elapsed before the instant',
} as const

type Fixture = ToolClockFixture

/** A fixture whose clock is the conforming clock with `build(real, base)` laid over it. */
function variant(
  build: (real: ToolClock, base: Fixture) => Partial<ToolClock>,
  over: Partial<Fixture> = {},
): () => Fixture {
  return () => {
    const base = memoryToolClockFixture()
    return { ...base, ...over, clock: { ...base.clock, ...build(base.clock, base) } }
  }
}

/** The wait is short, so a violation that never answers fails soon. */
const SHORT = { waitMs: 30 }

const unreadable = () =>
  fail({ kind: 'unavailable' as const, dependency: 'clock', diagnostic: 'x' })

const variants: readonly Variant<Fixture>[] = [
  {
    name: 'the marker names another operation',
    fails: [NAMES.K1],
    fixture: variant(real => ({
      begin: async input => {
        const answer = await real.begin(input)
        return 'failure' in answer
          ? answer
          : succeed({
              ...answer.ok,
              operation: `${answer.ok.operation}-other` as typeof answer.ok.operation,
            })
      },
    })),
  },
  ...(['owner', 'record', 'digest'] as const).map(field => ({
    // The marker is evidence that cannot be checked: one part of it is empty.
    name: `the marker has no ${field} of its evidence`,
    // The conforming clock reads its own markers: without an owner or a record it measures nothing.
    fails: field === 'digest' ? [NAMES.K1] : [NAMES.K1, NAMES.K2, NAMES.K3, NAMES.K4, NAMES.K5],
    fixture: variant(real => ({
      begin: async input => {
        const answer = await real.begin(input)
        return 'failure' in answer
          ? answer
          : succeed({ ...answer.ok, marker: { ...answer.ok.marker, [field]: '' } })
      },
    })),
  })),
  {
    name: 'the marker names no source',
    fails: [NAMES.K1],
    fixture: variant(real => ({
      begin: async input => {
        const answer = await real.begin(input)
        return 'failure' in answer ? answer : succeed({ ...answer.ok, source: '' })
      },
    })),
  },
  {
    // The clock keeps one current segment: a later begin takes over the measurement of all.
    name: 'a begin restarts the measurement of every segment',
    fails: [NAMES.K2],
    fixture: variant(real => {
      let latest: Awaited<ReturnType<ToolClock['begin']>> | null = null
      return {
        begin: async input => {
          latest = await real.begin(input)
          return latest
        },
        elapsed: evidence =>
          real.elapsed(latest !== null && 'ok' in latest ? latest.ok.marker : evidence),
      }
    }),
  },
  {
    name: 'elapsed counts a millisecond too little',
    fails: [NAMES.K2, NAMES.K3],
    fixture: variant(real => ({
      elapsed: async evidence => {
        const answer = await real.elapsed(evidence)
        if ('failure' in answer) return answer
        const milliseconds = Math.max(0, Number(answer.ok.milliseconds) - 1)
        return succeed({ ...answer.ok, milliseconds: String(milliseconds) })
      },
    })),
  },
  {
    name: 'elapsed names no evidence of its sample',
    fails: [NAMES.K3],
    fixture: variant(real => ({
      elapsed: async evidence => {
        const answer = await real.elapsed(evidence)
        return 'failure' in answer
          ? answer
          : succeed({ ...answer.ok, evidence: { ...answer.ok.evidence, owner: '' } })
      },
    })),
  },
  {
    // The clock measures with the wall reading, which the operator can turn back.
    name: 'elapsed follows the wall time',
    fails: [NAMES.K4],
    fixture: variant(real => {
      const wallAtBegin = new Map<string, number>()
      return {
        begin: async input => {
          const answer = await real.begin(input)
          if ('ok' in answer) wallAtBegin.set(answer.ok.marker.digest, Date.parse(real.now()))
          return answer
        },
        elapsed: async evidence => {
          const answer = await real.elapsed(evidence)
          if ('failure' in answer) return answer
          const start = wallAtBegin.get(evidence.digest)
          if (start === undefined) return answer
          return succeed({
            ...answer.ok,
            milliseconds: String(Math.max(0, Date.parse(real.now()) - start)),
          })
        },
      }
    }),
  },
  {
    // Across an epoch the clock reports no time at all, which gives the call a fresh budget.
    name: 'elapsed answers zero across an epoch that cannot be compared',
    fails: [NAMES.K5],
    fixture: variant(real => ({
      elapsed: async evidence => {
        const answer = await real.elapsed(evidence)
        return 'ok' in answer
          ? answer
          : succeed({ milliseconds: '0', evidence: { ...evidence, record: 'clock/unknown' } })
      },
    })),
  },
  {
    name: 'elapsed fails for every marker',
    fails: [NAMES.K2, NAMES.K3, NAMES.K4, NAMES.K5],
    fixture: variant(() => ({ elapsed: () => Promise.resolve(unreadable()) })),
  },
  {
    name: 'waitUntil ignores the signal',
    fails: [NAMES.K6, NAMES.K7],
    fixture: variant(
      real => ({ waitUntil: instant => real.waitUntil(instant, new AbortController().signal) }),
      SHORT,
    ),
  },
  {
    name: 'waitUntil answers elapsed at once',
    fails: [NAMES.K6, NAMES.K7, NAMES.K9],
    fixture: variant(() => ({ waitUntil: () => Promise.resolve('elapsed' as const) }), SHORT),
  },
  {
    name: 'waitUntil never answers elapsed',
    fails: [NAMES.K8],
    fixture: variant(
      () => ({
        waitUntil: (_instant, signal) =>
          new Promise(resolve => {
            if (signal.aborted) resolve('cancelled')
            else signal.addEventListener('abort', () => resolve('cancelled'), { once: true })
          }),
      }),
      SHORT,
    ),
  },
  {
    // The wait ends at the abort, but it says that the instant was reached.
    name: 'waitUntil answers elapsed when the signal aborts',
    fails: [NAMES.K6, NAMES.K8],
    fixture: variant(
      () => ({
        waitUntil: (_instant, signal) =>
          new Promise(resolve => {
            if (signal.aborted) resolve('cancelled')
            else signal.addEventListener('abort', () => resolve('elapsed'), { once: true })
          }),
      }),
      SHORT,
    ),
  },
  {
    // Milliseconds come as a decimal with a fraction: the number is the same, the text is not.
    name: 'elapsed counts in a decimal with a fraction',
    fails: [NAMES.K2, NAMES.K3, NAMES.K4, NAMES.K5],
    fixture: variant(real => ({
      elapsed: async evidence => {
        const answer = await real.elapsed(evidence)
        return 'failure' in answer
          ? answer
          : succeed({ ...answer.ok, milliseconds: `${answer.ok.milliseconds}.0` })
      },
    })),
  },
  {
    name: 'the marker names no epoch',
    fails: [NAMES.K1],
    fixture: variant(real => ({
      begin: async input => {
        const answer = await real.begin(input)
        return 'failure' in answer ? answer : succeed({ ...answer.ok, epoch: '' })
      },
    })),
  },
  {
    // A begin of another segment disturbs the first read of the segment that was already running.
    name: 'a begin of another segment disturbs the next read of a running segment',
    fails: [NAMES.K2, NAMES.K5],
    fixture: variant(real => {
      let begun = 0
      let disturbed = false
      return {
        begin: async input => {
          begun += 1
          disturbed = begun > 1
          return real.begin(input)
        },
        elapsed: async evidence => {
          const answer = await real.elapsed(evidence)
          if (!disturbed || 'failure' in answer) return answer
          disturbed = false
          return succeed({
            ...answer.ok,
            milliseconds: String(Number(answer.ok.milliseconds) + 7),
          })
        },
      }
    }),
  },
  {
    // With a second segment running, the first one stops counting.
    name: 'a segment stops counting once another segment begins',
    fails: [NAMES.K2],
    fixture: variant(real => {
      const frozen = new Map<string, number>()
      const markers: string[] = []
      return {
        begin: async input => {
          const answer = await real.begin(input)
          if ('ok' in answer) markers.push(answer.ok.marker.digest)
          return answer
        },
        elapsed: async evidence => {
          const answer = await real.elapsed(evidence)
          if ('failure' in answer || markers.length < 2 || markers[0] !== evidence.digest)
            return answer
          const kept = frozen.get(evidence.digest) ?? Number(answer.ok.milliseconds)
          frozen.set(evidence.digest, kept)
          return succeed({ ...answer.ok, milliseconds: String(kept) })
        },
      }
    }),
  },
  {
    // The first read of a marker counts a head start; later reads are right.
    name: 'the first read of a marker counts a head start',
    fails: [NAMES.K2, NAMES.K3, NAMES.K4, NAMES.K5],
    fixture: variant(real => {
      const read = new Set<string>()
      return {
        elapsed: async evidence => {
          const answer = await real.elapsed(evidence)
          if ('failure' in answer || read.has(evidence.digest)) return answer
          read.add(evidence.digest)
          return succeed({
            ...answer.ok,
            milliseconds: String(Number(answer.ok.milliseconds) + 5),
          })
        },
      }
    }),
  },
  ...([2, 3] as const).map(nth => ({
    // One read of the marker, the second or the third, is a millisecond off.
    name: `the ${nth === 2 ? 'second' : 'third'} read of a marker is a millisecond off`,
    fails: nth === 2 ? [NAMES.K2, NAMES.K3] : [NAMES.K2, NAMES.K3],
    fixture: variant(real => {
      const reads = new Map<string, number>()
      return {
        elapsed: async (evidence: Parameters<ToolClock['elapsed']>[0]) => {
          const answer = await real.elapsed(evidence)
          const turn = (reads.get(evidence.digest) ?? 0) + 1
          reads.set(evidence.digest, turn)
          return 'failure' in answer || turn !== nth
            ? answer
            : succeed({ ...answer.ok, milliseconds: String(Number(answer.ok.milliseconds) + 1) })
        },
      }
    }),
  })),
  {
    // A wait on a far instant answers cancelled without any abort.
    name: 'waitUntil answers cancelled before the abort',
    fails: [NAMES.K6, NAMES.K8, NAMES.K9],
    fixture: variant(() => ({ waitUntil: () => Promise.resolve('cancelled' as const) }), SHORT),
  },
]

/** Providers that the contract allows, built in clock-legal.ts at the port boundary. */
const legal: readonly LegalProvider<Fixture>[] = [
  {
    name: 'generated: the table has no progress kind, so the boundary masks nothing',
    fixture: generated,
  },
  {
    name: 'a clock that refuses elapsed once the wall time went back',
    fixture: refusesAfterSetBack,
  },
  {
    name: 'a clock whose waitUntil answers on the tick after the instant',
    fixture: waitAnswersOnTheNextTick,
  },
  {
    name: 'a fixture with short waits: quietMs and waitMs are the fixture policy',
    fixture: shortWaits,
  },
]

describe('ToolClock conformance suite', () => {
  const cases = toolClockConformance()

  it('lists the cases in the order of the violation map, each naming a clause', () => {
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
    expectWellFormed(cases)
  })

  it('passes on the conforming clock with no case not applicable', async () => {
    const verdict = await judge(cases, memoryToolClockFixture)
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
    expect(verdict.passed).toEqual(Object.values(NAMES))
  })

  it('names the missing handle of every case that needs one, and passes the others', async () => {
    const bare = (): Fixture => {
      const { clock, access } = memoryToolClockFixture()
      return { clock, access }
    }
    const verdict = await judge(cases, bare)
    expect(verdict.failed).toEqual([])
    expect(verdict.passed).toEqual([NAMES.K1])
    expect(verdict.notApplicable).toEqual({
      [NAMES.K2]: 'advance',
      [NAMES.K3]: 'advance',
      [NAMES.K4]: 'advance',
      [NAMES.K5]: 'advance',
      [NAMES.K6]: 'instantAfter',
      [NAMES.K7]: 'instantAfter',
      [NAMES.K8]: 'instantAfter',
      [NAMES.K9]: 'instantAfter',
    })
  })

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })

  itFailsExactly(cases, variants)

  itPassesLegal(cases, legal)

  it('has a table without progress, so no case needs a completion handle', () => {
    for (const row of Object.values(clockAnswers)) expect(row.progress).toEqual([])
    expect(Object.keys(clockAnswers).sort()).toEqual(['begin', 'elapsed', 'now', 'waitUntil'])
  })
})
