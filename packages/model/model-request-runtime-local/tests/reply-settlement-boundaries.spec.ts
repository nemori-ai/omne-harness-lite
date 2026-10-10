// @module-tag slow
import { describe, expect, it } from 'vitest'
import type {
  CallAccess,
  ServiceInvalidInput,
  SettleReplyInput,
  SettlementScheduler,
} from '@omne-harness-lite/model-request-runtime'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import { deferred, payload, type TestPlan } from './anchored-invocation-fixture.ts'

describe('reply settlement input ownership and authorization boundaries', () => {
  it('propagates the second retained-value getter error before taking a reservation', async () => {
    const h = await acknowledgementHost()
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      const opened = await h.service.openCall(h.request('p6_e_getter'))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('pending')
      const before = await h.entries()
      const error = new Error('second retained read')
      const reads: number[] = []
      const request: SettleReplyInput = {
        ...ref,
        disposition: { vetoed: { by: 'p6-e' } },
        get retainedResult() {
          reads.push(reads.length + 1)
          if (reads.length === 2) throw error
          return dispatched.replyPending
        },
      }
      await expect(h.service.settleReply(request)).rejects.toBe(error)
      expect(reads).toEqual([1, 2])
      expect(await h.entries()).toEqual(before)
      const available = h.calls.reserve(ref)
      if (!('reservation' in available)) throw new Error('reservation leaked')
      available.reservation.release()
      expect(h.wire.sends()).toBe(1)
      expect(await h.runtime.close()).toEqual({ released: true })
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it('owns the caller ACK witness before waiting on another call reservation', async () => {
    let waits = 0,
      stops = 0
    const scheduler: SettlementScheduler = {
      nowMonotonicMs: () => 0,
      wait() {
        waits++
        const completion = deferred<'elapsed' | 'cancelled'>()
        const stopped = deferred<void>()
        return {
          completion: completion.promise,
          stopped: stopped.promise,
          requestStop() {
            stops++
            completion.resolve('cancelled')
            stopped.resolve()
          },
        }
      },
    }
    const h = await acknowledgementHost({ settlementScheduler: scheduler })
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      const opened = await h.service.openCall(h.request('p6_e_copy'))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('pending')
      const retained = { ...dispatched.replyPending }
      expect(
        await h.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: retained.id },
        }),
      ).toHaveProperty('acknowledged')
      expect(await h.contentRows(ref.callId)).toBe(0)
      const held = h.calls.reserve(ref)
      if (!('reservation' in held)) throw new Error('reservation')
      const before = await h.entries()
      const disposition = { vetoed: { by: 'p6-e-copy' } }
      const completion = h.service.settleReply({ ...ref, disposition, retainedResult: retained })
      retained.stopReason = 'changed-after-entry'
      held.reservation.release()
      expect(await completion).toEqual({ callId: ref.callId, state: 'complete' })
      expect(waits).toBe(1)
      expect(stops).toBe(1)
      const after = await h.entries()
      expect(after.slice(before.length)).toHaveLength(1)
      const written = after[before.length]
      if (written === undefined) throw new Error('response not written')
      expect(payload(written)).toMatchObject({ id: retained.id, replyDisposition: disposition })
      expect(await h.workRows(ref.callId)).toBe(0)
      expect(await h.runtime.close()).toEqual({ released: true })
    } finally {
      await h.host.close()
    }
  }, 30_000)

  it('returns the exact external refusal through the original Promise adoption boundaries', async () => {
    const h = await acknowledgementHost()
    const calls = createCallContainerStore<TestPlan, object>()
    const ports = referencePorts(h.host, calls)
    const trace: string[] = []
    const refusal: ServiceInvalidInput & { readonly then: undefined } = {
      invalidInput: { reason: 'observer_scope_mismatch' },
      get then() {
        trace.push('then')
        return undefined
      },
    }
    const callAccess: CallAccess = {
      check(input, admitted) {
        if (input.action !== 'settle') return ports.callAccess.check(input, admitted)
        trace.push('check')
        return Promise.resolve(refusal)
      },
    }
    const runtime = createModelRuntime({
      ...h.construction,
      ...ports,
      calls,
      callAccess,
    })
    try {
      h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      const opened = await runtime.service.openCall(h.request('p6_e_then'))
      if (!('ref' in opened)) throw new Error('open')
      const ref = opened.ref
      const dispatched = await runtime.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('pending')
      expect(
        await runtime.service.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: dispatched.replyPending.id },
        }),
      ).toHaveProperty('acknowledged')
      const before = await h.entries()
      const completion = runtime.service.settleReply({
        ...ref,
        disposition: { vetoed: { by: 'p6-e' } },
      })
      void completion.then(() => trace.push('settled'))
      expect(await completion).toBe(refusal)
      expect(trace).toEqual(['check', 'then', 'then', 'then', 'settled'])
      expect(await h.entries()).toEqual(before)
      const available = calls.reserve(ref)
      if (!('reservation' in available)) throw new Error('reservation leaked')
      available.reservation.release()
      expect(h.wire.sends()).toBe(1)
      expect(await runtime.close()).toEqual({ released: true })
      expect(await h.runtime.close()).toEqual({ released: true })
    } finally {
      await runtime.close()
      await h.host.close()
    }
  }, 30_000)
})
