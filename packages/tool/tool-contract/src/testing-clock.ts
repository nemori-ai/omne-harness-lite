// The ToolClock conformance suite (P07, story 28) and a non-durable clock that conforms to it. The
// clock runs on manual time that its controls move, and declares `durability: 'none'`: it proves
// nothing about a host clock and must not be assembled into production.
import assert from 'node:assert/strict'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionRef } from './execution.ts'
import type { Access, DurableEvidence } from './identity.ts'
import type { ToolClock } from './ports.ts'
import type { ClockSegment } from './records.ts'
import type { ToolFailure } from './results.ts'
import {
  conformanceCase,
  finalAnswer,
  handle,
  refused,
  succeeded,
  within,
  type AnswerModel,
  type ConformanceCase,
} from './testing-case.ts'
import {
  callId,
  instanceId,
  memoryAccess,
  mintEvidence,
  operationId,
  TESTING_OWNER,
} from './testing-values.ts'

/**
 * The answer model of the clock (P07): no call has a progress kind or a lost reply. `begin` and
 * `elapsed` answer a marker or a measurement, or fail (`unavailable` when the time cannot be
 * compared), and the failure is final; `waitUntil` is an asynchronous channel that answers once,
 * `elapsed` or `cancelled`, within the wait that the fixture names (`waitMs`), so no handle
 * completes it and no case polls it.
 */
export const clockAnswers = {
  now: { clause: 'P07', progress: [] },
  begin: { clause: 'P07', progress: [] },
  elapsed: { clause: 'P07', progress: [] },
  waitUntil: { clause: 'P07', progress: [] },
} as const satisfies AnswerModel<keyof ToolClock>

/**
 * What the clock suite needs. A fresh fixture serves one case. `access` names the tenant of the
 * executions that segments belong to. The optional handles move the time source of the provider,
 * and a case that needs one that is missing is reported not applicable: `advance` lets
 * milliseconds pass on the time that the clock measures (an elapsed time is then exactly that
 * many milliseconds more); `setBack` turns the wall time back without letting the measured time
 * go back; `changeEpoch` makes the clock lose comparability with every marker it gave out before,
 * as a restart or another host would; `instantAfter` is a legal instant of this clock that lies the
 * given milliseconds ahead of now, in whatever format the clock reads. Completion contract: `advance`,
 * `setBack` and `changeEpoch` resolve only after the time source has changed and every later read
 * of the clock sees it; an answer that the clock then owes (`waitUntil`) is a real asynchronous
 * channel and arrives within `waitMs`, so the suite never polls. `waitMs` (default 1000) is
 * how long the suite waits for an answer that the clock owes, and `quietMs` (default 25) how long
 * it waits before it concludes that the clock has not answered.
 */
export interface ToolClockFixture {
  readonly clock: ToolClock
  readonly access: Access<unknown>
  readonly waitMs?: number
  readonly quietMs?: number
  /** Resolves after the measured time has moved by this many milliseconds and every read sees it. */
  advance?(milliseconds: number): void | Promise<void>
  /** Resolves after the wall time went back and every read sees it; the measured time stays. */
  setBack?(milliseconds: number): void | Promise<void>
  /** Resolves after the clock lost comparability with every earlier marker. */
  changeEpoch?(): void | Promise<void>
  /** A legal instant of this clock that lies this many milliseconds ahead of now (a read). */
  instantAfter?(milliseconds: number): string
}

const DEFAULT_WAIT_MS = 1_000
const DEFAULT_QUIET_MS = 25

function scene(fixture: ToolClockFixture) {
  const { clock, access } = fixture
  const execution = (call = 'call-1'): ToolExecutionRef => ({
    tenant: access.tenant,
    call: callId(call),
    instance: instanceId(),
    generation: '1',
  })
  const begin = async (operation = 'segment-1', call = 'call-1'): Promise<ClockSegment> =>
    succeeded(
      await finalAnswer({
        ask: () => clock.begin({ operation: operationId(operation), execution: execution(call) }),
        row: clockAnswers.begin,
        what: 'begin',
      }),
      'begin',
    )
  const elapsed = async (marker: DurableEvidence) =>
    succeeded(await clock.elapsed(marker), 'elapsed')
  const milliseconds = async (marker: DurableEvidence): Promise<number> => {
    const answer = await elapsed(marker)
    assert.match(answer.milliseconds, /^\d+$/u, 'elapsed milliseconds are a decimal count')
    return Number(answer.milliseconds)
  }
  const waitMs = fixture.waitMs ?? DEFAULT_WAIT_MS
  const quietMs = fixture.quietMs ?? DEFAULT_QUIET_MS
  return {
    clock,
    begin,
    elapsed,
    milliseconds,
    waitMs,
    /** True when `work` has not settled after the quiet period. */
    quiet: async (work: Promise<unknown>): Promise<boolean> => {
      const settledFirst = await Promise.race([
        work.then(() => true),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), quietMs)),
      ])
      return !settledFirst
    },
  }
}

export function toolClockConformance(): readonly ConformanceCase<ToolClockFixture>[] {
  return [
    conformanceCase('P07', 'begin answers a marker that names its operation', async fixture => {
      const s = scene(fixture)
      const segment = await s.begin('segment-1')
      assert.equal(segment.operation, 'segment-1')
      assert.ok(segment.source.length > 0, 'the source of the marker is named')
      assert.ok(segment.epoch.length > 0, 'the epoch of the marker is named')
      const { marker } = segment
      assert.ok(marker.owner.length > 0, 'the owner of the marker is named')
      assert.ok(marker.record.length > 0, 'the record of the marker is named')
      assert.ok(marker.digest.length > 0, 'the digest of the marker is named')
    }),

    conformanceCase(
      'P07',
      'a segment that is only begun leaves the other segments alone',
      async fixture => {
        const advance = handle(fixture.advance, 'advance')
        const s = scene(fixture)
        const first = await s.begin('segment-1')
        await advance.call(fixture, 100)
        const before = await s.milliseconds(first.marker)
        // A begin that is never committed and never closed changes nothing that was measured.
        const second = await s.begin('segment-2', 'call-2')
        assert.equal(await s.milliseconds(first.marker), before)
        await advance.call(fixture, 50)
        assert.equal(await s.milliseconds(first.marker), before + 50)
        assert.equal(await s.milliseconds(second.marker), 50)
      },
    ),

    conformanceCase('P07', 'elapsed measures the time since the marker', async fixture => {
      const advance = handle(fixture.advance, 'advance')
      const s = scene(fixture)
      const segment = await s.begin()
      assert.equal(await s.milliseconds(segment.marker), 0)
      await advance.call(fixture, 250)
      const sampled = await s.elapsed(segment.marker)
      assert.equal(sampled.milliseconds, '250')
      assert.ok(sampled.evidence.owner.length > 0 && sampled.evidence.digest.length > 0)
      assert.equal(await s.milliseconds(segment.marker), 250)
    }),

    conformanceCase('P07', 'time going backwards never adds budget', async fixture => {
      const advance = handle(fixture.advance, 'advance')
      const setBack = handle(fixture.setBack, 'setBack')
      const s = scene(fixture)
      const segment = await s.begin()
      await advance.call(fixture, 100)
      const before = await s.milliseconds(segment.marker)
      await setBack.call(fixture, 60)
      // Elapsed time that shrinks would grow the remaining budget. A clock may report the fault
      // instead, but it never answers less than it answered before.
      for (const turn of [0, 1]) {
        const answer = await s.clock.elapsed(segment.marker)
        if ('ok' in answer) assert.ok(Number(answer.ok.milliseconds) >= before)
        if (turn === 0) await advance.call(fixture, 10)
      }
    }),

    conformanceCase(
      'P07',
      'a marker of an epoch that cannot be compared is not measured',
      async fixture => {
        const advance = handle(fixture.advance, 'advance')
        const changeEpoch = handle(fixture.changeEpoch, 'changeEpoch')
        const s = scene(fixture)
        const segment = await s.begin()
        await advance.call(fixture, 100)
        await changeEpoch.call(fixture)
        // Unknown is a failure of the port: no number, so no zero and no reduced elapsed time.
        refused(
          await s.clock.elapsed(segment.marker),
          'elapsed across an epoch that cannot be compared',
        )
        const fresh = await s.begin('segment-2')
        assert.equal(await s.milliseconds(fresh.marker), 0)
      },
    ),

    conformanceCase('P07', 'waitUntil answers cancelled when the signal aborts', async fixture => {
      const instantAfter = handle(fixture.instantAfter, 'instantAfter')
      const s = scene(fixture)
      const controller = new AbortController()
      const waiting = s.clock.waitUntil(instantAfter.call(fixture, 1_000_000), controller.signal)
      assert.ok(
        await s.quiet(waiting),
        'waitUntil answered before the instant and before the abort',
      )
      controller.abort()
      assert.equal(await within(waiting, s.waitMs, 'waitUntil after abort'), 'cancelled')
    }),

    conformanceCase(
      'P07',
      'waitUntil on a signal already aborted answers cancelled',
      async fixture => {
        const instantAfter = handle(fixture.instantAfter, 'instantAfter')
        const s = scene(fixture)
        const controller = new AbortController()
        controller.abort()
        const answer = await within(
          s.clock.waitUntil(instantAfter.call(fixture, 1_000_000), controller.signal),
          s.waitMs,
          'waitUntil on an aborted signal',
        )
        assert.equal(answer, 'cancelled')
      },
    ),

    conformanceCase(
      'P07',
      'waitUntil answers elapsed once the instant is reached',
      async fixture => {
        const instantAfter = handle(fixture.instantAfter, 'instantAfter')
        const advance = handle(fixture.advance, 'advance')
        const s = scene(fixture)
        const controller = new AbortController()
        const waiting = s.clock.waitUntil(instantAfter.call(fixture, 200), controller.signal)
        await advance.call(fixture, 200)
        assert.equal(await within(waiting, s.waitMs, 'waitUntil at the instant'), 'elapsed')
      },
    ),

    conformanceCase(
      'P07',
      'waitUntil does not answer elapsed before the instant',
      async fixture => {
        const instantAfter = handle(fixture.instantAfter, 'instantAfter')
        const advance = handle(fixture.advance, 'advance')
        const s = scene(fixture)
        const controller = new AbortController()
        const waiting = s.clock.waitUntil(instantAfter.call(fixture, 1_000), controller.signal)
        await advance.call(fixture, 500)
        assert.ok(await s.quiet(waiting), 'waitUntil answered before its instant')
        controller.abort()
      },
    ),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable clock
// ---------------------------------------------------------------------------------------------

export interface MemoryToolClock extends ToolClock {
  readonly durability: 'none'
  readonly controls: Readonly<{
    advance(milliseconds: number): void
    setBack(milliseconds: number): void
    changeEpoch(): void
    instantAfter(milliseconds: number): string
  }>
}

const ORIGIN = Date.parse('2026-01-01T00:00:00.000Z')
const SOURCE = 'memory-clock'

type Waiter = { readonly at: number; resolve(answer: 'elapsed'): void }

/**
 * A clock on manual time. The wall reading can be turned back; the measured reading only moves
 * forward, so a marker holds the measured reading of its epoch and `begin` keeps no state. A
 * marker of an earlier epoch is not measured.
 */
export function createMemoryToolClock(): MemoryToolClock {
  let wall = 0
  let measured = 0
  let epoch = 1
  let minted = 0
  const waiters = new Set<Waiter>()

  const instant = (offset: number): string => new Date(ORIGIN + offset).toISOString()
  const unreadable = (diagnostic: string): Outcome<never, ToolFailure> =>
    fail({ kind: 'unavailable', dependency: 'clock', diagnostic })

  const clock: ToolClock = {
    now: () => instant(wall),
    begin: input => {
      minted += 1
      const text = `epoch-${epoch}`
      const marker = mintEvidence(`clock/${epoch}/${measured}/${minted}`, {
        operation: input.operation,
        epoch: text,
        measured,
        minted,
      })
      return Promise.resolve(
        succeed({ operation: input.operation, source: SOURCE, epoch: text, marker }),
      )
    },
    elapsed: evidence => {
      const parts = evidence.record.split('/')
      const [prefix, markerEpoch, start] = parts
      if (evidence.owner !== TESTING_OWNER || prefix !== 'clock' || parts.length !== 4)
        return Promise.resolve(unreadable('the evidence is not a marker of this clock'))
      if (markerEpoch !== String(epoch))
        return Promise.resolve(unreadable('the epoch of the marker cannot be compared'))
      minted += 1
      const milliseconds = measured - Number(start)
      return Promise.resolve(
        succeed({
          milliseconds: String(milliseconds),
          evidence: mintEvidence(`clock/elapsed/${minted}`, { marker: evidence, milliseconds }),
        }),
      )
    },
    waitUntil: (at, signal) => {
      const target = Date.parse(at) - ORIGIN
      if (signal.aborted) return Promise.resolve('cancelled')
      if (wall >= target) return Promise.resolve('elapsed')
      return new Promise(resolve => {
        const waiter: Waiter = {
          at: target,
          resolve: answer => {
            signal.removeEventListener('abort', onAbort)
            resolve(answer)
          },
        }
        const onAbort = (): void => {
          waiters.delete(waiter)
          resolve('cancelled')
        }
        waiters.add(waiter)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    },
  }

  const controls: MemoryToolClock['controls'] = {
    advance: milliseconds => {
      wall += milliseconds
      measured += milliseconds
      for (const waiter of waiters)
        if (wall >= waiter.at) {
          waiters.delete(waiter)
          waiter.resolve('elapsed')
        }
    },
    setBack: milliseconds => {
      wall -= milliseconds
    },
    changeEpoch: () => {
      epoch += 1
    },
    instantAfter: milliseconds => instant(wall + milliseconds),
  }
  return Object.freeze({ ...clock, durability: 'none' as const, controls })
}

/** A fresh fixture over a fresh in-memory clock, with every control handle. */
export function memoryToolClockFixture(): ToolClockFixture {
  const clock = createMemoryToolClock()
  const { controls } = clock
  return {
    clock,
    access: memoryAccess('tester'),
    advance: controls.advance,
    setBack: controls.setBack,
    changeEpoch: controls.changeEpoch,
    instantAfter: controls.instantAfter,
  }
}
