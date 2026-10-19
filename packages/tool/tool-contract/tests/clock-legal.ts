// The providers of the clock suite that the contract allows. Each is built at the port boundary:
// it wraps the methods of the clock of the double and the time handles of the fixture, and it
// never calls a control of a double to make the double behave.
import { fail } from '@omne-harness/operation-result'
import { memoryToolClockFixture, type ToolClockFixture } from '@omne-harness/tool-contract/testing'

type Fixture = ToolClockFixture

/**
 * The generated boundary provider. The table of the clock has no progress kind and no lost reply
 * (P07: `begin` and `elapsed` answer or fail at once, `waitUntil` answers once within the wait of
 * the fixture), so it has nothing to mask: it passes every call through the port of the double.
 */
export function generated(): Fixture {
  const base = memoryToolClockFixture()
  return {
    ...base,
    clock: {
      now: () => base.clock.now(),
      begin: input => base.clock.begin(input),
      elapsed: marker => base.clock.elapsed(marker),
      waitUntil: (at, signal) => base.clock.waitUntil(at, signal),
    },
  }
}

/** P07 lets a clock report the fault instead of a smaller elapsed time when the wall turned back. */
export function refusesAfterSetBack(): Fixture {
  let wentBack = false
  const base = memoryToolClockFixture()
  return {
    ...base,
    setBack: async milliseconds => {
      wentBack = true
      await base.setBack?.(milliseconds)
    },
    clock: {
      ...base.clock,
      elapsed: async marker =>
        wentBack
          ? fail({ kind: 'unavailable' as const, dependency: 'clock', diagnostic: 'went back' })
          : base.clock.elapsed(marker),
    },
  }
}

/** The answer of a wait that the clock owes may come on a later tick: waitUntil is asynchronous. */
export function waitAnswersOnTheNextTick(): Fixture {
  const base = memoryToolClockFixture()
  return {
    ...base,
    clock: {
      ...base.clock,
      waitUntil: async (at, signal) => {
        const answer = await base.clock.waitUntil(at, signal)
        await new Promise<void>(resolve => setImmediate(resolve))
        return answer
      },
    },
  }
}

/** The waits that the suite takes are the policy of the fixture, here short ones. */
export function shortWaits(): Fixture {
  return { ...memoryToolClockFixture(), waitMs: 200, quietMs: 5 }
}
