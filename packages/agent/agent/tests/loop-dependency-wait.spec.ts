import { describe, expect, it } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import { fail } from '@omne-harness/operation-result'
import { execution, ok } from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'

const INTERVAL_MS = 1000
// Reads after which the dependency never answers: a driver that spins on microtasks alone would
// starve every timer and hang the test.
const READ_BUDGET = 64
const START = Date.parse('1970-01-01T00:00:00.000Z')
const at = (checks: number) => new Date(START + checks * INTERVAL_MS).toISOString()

async function idleTurns(count: number): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await new Promise(resolve => setImmediate(resolve))
}

async function parkedOnContext() {
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
                fail({
                  kind: 'unavailable' as const,
                  owner: 'runtimeContext',
                  diagnostic: 'no reader eligibility yet',
                }),
              )
        },
      },
    }),
    undefined,
    { reconciliationDelaysMs: [INTERVAL_MS] },
    { measure: event => events.push(event) },
  )
  assembly.release.open()
  const handle = ok(await invoke(assembly))
  const passes = () => events.filter(event => event.pass === 'run' && event.phase === 'start')
  const settled = async () => {
    await eventually(
      async () => assembly.controls.clock.pending().length === 1 || dependency.reads > READ_BUDGET,
    )
    return passes().length
  }
  expect(await settled(), 'a driver that does not sleep until the check time spins').toBe(1)
  return { assembly, handle, dependency, passes, settled }
}

describe('a driver waiting on an unavailable I1 dependency', () => {
  it('makes one pass per check time and none in between', async () => {
    const { assembly, handle, dependency, passes, settled } = await parkedOnContext()
    const first = dependency.reads
    const saved = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(saved.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'runtimeContext', position: 'I1' }],
    })
    expect(assembly.controls.clock.pending()).toEqual([at(1)])

    await idleTurns(200)
    expect(passes()).toHaveLength(1)
    expect(dependency.reads).toBe(first)

    for (let check = 1; check <= 3; check += 1) {
      ok(assembly.controls.clock.advanceTo(at(check)))
      await eventually(async () => passes().length > check)
      expect(await settled()).toBe(1 + check)
      await idleTurns(50)
      expect(passes()).toHaveLength(1 + check)
      expect(assembly.controls.clock.pending()).toEqual([at(check + 1)])
    }
    const unchanged = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(unchanged.revision).toBe(saved.revision)

    dependency.available = true
    ok(assembly.controls.clock.advanceTo(at(4)))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'waiting')).toHaveLength(1)
    expect(events.at(-1)?.body.kind).toBe('ended')
  })
})
