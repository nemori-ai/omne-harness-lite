// @module-tag slow
// Real SQLite content retention and SQL journal, with controlled trusted ports and stop gates.
import { describe, expect, it } from 'vitest'
import type { RuntimeCloseResult, SettlementOwner } from '@omne-harness-lite/model-request-runtime'
import { acknowledgementComponent } from './acknowledgement-host-fixture.ts'
import { modelValue } from './log-codec-fixture.ts'
import { acknowledgementHost, acknowledgements } from './acknowledgement-host-fixture.ts'
import { ControlledSettlementOwner, deferred } from './settlement-fixture.ts'

function isAcknowledgement(payload: Parameters<typeof modelValue>[0]): boolean {
  const value = modelValue(payload)
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'model_call_acknowledged'
  )
}

describe('ACK evidence and original-writer boundaries on real SQL', () => {
  it.each(['clock', 'prepared', 'appended'] as const)(
    'revocation at %s preserves the original check, fixed batch and retry',
    async point => {
      let invalidate = () => {}
      let armed = true
      let preparations = 0
      let submissions = 0
      const trace: string[] = []
      const h = await acknowledgementHost({
        content: real => ({
          ...real,
          async prepareAcknowledgement(input) {
            preparations++
            trace.push('prepare')
            const result = await real.prepareAcknowledgement(input)
            if (armed && point === 'prepared') invalidate()
            return result
          },
        }),
        append:
          real =>
          async (...args) => {
            const isAck = isAcknowledgement(args[1][0]?.payload)
            const result = await real(...args)
            if (isAck) {
              submissions++
              trace.push('append')
              if (armed && point === 'appended') invalidate()
            }
            return result
          },
      })
      const revoked = h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
      const component = acknowledgementComponent({
        ...h.construction,
        policy: {
          ...h.construction.policy,
          async now() {
            trace.push('clock')
            if (armed && point === 'clock') invalidate()
            return await h.construction.policy.now()
          },
        },
      })
      invalidate = () => {
        trace.push('revoke')
        revoked.abort()
      }
      try {
        expect(await h.service.openCall(h.request(`p5d_revoke_${point}`))).toMatchObject({
          callId: 'a22-call-1',
        })
        const ref = { session: h.host.session, callId: 'a22-call-1' }
        const dispatched = await h.service.dispatch(ref)
        if (!('replyPending' in dispatched)) throw new Error('ready reply')
        const target = { kind: 'response' as const, response: dispatched.replyPending.id }
        expect(await component.acknowledgeCall({ ref, expectedResult: target })).toEqual({
          unavailable: true,
        })
        expect(trace).toEqual(
          point === 'clock'
            ? ['clock', 'revoke']
            : point === 'prepared'
              ? ['clock', 'prepare', 'revoke']
              : ['clock', 'prepare', 'append', 'revoke'],
        )
        expect(preparations).toBe(point === 'clock' ? 0 : 1)
        expect(submissions).toBe(point === 'appended' ? 1 : 0)
        expect(await h.contentRows(ref.callId)).toBe(2)
        const prior = acknowledgements(await h.entries(), ref.callId)
        expect(prior).toHaveLength(point === 'appended' ? 1 : 0)

        armed = false
        h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
        expect(await component.acknowledgeCall({ ref, expectedResult: target })).toMatchObject({
          acknowledged: { ref, target, cleanup: 'released' },
        })
        const durable = acknowledgements(await h.entries(), ref.callId)
        expect(durable).toHaveLength(1)
        if (point === 'appended') expect(durable).toEqual(prior)
        expect(submissions).toBe(1)
        expect(await h.contentRows(ref.callId)).toBe(0)
      } finally {
        await component.close()
        await h.runtime.close()
        await h.host.close()
      }
    },
    30_000,
  )

  it('close at policy time rejects new ACK work and later closed recognition writes nothing', async () => {
    let closing: Promise<RuntimeCloseResult> | undefined
    let invalidate = () => {}
    let preparations = 0
    const h = await acknowledgementHost({
      content: real => ({
        ...real,
        async prepareAcknowledgement(input) {
          preparations++
          return await real.prepareAcknowledgement(input)
        },
      }),
    })
    h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
    const component = acknowledgementComponent({
      ...h.construction,
      policy: {
        ...h.construction.policy,
        async now() {
          invalidate()
          return await h.construction.policy.now()
        },
      },
    })
    invalidate = () => {
      closing = component.close()
    }
    try {
      await h.service.openCall(h.request('p5d_close_clock'))
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const input = {
        ref,
        expectedResult: { kind: 'response' as const, response: dispatched.replyPending.id },
      }
      expect(await component.acknowledgeCall(input)).toEqual({ unavailable: true })
      expect(closing).toBeDefined()
      expect(await closing).toEqual({ released: true })
      const before = await h.entries()
      expect(acknowledgements(before, ref.callId)).toHaveLength(0)
      expect(await component.acknowledgeCall(input)).toEqual({ unavailable: true })
      expect(await h.entries()).toEqual(before)
      expect(preparations).toBe(0)
      expect(await h.contentRows(ref.callId)).toBe(2)
    } finally {
      await component.close()
      await h.runtime.close()
      await h.host.close()
    }
  }, 30_000)

  it('unknown completion keeps the original writer until actual stop, including retry and close', async () => {
    const controlled = new ControlledSettlementOwner()
    const stopped = deferred<void>()
    const retryStop = deferred<void>()
    let submissions = 0
    let holding = false
    const owner: SettlementOwner = {
      name: controlled.name,
      admission: controlled.admission,
      opened: controlled.opened,
      unresolvedWrites: controlled.unresolvedWrites,
      acquire(limit) {
        const grant = controlled.acquire(limit)
        if (grant.registration === undefined) return grant
        const registration = grant.registration
        return {
          registration: {
            start(kind, operation) {
              const task = registration.start(kind, operation)
              return {
                ...task,
                requestStop() {
                  if (holding && kind === 'controlAppend') retryStop.resolve()
                  task.requestStop()
                },
              }
            },
            release: () => registration.release(),
          },
        }
      },
    }
    const h = await acknowledgementHost({
      owner,
      append:
        real =>
        async (...args) => {
          const isAck = isAcknowledgement(args[1][0]?.payload)
          const result = await real(...args)
          if (!isAck) return result
          submissions++
          holding = true
          controlled.stopBarrier = stopped.promise
          return { failure: 'unavailable' }
        },
    })
    const component = acknowledgementComponent(h.construction)
    h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
    try {
      await h.service.openCall(h.request('p5d_original_writer'))
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      const input = {
        ref,
        expectedResult: { kind: 'response' as const, response: dispatched.replyPending.id },
      }
      expect(await component.acknowledgeCall(input)).toEqual({ unavailable: true })
      const original = acknowledgements(await h.entries(), ref.callId)
      expect(original).toHaveLength(1)
      expect(controlled.active).toBe(1)
      const releases = controlled.releases
      let retryDone = false
      const projected = component.project({
        sessions: h.construction.sessions,
        callAccess: h.construction.callAccess,
        history: h.construction.history,
        lookup: h.construction.callFacts.lookup,
      })
      const retry = projected.acknowledgeCall(input).then(result => {
        retryDone = true
        return result
      })
      await retryStop.promise
      let closeDone = false
      const close = component.close().then(result => {
        closeDone = true
        return result
      })
      expect(retryDone).toBe(false)
      expect(closeDone).toBe(false)
      expect(controlled.releases).toBe(releases)
      expect(submissions).toBe(1)
      expect(await h.contentRows(ref.callId)).toBe(2)
      stopped.resolve()
      expect(await retry).toMatchObject({ acknowledged: { ref, cleanup: 'released' } })
      expect(await close).toEqual({ released: true })
      expect(controlled.active).toBe(0)
      expect(submissions).toBe(1)
      expect(acknowledgements(await h.entries(), ref.callId)).toEqual(original)
      expect(await h.contentRows(ref.callId)).toBe(0)
    } finally {
      stopped.resolve()
      await component.close()
      await h.runtime.close()
      await h.host.close()
    }
  }, 30_000)

  it('a fresh original ACK is recognized before a collision policy stop can withdraw', async () => {
    const trace: string[] = []
    let collided = false
    let withdrawals = 0
    const h = await acknowledgementHost({
      settlementContention: {
        name: 'p5d-stop-after-collision',
        limits: { submissions: 4, elapsedMs: 100000, retainedBytes: 1000000, concurrent: 2 },
        decide() {
          trace.push('decide')
          return { stop: true }
        },
      },
      content: real => ({
        ...real,
        async withdrawAcknowledgement(input) {
          withdrawals++
          return await real.withdrawAcknowledgement(input)
        },
      }),
      append:
        real =>
        async (...args) => {
          const isAck = isAcknowledgement(args[1][0]?.payload)
          if (!isAck || collided) return await real(...args)
          collided = true
          const competing = await real(...args)
          if ('failure' in competing) throw new Error('competing ACK did not land')
          return await real(...args)
        },
    })
    const component = acknowledgementComponent({
      ...h.construction,
      sessions: {
        async bind(session) {
          const bound = await h.construction.sessions.bind(session)
          if ('failure' in bound) return bound
          const original = bound.binding.log
          return {
            binding: {
              ...bound.binding,
              log: {
                ...original,
                async readPrefix() {
                  if (original.readPrefix === undefined) throw new Error('owned prefix missing')
                  if (trace.includes('decide')) trace.push('read')
                  return await original.readPrefix()
                },
              },
            },
          }
        },
      },
    })
    h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
    try {
      await h.service.openCall(h.request('p5d_collision_present'))
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      expect(
        await component.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: dispatched.replyPending.id },
        }),
      ).toMatchObject({ acknowledged: { ref, cleanup: 'released' } })
      expect(collided).toBe(true)
      expect(trace.slice(0, 2)).toEqual(['decide', 'read'])
      expect(trace.filter(item => item === 'decide')).toHaveLength(1)
      expect(withdrawals).toBe(0)
      expect(acknowledgements(await h.entries(), ref.callId)).toHaveLength(1)
      expect(await h.contentRows(ref.callId)).toBe(0)
    } finally {
      await component.close()
      await h.runtime.close()
      await h.host.close()
    }
  }, 30_000)

  it('a non-elapsed collision timer preserves the original branch without requesting its stop', async () => {
    let timerStops = 0
    let submissions = 0
    const h = await acknowledgementHost({
      settlementContention: {
        name: 'p5d-cancelled-collision-wait',
        limits: { submissions: 4, elapsedMs: 100000, retainedBytes: 1000000, concurrent: 2 },
        decide: () => ({ proceed: { waitMs: 1 } }),
      },
      settlementScheduler: {
        nowMonotonicMs: () => 0,
        wait: () => ({
          completion: Promise.resolve('cancelled'),
          stopped: Promise.resolve(),
          requestStop() {
            timerStops++
          },
        }),
      },
      append:
        real =>
        async (...args) => {
          if (!isAcknowledgement(args[1][0]?.payload)) return await real(...args)
          if (args[3].kind !== 'tailEquals') throw new Error('ACK tail condition missing')
          submissions++
          return { failure: 'tailChanged', tail: args[3].tail }
        },
    })
    const component = acknowledgementComponent(h.construction)
    h.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
    try {
      await h.service.openCall(h.request('p5d_cancelled_timer'))
      const ref = { session: h.host.session, callId: 'a22-call-1' }
      const dispatched = await h.service.dispatch(ref)
      if (!('replyPending' in dispatched)) throw new Error('ready reply')
      expect(
        await component.acknowledgeCall({
          ref,
          expectedResult: { kind: 'response', response: dispatched.replyPending.id },
        }),
      ).toEqual({ unavailable: true })
      expect(submissions).toBe(1)
      expect(timerStops).toBe(0)
      expect(acknowledgements(await h.entries(), ref.callId)).toHaveLength(0)
      expect(await h.contentRows(ref.callId)).toBe(2)
    } finally {
      await component.close()
      await h.runtime.close()
      await h.host.close()
    }
  }, 30_000)
})
