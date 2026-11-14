// The check delays of the public driver (package SPEC "等着的时候"): a run parked on an unavailable
// I1 dependency checks at the delays of `reconciliationDelaysMs` in order and then at the last one;
// once the execution moves, the next check is the first delay again, and an event still wakes the
// run before any check time.
import { describe, expect, it } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import { fail } from '@omne-harness/operation-result'
import { execution, ok } from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'

const DELAYS_MS = [1000, 2000, 5000]
const READ_BUDGET = 64
const at = (ms: number) => new Date(ms).toISOString()

async function idleTurns(count: number): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await new Promise(resolve => setImmediate(resolve))
}

describe('a waiting run whose execution does not change', () => {
  it('checks at the delays in order, repeats the last one, and starts over after a change', async () => {
    const events: AgentMeasureEvent[] = []
    const dependency = { available: false, reads: 0 }
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        modelContext: {
          read: input => {
            dependency.reads += 1
            if (dependency.reads > READ_BUDGET) return new Promise(() => {})
            return dependency.available
              ? d.modelContext.read(input)
              : Promise.resolve(
                  fail({ kind: 'unavailable' as const, owner: 'runtimeContext', diagnostic: 'no' }),
                )
          },
        },
      }),
      undefined,
      { reconciliationDelaysMs: DELAYS_MS },
      { measure: event => events.push(event) },
    )
    const handle = ok(await invoke(assembly))
    const passes = () => events.filter(event => event.pass === 'run' && event.phase === 'start')
    const clock = assembly.controls.clock
    await eventually(async () => clock.pending().length === 1)
    const parked = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )

    const checks: string[] = [...clock.pending()]
    for (const due of [1000, 3000, 8000]) {
      const before = passes().length
      ok(clock.advanceTo(at(due)))
      await eventually(async () => passes().length > before && clock.pending().length === 1)
      await idleTurns(50)
      expect(passes()).toHaveLength(before + 1)
      checks.push(...clock.pending())
    }
    expect(checks).toEqual([at(1000), at(3000), at(8000), at(13_000)])
    const quiet = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(quiet.revision).toBe(parked.revision)

    // The dependency answers: the run moves on to the Model call, whose reply is held, and waits.
    dependency.available = true
    ok(clock.advanceTo(at(13_000)))
    await eventually(async () => clock.pending().length === 1 && clock.pending()[0] !== at(13_000))
    const moved = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(moved.revision).not.toBe(parked.revision)
    expect(clock.pending()).toEqual([at(14_000)])

    // The reply is an event: it wakes the run before the check time, so the clock stays put.
    assembly.release.open()
    const ended = await eventsOf(handle)
    expect(ended.at(-1)?.body.kind).toBe('ended')
    expect(clock.now()).toBe(at(13_000))
  })
})
