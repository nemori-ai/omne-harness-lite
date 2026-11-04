// The public driver parked on an unavailable I1 dependency (R2-D202). The dependency has no change
// notification, so the only wake is the check time: mechanisms "等待、唤醒与公平" (查询暂不可用的原项
// 在进程内计算下一检查时刻，按同一间隔重查), public-api "工厂配置" (reconciliationDelayMs), SC-AG-182 and
// SC-AG-193 (检查时刻之间没有空转). With the clock frozen the driver makes one pass and one call of
// `waitForWake`; each check time adds exactly one pass. The drive passes are counted through the
// measurement events: every `run` pass of the driver is followed by one `waitForWake`.
import { describe, expect, it } from 'vitest'
import type { AgentMeasureEvent } from '@omne-harness/agent'
import { fail } from '@omne-harness/operation-result'
import { execution, ok } from './journal-support.ts'
import { alice, eventsOf, eventually, invoke, loopAssembly } from './loop-support.ts'

const INTERVAL_MS = 1000
/**
 * Reads after which the dependency never answers. Over a dozen passes the test has already failed;
 * without this a driver that spins on microtasks alone would starve every timer and hang the test.
 */
const READ_BUDGET = 64
const START = Date.parse('1970-01-01T00:00:00.000Z')
const at = (checks: number) => new Date(START + checks * INTERVAL_MS).toISOString()

/** Turns of the event loop in which a driver that does not sleep would make more passes. */
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
    { reconciliationDelayMs: INTERVAL_MS },
    { measure: event => events.push(event) },
  )
  assembly.release.open()
  const handle = ok(await invoke(assembly))
  const passes = () => events.filter(event => event.pass === 'run' && event.phase === 'start')
  /** Settles once the driver sleeps on the check time, or once a spinning one used the budget. */
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
    // The wait is saved once and stays observable as a dependency wait at I1 (SC-AG-182).
    const saved = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(saved.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'runtimeContext', position: 'I1' }],
    })
    expect(assembly.controls.clock.pending()).toEqual([at(1)])

    // No time passes: the bound is one pass, so the driver must stay parked.
    await idleTurns(200)
    expect(passes()).toHaveLength(1)
    expect(dependency.reads).toBe(first)

    // Each check time is one reread of the dependency and one pass, then the next check time.
    for (let check = 1; check <= 3; check += 1) {
      ok(assembly.controls.clock.advanceTo(at(check)))
      await eventually(async () => passes().length > check)
      expect(await settled()).toBe(1 + check)
      await idleTurns(50)
      expect(passes()).toHaveLength(1 + check)
      expect(assembly.controls.clock.pending()).toEqual([at(check + 1)])
    }
    // A pass that finds the same wait does not save it again.
    const unchanged = ok(
      await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
    )
    expect(unchanged.revision).toBe(saved.revision)

    // The dependency recovers: the next check time takes the run on to the end.
    dependency.available = true
    ok(assembly.controls.clock.advanceTo(at(4)))
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'waiting')).toHaveLength(1)
    expect(events.at(-1)?.body.kind).toBe('ended')
  })
})
