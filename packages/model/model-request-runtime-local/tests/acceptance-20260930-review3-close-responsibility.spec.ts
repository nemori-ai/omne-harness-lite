// @module-tag slow
// 归慢层：整套装配＋真库：用例经会话选择宿主起租户、时钟与评估输入的整套装配（SQLite 文件库），并开真实 SQL journal 会话日志。
/**
 * Independent acceptance 2026-09-30, T29 round 3 residue: what `runtime.close` may and may not
 * do with an in-flight original invocation (verification A22-V16′ B-2, A22-V6; RT12 S-86).
 *
 * Two calls meet the same close path and must be told apart by the durable facts:
 *
 * - **A formed complete reply whose ready never landed** (`reply_pending` locally, nothing
 *   durable beyond the opened anchor). Closing it must not manufacture a final that contradicts
 *   the reply this process already holds: close answers `unavailable` and keeps the
 *   responsibility for a later recovery. A close that fabricates `interrupted` (P1) or one that
 *   finishes as ready without a durable ready (mutation B2c) are both counterexamples.
 * - **A real in-flight caller stopped by its host after the opened anchor was confirmed** and
 *   before any content was accepted. Its writer evidence is complete (the anchor receipt is
 *   known, the stream was stopped by this process), so S-86 closes it with the no-reply final;
 *   it must not be isolated forever with a close that can never answer (demo gap E).
 *
 * Real assembly: SQLite Storage, SQL journal SessionLog and the Cordis host of
 * tests/session-selection-fixture.ts. Only what the runtime *sees* is disturbed (one append
 * receipt, the moment of a host stop); every verdict is read back from the durable log or a
 * cold process, never from the runtime's own report alone.
 */
import { afterAll, describe, expect, it } from 'vitest'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { ControlledSettlementOwner } from './settlement-fixture.ts'
import { transport } from './anchored-invocation-fixture.ts'
import { selectionHost } from './session-selection-fixture.ts'
import {
  callHost,
  entriesOf,
  finalsOf,
  kindOf,
  observedOwner,
  runtimeOver,
  within,
  type Host,
} from './review3-close-fixture.ts'

const rejections: unknown[] = []
process.on('unhandledRejection', reason => rejections.push(reason))
afterAll(() => expect(rejections).toEqual([]))

describe('A22-V16′ B-2: runtime close over a reply whose ready never landed', () => {
  /**
   * The first ready marker never reaches the log; the runtime sees `refusal` as its receipt and
   * keeps `reply_pending` locally. Everything else (creation, dispatch, opened) is real.
   */
  async function unlandedReady(
    host: Host,
    key: string,
    refusal: { readonly failure: 'unavailable' } | { readonly failure: 'tailChanged' },
  ) {
    let refused = 0
    const rt = await runtimeOver(host, {
      prefix: key,
      append: real => async (session, entries, fence, condition) => {
        const first = entries[0] as unknown as LogEntry | undefined
        if (refused === 0 && first !== undefined && kindOf(first) === 'model_call_reply_ready') {
          refused++
          if (refusal.failure === 'unavailable') return refusal
          const read = await host.log.readSince(session, 0)
          if (!('tail' in read)) throw new Error('durable log unavailable')
          return { failure: 'tailChanged', tail: read.tail }
        }
        return await real(session, entries, fence, condition)
      },
    })
    const ref = await rt.open(`rv3_close_${key}`, callHost())
    const dispatched = await within(20_000, rt.service.dispatch(ref), 'dispatch')
    expect(dispatched).toEqual({ unavailable: true })
    expect(refused, 'exactly one ready append was refused').toBe(1)
    const before = await entriesOf(host, ref.callId)
    expect(before.map(value => value.kind)).toEqual([
      'model_call_created',
      'model_call_dispatched',
      'model_call_opened',
    ])
    expect(rt.calls.find(ref)?.view().operation.phase).toBe('reply_pending')
    return { rt, ref, before }
  }

  /** The first close answers unavailable, writes nothing and leaves the reply where it was. */
  async function firstCloseKeeps(
    host: Host,
    made: Awaited<ReturnType<typeof unlandedReady>>,
  ): Promise<void> {
    const { rt, ref, before } = made
    const closed = await within(20_000, rt.runtime.close(), 'first close')
    expect(closed, 'runtime.close over an unlanded ready').toEqual({ unavailable: true })
    // P1: the container close may not manufacture an interrupted final.
    const afterFirst = await entriesOf(host, ref.callId)
    expect(finalsOf(afterFirst), 'a final manufactured by runtime.close').toEqual([])
    expect(afterFirst.map(value => value.kind)).toEqual(before.map(value => value.kind))
    expect(rt.calls.find(ref)?.view().operation.phase, 'the responsibility stays local').toBe(
      'reply_pending',
    )
  }

  it('a ready refused outright (tailChanged): close answers unavailable and writes no final; the holder can still settle the reply as itself, after which close releases', async () => {
    const host = await selectionHost(true, true)
    try {
      const made = await unlandedReady(host, 'b2a', { failure: 'tailChanged' })
      const { rt, ref } = made
      await firstCloseKeeps(host, made)

      // B2c: the writer stopped with a definite refusal, so the stop read the complete prefix
      // and reached its durable-ready check. Had it finished the invocation as ready without a
      // durable ready, the formed reply would be gone: the retained original invocation could
      // no longer settle it. Keeping the responsibility means exactly that it still can.
      const invocation = rt.calls.find(ref)?.view().invocation
      if (invocation === undefined) throw new Error('the original invocation was detached')
      const settled = await within(20_000, invocation.settleReply('persisted'), 'settle')
      expect(settled, 'the held reply could not be settled after the failed close').toHaveProperty(
        'settled',
      )
      const finals = finalsOf(await entriesOf(host, ref.callId))
      expect(finals).toHaveLength(1)
      expect(finals[0]).toMatchObject({
        outcome: 'complete',
        replyDisposition: 'persisted',
        id: 'b2a-response-1',
      })
      expect(finals[0]).toHaveProperty('reply')

      // With the reply's own final durable, the same stop finishes as ready and releases.
      expect(await within(20_000, rt.runtime.close(), 'second close')).toEqual({ released: true })
      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'complete' },
      })
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toHaveLength(1)
    } finally {
      await host.close()
    }
  }, 90_000)

  it('a ready whose receipt is unavailable and which never landed: close answers unavailable twice, writes no final; a cold process still sees the in-flight frontier', async () => {
    const host = await selectionHost(true, true)
    try {
      const made = await unlandedReady(host, 'b2b', { failure: 'unavailable' })
      const { rt, ref } = made
      // The unknown ready writer is retained; the stop cannot establish the outcome and the
      // container must not close the original invocation into an interrupted final (P1).
      await firstCloseKeeps(host, made)

      // A second close finds the same durable facts and answers the same way.
      expect(await within(20_000, rt.runtime.close(), 'second close')).toEqual({
        unavailable: true,
      })
      expect(finalsOf(await entriesOf(host, ref.callId))).toEqual([])

      // A cold process reads the durable frontier: the call is still speaking, not ended.
      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      const read = await cold.service.acquireCall({ ref, mode: 'read' })
      expect(read).toMatchObject({ view: { state: 'speaking' } })
      expect(read).not.toHaveProperty(['view', 'result'])
      expect(await cold.runtime.close()).toEqual({ released: true })
      expect(finalsOf(await entriesOf(host, ref.callId))).toEqual([])
    } finally {
      await host.close()
    }
  }, 90_000)
})

describe('RT12 S-86: a host stop after the confirmed opened anchor, before any accepted content', () => {
  it('closes the real in-flight caller with the no-reply final; dispatch and close answer, a cold process reads interrupted', async () => {
    const host = await selectionHost(true, true)
    const inner = new ControlledSettlementOwner()
    const { owner, started } = observedOwner(inner)
    const stop = new AbortController()
    let gateSettled: Promise<void> | undefined
    let stops = 0
    const rt = await runtimeOver(host, {
      prefix: 's86',
      owner,
      // The stream yields its first content and then waits until the content gate of the
      // invocation has actually ended, so the opened receipt is confirmed before the stopped
      // stream is observed (the order the race under test produces).
      wire: transport({
        afterContent: async () => {
          await within(15_000, gateSettled ?? Promise.resolve(), 'content gate')
        },
      }),
      // The opened anchor really lands; the host stops while its receipt is on the way back.
      append: real => async (session, entries, fence, condition) => {
        const first = entries[0] as unknown as LogEntry | undefined
        const landed = await real(session, entries, fence, condition)
        if (stops === 0 && first !== undefined && kindOf(first) === 'model_call_opened') {
          stops++
          if ('failure' in landed) throw new Error(`opened did not land: ${landed.failure}`)
          const gate = started.filter(task => task.kind === 'wait').at(-1)
          if (gate === undefined) throw new Error('no content gate task registered')
          gateSettled = gate.completion.then(
            () => undefined,
            () => undefined,
          )
          stop.abort()
        }
        return landed
      },
    })
    try {
      const ref = await rt.open('rv3_close_s86', callHost(stop))
      const dispatched = await within(20_000, rt.service.dispatch(ref), 'dispatch')
      expect(stops, 'the host stopped exactly once, on the opened receipt').toBe(1)
      expect(dispatched).toMatchObject({
        settled: { outcome: 'interrupted', initiator: 'run_cancelled', id: 's86-response-1' },
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
      expect(await within(20_000, rt.runtime.close(), 'close')).toEqual({ released: true })
      expect(inner.active, 'registrations still held after close').toBe(0)

      await host.reopen()
      const cold = await runtimeOver(host, { prefix: 'cold' })
      expect(await cold.service.acquireCall({ ref, mode: 'read' })).toMatchObject({
        view: { state: 'interrupted' },
      })
      expect(await cold.runtime.close()).toEqual({ released: true })
    } finally {
      stop.abort()
      await within(10_000, rt.runtime.close(), 'teardown close').catch(() => {})
      await host.close()
    }
  }, 90_000)
})
