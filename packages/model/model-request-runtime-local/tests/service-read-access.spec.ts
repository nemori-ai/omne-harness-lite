import { prepareAttemptFact } from './attempt-fact-fixture.ts'
// @module-tag slow
// Real SQLite/SQL journal runtime and tenant setup for current read-access regressions.
import { describe, expect, it, vi } from 'vitest'
import { getEventListeners } from 'node:events'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { dispatched } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { CallAccessEvidence } from '@omne-harness-lite/model-request-runtime'
import { createRuntimeReads } from '../src/service-reads.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { ControlledSettlementOwner, deferred } from './settlement-fixture.ts'

const missingRef = (session: Parameters<typeof parseOpaqueIdentifier>[0]) => ({
  session: unwrap(parseOpaqueIdentifier(session, 'SessionRef')),
  callId: 'read-access-missing',
})

describe('RT12 S-34/S-87/S-100 current read admission', () => {
  it('does not promote ack permission to ordinary or explicit history reads', async () => {
    const world = await acknowledgementHost({ readAccess: access => access })
    try {
      world.grant('owner', ['read', 'ack'])
      const opened = await world.service.openCall(world.request('read-access-revocation'))
      if (!('ref' in opened)) throw new Error('call creation failed')
      const ref = opened.ref
      expect(await world.service.readAttempts(ref)).toEqual({ state: 'open', dispatches: [] })
      const before = await world.entries()
      world.grant('owner', ['ack'])
      expect(await world.service.readAttempts(ref)).toEqual({ unavailable: true })
      expect(await world.service.readAttempts(ref, { consumeFailure: true })).toEqual({
        result: { unavailable: true },
        consumption: { kind: 'notApplicable' },
      })
      expect(await world.entries()).toEqual(before)
      world.grant('owner', ['read'])
      expect(await world.service.readAttempts(ref)).toEqual({ state: 'open', dispatches: [] })
    } finally {
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })

  it('checks current permission before revealing that a call does not exist', async () => {
    const world = await acknowledgementHost({ readAccess: access => access })
    try {
      const ref = { session: world.host.session, callId: 'read-access-missing' }
      const input = { ...ref, plan: { provider: 'test' } }
      world.grant('owner', ['read'])
      expect(await world.service.canDispatchAgain(input)).toEqual({ callNotFound: true })
      expect(await world.service.readAttempts(ref)).toEqual({ callNotFound: true })
      world.grant('owner', [])
      expect(await world.service.canDispatchAgain(input)).toEqual({ unavailable: true })
      expect(await world.service.readAttempts(ref)).toEqual({ unavailable: true })
    } finally {
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })

  it.each(['action', 'session', 'call', 'generation', 'version', 'revoked'] as const)(
    'refuses %s evidence before acquiring a history reader',
    async fault => {
      let hits = 0
      const owner = new ControlledSettlementOwner()
      const world = await acknowledgementHost({
        owner,
        readAccess: trusted => ({
          check: (input, admitted) =>
            trusted.check(input, evidence => {
              hits++
              const revoked = new AbortController()
              revoked.abort()
              const invalid: CallAccessEvidence = {
                ...evidence,
                action: fault === 'action' ? 'wait' : evidence.action,
                ref:
                  fault === 'session'
                    ? {
                        ...evidence.ref,
                        session: unwrap(parseOpaqueIdentifier('other', 'SessionRef')),
                      }
                    : fault === 'call'
                      ? { ...evidence.ref, callId: 'other' }
                      : evidence.ref,
                source:
                  fault === 'generation' ? { ...evidence.source, generation: {} } : evidence.source,
                sourceVersion: fault === 'version' ? '' : evidence.sourceVersion,
                revoked: fault === 'revoked' ? revoked.signal : evidence.revoked,
              }
              return admitted(invalid)
            }),
        }),
      })
      try {
        world.grant('owner', ['read'])
        const ref = missingRef(world.host.session)
        const before = await world.entries()
        const starts = owner.starts.length
        expect(await world.service.readAttempts(ref)).toEqual({ unavailable: true })
        expect(await world.service.readAttempts(ref, { consumeFailure: true })).toEqual({
          result: { unavailable: true },
          consumption: { kind: 'notApplicable' },
        })
        expect(
          await world.service.canDispatchAgain({ ...ref, plan: { provider: 'test' } }),
        ).toEqual({ unavailable: true })
        expect(hits).toBe(3)
        expect(owner.starts.length).toBe(starts)
        expect(world.wire.sends()).toBe(0)
        expect(await world.entries()).toEqual(before)
      } finally {
        expect(await world.runtime.close()).toEqual({ released: true })
        await world.host.close()
      }
    },
  )

  it.each(['unavailable', 'throw'] as const)('fails closed when authority is %s', async fault => {
    let hits = 0
    const world = await acknowledgementHost({
      readAccess: () => ({
        async check() {
          hits++
          if (fault === 'throw') throw new Error('read authority unavailable')
          return { unavailable: true }
        },
      }),
    })
    try {
      const ref = missingRef(world.host.session)
      expect(await world.service.readAttempts(ref)).toEqual({ unavailable: true })
      expect(await world.service.canDispatchAgain({ ...ref, plan: { provider: 'test' } })).toEqual({
        unavailable: true,
      })
      expect(hits).toBe(2)
      expect(world.wire.sends()).toBe(0)
    } finally {
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })

  it('rechecks revocation when the admitted read has finished but authority has not returned', async () => {
    let revoke = () => {}
    let hits = 0
    const world = await acknowledgementHost({
      readAccess: trusted => ({
        check: (input, admitted) =>
          trusted.check(input, async evidence => {
            const result = await admitted(evidence)
            hits++
            revoke()
            return result
          }),
      }),
    })
    try {
      const grant = world.grant('owner', ['read'])
      revoke = () => grant.abort()
      expect(await world.service.readAttempts(missingRef(world.host.session))).toEqual({
        unavailable: true,
      })
      expect(hits).toBe(1)
    } finally {
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })

  it('standalone close waits for an in-flight authorization and rejects its late callback', async () => {
    const entered = deferred<void>()
    const resume = deferred<void>()
    const world = await acknowledgementHost({
      readAccess: trusted => ({
        async check(input, admitted) {
          entered.resolve()
          await resume.promise
          return await trusted.check(input, admitted)
        },
      }),
    })
    const reads = createRuntimeReads(world.construction)
    try {
      world.grant('owner', ['read'])
      const reading = reads.methods.readAttempts(missingRef(world.host.session))
      await entered.promise
      let closed = false
      const closing = reads.close().then(result => {
        closed = true
        return result
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      resume.resolve()
      expect(await reading).toEqual({ unavailable: true })
      expect(await closing).toEqual({ released: true })
    } finally {
      resume.resolve()
      await reads.close()
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })

  it.each(['ready', 'ack'] as const)(
    'holds admission through the asynchronous %s view and suppresses a revoked result',
    async branch => {
      const owner = new ControlledSettlementOwner()
      const entered = deferred<void>()
      const resume = deferred<void>()
      let armed = false
      let insideAdmission = false
      let hits = 0
      const world = await acknowledgementHost({
        owner,
        readAccess: trusted => ({
          check: (input, admitted) =>
            trusted.check(input, async evidence => {
              insideAdmission = true
              try {
                return await admitted(evidence)
              } finally {
                insideAdmission = false
              }
            }),
        }),
        content: store => ({
          ...store,
          async read(input) {
            const result = await store.read(input)
            if (
              armed &&
              branch === 'ready' &&
              'content' in result &&
              result.content.kind === 'reply_ready'
            ) {
              hits++
              expect(insideAdmission).toBe(true)
              expect(owner.active).toBe(0)
              entered.resolve()
              await resume.promise
            }
            return result
          },
          async confirmAcknowledgement(input) {
            const result = await store.confirmAcknowledgement(input)
            if (armed && branch === 'ack') {
              hits++
              expect(insideAdmission).toBe(true)
              expect(owner.active).toBe(0)
              entered.resolve()
              await resume.promise
            }
            return result
          },
        }),
      })
      try {
        const grant = world.grant('owner', ['read', 'ack'])
        const opened = await world.service.openCall(world.request(`async-${branch}`))
        if (!('ref' in opened)) throw new Error('call creation failed')
        const dispatched = await world.service.dispatch(opened.ref)
        if (!('replyPending' in dispatched)) throw new Error('ready response missing')
        if (branch === 'ack') {
          expect(
            await world.service.acknowledgeCall({
              ref: opened.ref,
              expectedResult: { kind: 'response', response: dispatched.replyPending.id },
            }),
          ).toHaveProperty('acknowledged')
          expect(await world.service.readAttempts(opened.ref)).toHaveProperty('acknowledged')
        } else {
          expect(await world.service.readAttempts(opened.ref)).toHaveProperty('state', 'complete')
        }
        const before = await world.entries()
        const sends = world.wire.sends()
        armed = true
        const reading = world.service.readAttempts(opened.ref, { consumeFailure: true })
        await entered.promise
        grant.abort()
        expect(insideAdmission).toBe(true)
        resume.resolve()
        expect(await reading).toEqual({
          result: { unavailable: true },
          consumption: { kind: 'notApplicable' },
        })
        expect(hits).toBe(1)
        expect(insideAdmission).toBe(false)
        expect(world.wire.sends()).toBe(sends)
        expect(await world.entries()).toEqual(before)
      } finally {
        armed = false
        resume.resolve()
        expect(await world.runtime.close()).toEqual({ released: true })
        await world.host.close()
      }
    },
  )
  it.each(['native', 'before', 'after'] as const)(
    'releases an undelivered failure source when listener registration fails %s installation',
    async timing => {
      const world = await acknowledgementHost({ readAccess: access => access })
      const grant = world.grant('owner', ['read'])
      const ref = { session: world.host.session, callId: 'listener-failure-call' }
      const run = 'listener-failure-run'
      const at = '2026-09-29T00:00:00Z'
      const shell = { tenant: world.host.tenant, run, attempt: 1 }
      async function append(category: 'message' | 'record' | 'response', value: unknown) {
        const captured = captureModelLogValue({ category, input: { kind: 'value', value } })
        if (!('ok' in captured)) throw new Error('listener fixture capture failed')
        const prepared = prepareModelLogEntry({
          session: ref.session,
          shell,
          captured: captured.ok,
          purpose: { kind: category },
          messagePrefix: [],
        })
        if (!('ok' in prepared)) throw new Error('listener fixture entry failed')
        const appended = await world.host.log.append(
          ref.session,
          [prepared.ok],
          category === 'response' ? { kind: 'unfenced' } : { kind: 'fenced', run, attempt: 1 },
          { kind: 'unconditional' },
        )
        expect(appended).toHaveProperty('positions')
      }
      const reads = createRuntimeReads({
        ...world.construction,
        history: {
          ...world.construction.history,
          failure(prefix, callId) {
            const history = interpretCallHistory({ prefix, callId })
            if (!('known' in history)) return { unavailable: true }
            const records = history.known.dispatches.map(item => item.record)
            const original = records[0]
            if (original === undefined) return { unavailable: true }
            return {
              subject: {
                failure: 'upstream_unavailable',
                statusCode: 503,
                profile: original.profileSnapshot,
                dispatches: [original, ...records.slice(1)] as const,
                retryConclusions: [],
              },
            }
          },
        },
      })
      const nativeAdd = grant.signal.addEventListener.bind(grant.signal)
      const add = vi.spyOn(grant.signal, 'addEventListener').mockImplementation((...args) => {
        if (timing === 'before') throw new Error('listener registration before native install')
        nativeAdd(...args)
        if (timing === 'after') throw new Error('listener registration after native install')
      })
      const remove = vi.spyOn(grant.signal, 'removeEventListener')
      try {
        await world.host.log.append(
          ref.session,
          [
            prepareAttemptFact({
              session: ref.session,
              shell,
              key: 'listener-attempt-start',
              reason: 'first',
              at: at,
            }).ok,
          ],
          { kind: 'fenced', run, attempt: 1 },
          { kind: 'unconditional' },
        )
        await append('record', { ...dispatched, call: ref.callId, response: 'listener-response' })
        const { reply: _reply, replyDisposition: _disposition, ...body } = responseV5
        await append('response', {
          ...body,
          id: 'listener-response',
          call: { callId: ref.callId, runId: run },
          attemptId: 1,
          outcome: 'failed',
          failure: { cause: 'upstream_unavailable', statusCode: 503 },
          timing: { sentAt: at, endedAt: at },
        })
        const answer = await reads.methods.readAttempts(ref, { consumeFailure: true })
        expect(add).toHaveBeenCalledTimes(1)
        if (timing === 'native') {
          if (!('consumption' in answer) || answer.consumption.kind !== 'failure')
            throw new Error('real failure source missing')
          expect(answer.result).toHaveProperty('state', 'awaiting_decision')
          expect(getEventListeners(grant.signal, 'abort')).toHaveLength(1)
          const source = answer.consumption.source
          expect(source.verify(source.subject, { run, attempt: 1 })).toHaveProperty(
            'authoritativeSubject',
          )
          source.release()
        } else {
          expect(answer).toEqual({
            result: { unavailable: true },
            consumption: { kind: 'notApplicable' },
          })
        }
        expect(getEventListeners(grant.signal, 'abort')).toHaveLength(0)
        expect(remove).toHaveBeenCalledTimes(1)
        expect(await reads.close()).toEqual({ released: true })
        expect(remove).toHaveBeenCalledTimes(1)
      } finally {
        await reads.close()
        add.mockRestore()
        remove.mockRestore()
        expect(await world.runtime.close()).toEqual({ released: true })
        await world.host.close()
      }
    },
  )
})
