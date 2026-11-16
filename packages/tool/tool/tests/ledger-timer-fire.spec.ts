import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure, ToolTiming } from '@omne-harness/tool-contract'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { createLedgerTimers, type TimerPorts } from '../src/ledger-timer-fire.ts'
import type { DueEntry } from '../src/ledger-store.ts'
import {
  instantOf,
  segmentCloser,
  timerOriginOf,
  timerSubject,
  TIMERS_OFF,
} from '../src/ledger-timers.ts'
import { admittedCallSnapshot, runningCallSnapshot } from './control-decider-values.ts'
import { mintOf, type CallSnapshot } from './resumption-decider-values.ts'
import { callId, evidence, operationId, principalA, tenantA, tenantB } from './runtime-values.ts'
import { auditQueues } from './start-values.ts'

afterEach(auditQueues)

const NOW = '2026-11-16T21:00:00.000Z' as ToolInstant
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString() as ToolInstant
const CALL = callId('c1')
const RUNNING: ToolTiming = {
  kind: 'running',
  accumulatedMs: '25',
  segment: { operation: operationId('s'), source: 'test', epoch: 'e', marker: evidence('m') },
}
const CLOSED: ToolTiming = { kind: 'paused', accumulatedMs: '75' }

// The due index keeps its own copy of the tenant; the fire must act for the caller's.
const entry = (key: string, dueAt: ToolInstant, call = CALL): DueEntry => ({
  domain: { kind: 'call', tenant: structuredClone(tenantB), call },
  key,
  dueAt,
})

type Settled = Parameters<TimerPorts<unknown>['settle']>

function world(
  options: Readonly<{
    now?: ToolInstant | null
    entries?: readonly DueEntry[] | 'unavailable'
    timing?: ToolTiming | null
    read?: Outcome<never, ToolFailure>
    settle?: Outcome<null, ToolFailure>
  }> = {},
) {
  const settled: Settled[] = []
  const closed: ToolTiming[] = []
  const asked: unknown[] = []
  const reads: unknown[] = []
  const ports: TimerPorts<unknown> = {
    now: () => (options.now === undefined ? NOW : options.now),
    due: async (tenant, now, limit) => {
      asked.push({ tenant, now, limit })
      return options.entries === 'unavailable'
        ? { kind: 'unavailable', diagnostic: 'index down' }
        : { kind: 'complete', entries: options.entries ?? [] }
    },
    read: async domain => {
      reads.push(domain)
      if (options.read !== undefined) return options.read
      const timing = options.timing === undefined ? RUNNING : options.timing
      return succeed({ call: timing === null ? null : { state: { timing } } } as never)
    },
    closeSegment: async timing => {
      closed.push(timing)
      return CLOSED
    },
    settle: async (...input) => {
      settled.push(input)
      return options.settle ?? succeed(null)
    },
  }
  const timers = createLedgerTimers(ports)
  return {
    settled,
    closed,
    asked,
    reads,
    fire: () => timers.fire({ principal: principalA, tenant: tenantA }),
  }
}

describe('firing the due timers of a tenant', () => {
  it('answers unavailable without reading the index when the clock gives no canonical instant', async () => {
    const w = world({ now: null })
    expect(await w.fire()).toEqual({
      failure: { kind: 'unavailable', dependency: 'clock', diagnostic: expect.any(String) },
    })
    expect(w.asked).toEqual([])
  })

  it('answers unavailable when the due index cannot be read', async () => {
    expect(await world({ entries: 'unavailable' }).fire()).toEqual({
      failure: { kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'index down' },
    })
  })

  it('reads the whole index of the caller tenant, skips entries that are not timers and fires the due ones in order', async () => {
    const w = world({
      entries: [
        entry('body:x', at(-10)),
        entry('timer:threshold', at(-5)),
        entry('timer:foreground-limit', NOW),
      ],
    })
    expect(await w.fire()).toEqual({ ok: { fired: 2, next: null } })
    expect(w.asked).toEqual([{ tenant: tenantA, now: '9999-12-31T23:59:59.999Z', limit: 100 }])
    expect(w.settled.map(([context]) => context.operation)).toEqual([
      `timer/threshold/${Date.parse(at(-5))}`,
      `timer/foreground-limit/${Date.parse(NOW)}`,
    ])
    for (const [context, action] of w.settled) {
      expect(context.tenant).toBe(tenantA)
      expect(context.principal).toBe(principalA)
      expect(context.call).toBe(CALL)
      expect(action).toBe('control')
    }
    expect(w.reads).toEqual([
      { kind: 'call', tenant: tenantA, call: CALL },
      { kind: 'call', tenant: tenantA, call: CALL },
    ])
  })

  it('stops at the first timer that is not due yet and names it as the next one', async () => {
    const later = entry('timer:foreground-limit', at(1))
    const w = world({ entries: [entry('timer:threshold', at(-1)), later] })
    expect(await w.fire()).toEqual({ ok: { fired: 1, next: later } })
    expect(w.settled).toHaveLength(1)
  })

  it('answers the failure of the call read or of the commit, and fires nothing after it', async () => {
    const down = fail({ kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'x' } as const)
    const two = [entry('timer:threshold', at(-2)), entry('timer:foreground-limit', at(-1))]
    const unread = world({ entries: two, read: down })
    expect(await unread.fire()).toEqual(down)
    expect(unread.settled).toEqual([])
    const uncommitted = world({ entries: two, settle: down })
    expect(await uncommitted.fire()).toEqual(down)
    expect(uncommitted.settled).toHaveLength(1)
  })

  it('closes the running foreground segment before the commit and passes it with the command', async () => {
    const w = world({ entries: [entry('timer:threshold', at(-1))] })
    await w.fire()
    expect(w.closed).toEqual([RUNNING])
    const paused = world({ entries: [entry('timer:threshold', at(-1))], timing: CLOSED })
    await paused.fire()
    expect(paused.closed).toEqual([])
  })
})

describe('the decision a timer commits', () => {
  async function decisionOf(
    key: 'timer:threshold' | 'timer:foreground-limit',
    snapshot: CallSnapshot,
  ) {
    const w = world({ entries: [entry(key, at(-1))] })
    await w.fire()
    const [settled] = w.settled
    if (settled === undefined) throw new Error('nothing was committed')
    const [, , inputDigest, decide] = settled
    return { inputDigest, decision: decide(snapshot, mintOf(snapshot), null) }
  }

  it('drops the entry and commits nothing else for a call that does not run in front', async () => {
    for (const snapshot of [
      await admittedCallSnapshot(),
      { ...(await admittedCallSnapshot()), call: null },
    ]) {
      const { decision } = await decisionOf('timer:threshold', snapshot)
      expect(decision).toEqual({
        kind: 'commit',
        value: null,
        writes: [{ kind: 'unschedule', key: 'timer:threshold' }],
      })
    }
  })

  it('a threshold asks to move or else reject; the decision keeps its writes and drops the entry last', async () => {
    const { decision, inputDigest } = await decisionOf(
      'timer:threshold',
      await runningCallSnapshot(),
    )
    if (decision.kind !== 'commit') throw new Error(`not a commit: ${decision.kind}`)
    expect(decision.value?.progress).toMatchObject({
      kind: 'rejected',
      reason: 'background-not-allowed',
    })
    expect(decision.writes.at(-1)).toEqual({ kind: 'unschedule', key: 'timer:threshold' })
    expect(decision.writes.length).toBeGreaterThan(1)
    const limit = await decisionOf('timer:foreground-limit', await admittedCallSnapshot())
    expect(inputDigest).not.toBe(limit.inputDigest)
  })

  it('a foreground limit of a call that cannot move needs its synthetic result first, and is passed on as it is', async () => {
    const { decision } = await decisionOf('timer:foreground-limit', await runningCallSnapshot())
    expect(decision.kind).toBe('prepare-synthetic')
    expect(decision).not.toHaveProperty('writes')
  })
})

describe('the timer helpers', () => {
  it('reads the origin only from a timer key', () => {
    expect(timerOriginOf('timer:threshold')).toBe('threshold')
    expect(timerOriginOf('timer:foreground-limit')).toBe('foreground-limit')
    for (const key of ['timer:other', 'timer:constructor', 'xxxxx:threshold', 'call', 'body:x'])
      expect(timerOriginOf(key)).toBeNull()
    expect(TIMERS_OFF).toEqual([
      { kind: 'unschedule', key: 'timer:threshold' },
      { kind: 'unschedule', key: 'timer:foreground-limit' },
    ])
  })

  it('gives each timer operation one fixed subject of Tool', () => {
    const place = { tenant: tenantA, call: CALL, operation: operationId('timer/threshold/1') }
    expect(timerSubject(place)).toEqual(timerSubject({ ...place }))
    expect(timerSubject(place)).not.toEqual(
      timerSubject({ ...place, operation: operationId('timer/threshold/2') }),
    )
    expect(timerSubject(place).owner).toBe('@omne-harness/tool')
  })

  it('takes only a canonical instant from the clock', () => {
    expect(instantOf({ now: () => NOW })).toBe(NOW)
    expect(instantOf({ now: () => 'yesterday' })).toBeNull()
  })

  it('closes a running segment by its elapsed time and reports unknown when it cannot', async () => {
    const elapsed = (answer: unknown) => ({
      elapsed: async () => {
        if (answer instanceof Error) throw answer
        return answer as never
      },
    })
    const ok = (milliseconds: string) => succeed({ milliseconds, evidence: evidence('e') })
    expect(await segmentCloser(elapsed(ok('50')))(RUNNING)).toEqual(CLOSED)
    const unknown = {
      kind: 'unknown',
      accumulatedMs: '25',
      segment: (RUNNING as Extract<ToolTiming, { kind: 'running' }>).segment,
      diagnostic: 'suspension-elapsed-unavailable',
    }
    for (const answer of [
      ok('-1'),
      ok('5.5'),
      fail({ kind: 'unavailable' }),
      new Error('the clock threw'),
    ])
      expect(await segmentCloser(elapsed(answer))(RUNNING)).toEqual(unknown)
    expect(await segmentCloser(elapsed(ok('1')))(CLOSED)).toBe(CLOSED)
  })
})
