import { fail } from '@omne-harness/operation-result'
import { memoryToolClockFixture, type ToolClockFixture } from '@omne-harness/tool-contract/testing'

type Fixture = ToolClockFixture

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

export function shortWaits(): Fixture {
  return { ...memoryToolClockFixture(), waitMs: 200, quietMs: 5 }
}
