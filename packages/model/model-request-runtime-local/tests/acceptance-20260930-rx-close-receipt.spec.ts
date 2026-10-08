/**
 * Main-line ruling R-X (2026-09-30): a graceful stop that meets an opened append already handed
 * to the log, its receipt not yet back, and the invocation finishing first, no longer isolates
 * the call forever. The anchored owner waits for that append's own receipt (bounded by the
 * append itself, no timer guesses) and closes by what it says:
 *
 * - landed → the same road as "confirmed, then stopped": the RT12 S-86 no-reply
 *   `interrupted/run_cancelled` final, `dispatch` settled, container retired, `runtime.close`
 *   released, a cold process reads `interrupted`;
 * - proven absent (`tailChanged`) → this call never opened: the unopened no-reply final, no
 *   opened anchor and no `firstTokenAt`/`delivered` pretending it did;
 * - unknown (the log layer cannot read the receipt back) → `unavailable`, no final, the
 *   responsibility kept; a cold process still reads the in-flight frontier.
 *
 * Before R-X the first two branches answered `unavailable` for good: the container phase stayed
 * `dispatching`, `runtime.close` could never release, and the session held an opened anchor
 * with no final ("final before opened" was the contradiction being avoided; waiting for the
 * receipt removes it instead).
 *
 * Real assembly: SQLite Storage, SQL journal SessionLog and the Cordis host of
 * tests/session-selection-fixture.ts. Only the one opened append receipt and the moment of the
 * host stop are disturbed; every verdict is read back from the durable log or a cold process.
 */
import { afterAll, describe, expect, it } from 'vitest'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { ControlledSettlementOwner } from './settlement-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'
import {
  callHost,
  entriesOf,
  finalsOf,
  kindOf,
  runtimeOver,
  within,
  type Host,
} from './review3-close-fixture.ts'

const rejections: unknown[] = []
process.on('unhandledRejection', reason => rejections.push(reason))
afterAll(() => expect(rejections).toEqual([]))

type OpenedReceipt = 'landed' | 'tailChanged' | 'unavailable'

/** Resolves once the runtime's own invocation reported its stop through the policy diagnostic. */
async function invocationStopped(diagnostics: () => readonly string[] | undefined): Promise<void> {
  while (!diagnostics()?.includes('model_invocation.stopped'))
    await new Promise(resolve => setTimeout(resolve, 5))
}

/**
 * The stream yields its first content; the opened append is handed to the log; the host stops
 * and the invocation is allowed to finish *before* the append answers. Only then does the
 * append answer with `receipt`: really landed, provably absent, or landed but unreadable.
 */
async function stoppedDuringOpenedAppend(host: Host, key: string, receipt: OpenedReceipt) {
  const inner = new ControlledSettlementOwner()
  const stop = new AbortController()
  let stops = 0
  let invocationEndedBeforeReceipt = false
  let receiptAnswered = false
  let diagnostics: readonly string[] | undefined
  const rt = await runtimeOver(host, {
    prefix: key,
    owner: inner,
    append: real => async (session, entries, fence, condition) => {
      const first = entries[0] as unknown as LogEntry | undefined
      if (stops === 0 && first !== undefined && kindOf(first) === 'model_call_opened') {
        stops++
        stop.abort()
        await within(
          15_000,
          invocationStopped(() => diagnostics),
          'invocation stop',
        )
        invocationEndedBeforeReceipt = true
        if (receipt === 'tailChanged') {
          const read = await host.log.readSince(session, 0)
          if (!('tail' in read)) throw new Error('durable log unavailable')
          receiptAnswered = true
          return { failure: 'tailChanged', tail: read.tail }
        }
        const landed = await real(session, entries, fence, condition)
        if ('failure' in landed) throw new Error(`opened did not land: ${landed.failure}`)
        receiptAnswered = true
        return receipt === 'landed' ? landed : { failure: 'unavailable' }
      }
      return await real(session, entries, fence, condition)
    },
  })
  diagnostics = rt.diagnostics
  const ref = await rt.open(`rx_close_${key}`, callHost(stop))
  const dispatched = await within(20_000, rt.service.dispatch(ref), 'dispatch')
  expect(stops, 'the host stopped exactly once, during the opened append').toBe(1)
  // R-X: the outcome is bounded by the receipt, never answered ahead of it.
  expect(receiptAnswered, 'dispatch answered before the opened receipt').toBe(true)
  expect(invocationEndedBeforeReceipt, 'the invocation finished before the receipt').toBe(true)
  return { rt, ref, inner, dispatched, stop }
}

describe('R-X: graceful stop while the opened append is in flight and the invocation ends first', () => {
  it('receipt landed: settles the S-86 no-reply interrupted final; dispatch settled, close released, a cold process reads interrupted', async () => {
    const host = await selectionHost(true, true)
    let made: Awaited<ReturnType<typeof stoppedDuringOpenedAppend>> | undefined
    try {
      made = await stoppedDuringOpenedAppend(host, 'rxa', 'landed')
      const { rt, ref, inner, dispatched } = made
      expect(dispatched).toMatchObject({
        settled: { outcome: 'interrupted', initiator: 'run_cancelled', id: 'rxa-response-1' },
      })
      expect(dispatched).not.toHaveProperty(['settled', 'reply'])
      const entries = await entriesOf(host, ref.callId)
      expect(entries.map(value => value.kind)).toEqual([
        'model_call_created',
        'model_call_dispatched',
        'model_call_opened',
        undefined,
      ])
      const finals = finalsOf(entries)
      expect(finals).toHaveLength(1)
      expect(finals[0]).toMatchObject({ outcome: 'interrupted', initiator: 'run_cancelled' })
      expect(finals[0]).not.toHaveProperty('reply')
      expect(finals[0]).not.toHaveProperty('replyDisposition')
      expect(finals[0]).toHaveProperty(['timing', 'firstTokenAt'])
      expect(rt.calls.find(ref), 'the container was retired').toBeUndefined()
      expect(await within(20_000, rt.runtime.close(), 'close')).toEqual({ released: true })
      expect(inner.active, 'registrations still held after close').toBe(0)

      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'interrupted' },
      })
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toHaveLength(1)
    } finally {
      made?.stop.abort()
      if (made) await within(10_000, made.rt.runtime.close(), 'teardown close').catch(() => {})
      await host.close()
    }
  }, 90_000)

  it('receipt tailChanged: this call never opened; settles the unopened no-reply final without an opened anchor, close released, a cold process reads interrupted', async () => {
    const host = await selectionHost(true, true)
    let made: Awaited<ReturnType<typeof stoppedDuringOpenedAppend>> | undefined
    try {
      made = await stoppedDuringOpenedAppend(host, 'rxb', 'tailChanged')
      const { rt, ref, inner, dispatched } = made
      expect(dispatched).toMatchObject({
        settled: { outcome: 'interrupted', initiator: 'run_cancelled', id: 'rxb-response-1' },
      })
      expect(dispatched).not.toHaveProperty(['settled', 'reply'])
      const entries = await entriesOf(host, ref.callId)
      expect(entries.map(value => value.kind)).toEqual([
        'model_call_created',
        'model_call_dispatched',
        undefined,
      ])
      const finals = finalsOf(entries)
      expect(finals).toHaveLength(1)
      expect(finals[0]).toMatchObject({ outcome: 'interrupted', initiator: 'run_cancelled' })
      expect(finals[0]).not.toHaveProperty('reply')
      expect(finals[0]).not.toHaveProperty('delivered')
      expect(finals[0]).not.toHaveProperty(['timing', 'firstTokenAt'])
      expect(rt.calls.find(ref), 'the container was retired').toBeUndefined()
      expect(await within(20_000, rt.runtime.close(), 'close')).toEqual({ released: true })
      expect(inner.active, 'registrations still held after close').toBe(0)

      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'interrupted' },
      })
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toHaveLength(1)
    } finally {
      made?.stop.abort()
      if (made) await within(10_000, made.rt.runtime.close(), 'teardown close').catch(() => {})
      await host.close()
    }
  }, 90_000)

  it('receipt unknown: stays unavailable, writes no final and keeps the responsibility; a cold process still reads the in-flight frontier', async () => {
    const host = await selectionHost(true, true)
    let made: Awaited<ReturnType<typeof stoppedDuringOpenedAppend>> | undefined
    try {
      made = await stoppedDuringOpenedAppend(host, 'rxc', 'unavailable')
      const { rt, ref, inner, dispatched } = made
      expect(dispatched).toEqual({ unavailable: true })
      const before = await entriesOf(host, ref.callId)
      expect(before.map(value => value.kind)).toEqual([
        'model_call_created',
        'model_call_dispatched',
        'model_call_opened',
      ])
      expect(rt.calls.find(ref), 'the responsibility stays local').toBeDefined()
      expect(inner.active, 'the unknown writer stays owned').toBe(1)
      for (const attempt of ['first close', 'second close'])
        expect(await within(20_000, rt.runtime.close(), attempt), attempt).toEqual({
          unavailable: true,
        })
      expect(finalsOf(await entriesOf(host, ref.callId)), 'a final manufactured by close').toEqual(
        [],
      )
      expect(inner.active, 'a close released the unknown writer').toBe(1)

      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      const read = await cold.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({ view: { state: 'speaking' } })
      expect(read).not.toHaveProperty(['view', 'result'])
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toEqual([])
    } finally {
      made?.stop.abort()
      await host.close()
    }
  }, 90_000)
})
