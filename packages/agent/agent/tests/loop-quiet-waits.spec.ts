// The check delays of the public driver (package SPEC "等着的时候"): a run parked on an unavailable
// I1 dependency checks at the delays of `reconciliationDelaysMs` in order and then at the last one;
// once the execution moves, the next check is the first delay again, and an event still wakes the
// run before any check time.
import { describe, expect, it } from 'vitest'
import { agentEvaluator, type AgentMeasureEvent } from '@omne-harness/agent'
import { fail } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { reconciliationPacer } from '../src/loop/reconciliation.ts'
import { options } from './factory-support.ts'
import { acceptedInput, execution, ok, operation } from './journal-support.ts'
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

describe('a waiting run woken by an event', () => {
  it('checks again after the first delay when the woken pass does not finish', async () => {
    // While `busy`, the Journal answers unavailable to the reads of reply admissions and to
    // commits: a woken pass can neither go on nor save its wait.
    const journal = { busy: false }
    const unavailable = () =>
      Promise.resolve(
        fail({ kind: 'unavailable' as const, owner: 'agentJournal', diagnostic: 'busy' }),
      )
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        readReplyAdmissions: input =>
          journal.busy ? unavailable() : d.journal.readReplyAdmissions(input),
        commit: input => (journal.busy ? unavailable() : d.journal.commit(input)),
      },
    }))
    const real = reconciliationPacer(DELAYS_MS)
    const timerWakes: string[] = []
    const pacer = {
      delayAt: real.delayAt,
      timerWoke: () => {
        timerWakes.push(clock.now())
        real.timerWoke()
      },
    }
    const clock = assembly.controls.clock
    const c = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1'),
      grant: null,
      idle() {},
    })
    ok(await c.accept())
    ok(await c.runExecution())
    const wait = () => c.waitForWake({ pacer, signal: new AbortController().signal })
    const checkTime = async () => {
      await eventually(async () => clock.pending().length === 1)
      return clock.pending()[0]
    }

    // The run waits for the Model, whose reply is held: each check time finds nothing new.
    for (const due of [1000, 3000, 8000]) {
      const woken = wait()
      expect(await checkTime()).toBe(at(due))
      ok(clock.advanceTo(at(due)))
      expect(ok(await woken)).toBe('ready')
      ok(await c.runExecution())
    }
    const parked = wait()
    expect(await checkTime()).toBe(at(13_000))

    // The reply is an event: it wakes the run before the check time. That pass does not finish.
    journal.busy = true
    assembly.release.open()
    expect(ok(await parked)).toBe('ready')
    await c.runExecution()
    const again = wait()
    expect(await checkTime(), 'the first delay after the event, not the last').toBe(at(9000))
    expect(timerWakes).toEqual([at(1000), at(3000), at(8000)])

    journal.busy = false
    ok(clock.advanceTo(at(9000)))
    expect(ok(await again)).toBe('ready')
  })
})
