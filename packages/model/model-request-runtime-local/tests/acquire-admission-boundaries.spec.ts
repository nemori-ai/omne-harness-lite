// @module-tag slow
// SQLite-backed facts and real consumers; authority and physical-stop faults are explicit.
import { describe, expect, it, vi } from 'vitest'
import type {
  CallAccessEvidence,
  ObserverReceiveTask,
  ObserverReceiver,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { createRuntimeAcquire } from '../src/service-acquire.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import {
  admissionCases,
  acquisitionScenario,
  liveAcquisition,
} from './acquire-admission-fixture.ts'
import { deferred } from './anchored-invocation-fixture.ts'

const visible = new Set([
  'open-read',
  'open-wait',
  'presence-unknown',
  'presence-stopped',
  'closed-read',
])

describe('actual acquisition authority and source boundaries', () => {
  it.each(admissionCases)(
    'preserves current admission and allocation boundary for %s',
    async fault => {
      const observed = await acquisitionScenario(fault)
      if (fault === 'bind-invalid')
        expect(observed.result).toEqual({ invalidInput: { reason: 'malformed' } })
      else if (fault === 'missing-allowed' || fault === 'latest-missing')
        expect(observed.result).toEqual({ callNotFound: true })
      else if (visible.has(fault)) {
        expect(observed.result).toHaveProperty('view')
        expect(observed.frozenView).toBe(true)
      } else expect(observed.result).toEqual({ unavailable: true })
      expect(observed.hasConsumer).toBe(false)
      expect(observed.sends).toBe(0)
      if (fault.startsWith('bind-')) expect(observed.trace).toEqual(['bind'])
      if (fault.startsWith('evidence-') || fault === 'missing-denied') {
        expect(observed.lookups).toBe(1)
        expect(observed.trace).not.toContain('presence')
      }
      if (fault.startsWith('latest-') || fault === 'first-origin')
        expect(observed.trace).not.toContain('presence')
    },
  )

  it('returns the acknowledged small branch for read and wait without presence or observer resources', async () => {
    const world = await acknowledgementHost()
    world.grant('owner', ['read', 'wait', 'settle', 'ack'])
    let acquire: Pick<ReturnType<typeof createRuntimeAcquire>, 'acquireCall' | 'close'> | undefined
    try {
      const opened = await world.service.openCall(world.request('acquire_ack_small'))
      if (!('ref' in opened)) throw new Error('actual creation')
      const dispatch = await world.service.dispatch(opened.ref)
      if (!('replyPending' in dispatch)) throw new Error('actual dispatch')
      const final = await world.service.settleReply({
        ...opened.ref,
        disposition: { vetoed: { by: 'acquire-small-view' } },
      })
      expect(final).toHaveProperty('state', 'complete')
      const acknowledged = await world.service.acknowledgeCall({
        ref: opened.ref,
        expectedResult: { kind: 'response', response: 'a22-response-1' },
      })
      expect(acknowledged).toHaveProperty('acknowledged')
      let presenceReads = 0
      acquire = createRuntimeAcquire({
        ...world.construction,
        callPresence: {
          read(input, observed) {
            presenceReads++
            return world.construction.callPresence.read(input, observed)
          },
        },
      })
      for (const mode of ['read', 'wait'] as const) {
        const observed = await acquire.acquireCall({ ref: opened.ref, mode })
        expect(observed).toHaveProperty('view.acknowledged')
        expect(observed).not.toHaveProperty('consumer')
        if (!('view' in observed)) throw new Error('small view')
        for (const key of ['presence', 'result', 'state', 'reply', 'route', 'raw'])
          expect(observed.view).not.toHaveProperty(key)
      }
      expect(presenceReads).toBe(0)
    } finally {
      await acquire?.close()
      await world.runtime.close()
      await world.host.close()
    }
  })
})

function receiver() {
  const globalStop = deferred<void>(),
    entered = deferred<void>(),
    taskStop = deferred<void>()
  const stoppedRequested = deferred<void>()
  const receive = vi.fn((): ObserverReceiveTask => {
    entered.resolve()
    return { completion: Promise.resolve(), stopped: taskStop.promise }
  })
  const original: ObserverReceiver = {
    receive,
    stop: () => stoppedRequested.resolve(),
    stopped: globalStop.promise,
  }
  return { original, receive, entered, taskStop, globalStop, stoppedRequested }
}

describe('actual observer admission and physical stop ownership', () => {
  it.each(['no-authority', 'authorize-refused', 'open-refused'] as const)(
    'refuses %s without taking a consumer',
    async observer => {
      const source = receiver()
      const h = await liveAcquisition(source.original, { observer })
      try {
        expect(await h.obtain()).toEqual({ unavailable: true })
        expect(source.receive).not.toHaveBeenCalled()
        expect(h.authorizationCloses()).toBe(observer === 'open-refused' ? 1 : 0)
      } finally {
        source.taskStop.resolve()
        source.globalStop.resolve()
        await h.close()
      }
    },
  )

  it.each(['action', 'session', 'call', 'generation', 'revoked'] as const)(
    'rejects stale fresh %s permission before actual receive',
    async fault => {
      const source = receiver(),
        freshEntered = deferred<void>()
      let hits = 0
      const h = await liveAcquisition(source.original, {
        access: original => ({
          check: (input, admitted) =>
            original.check(input, evidence => {
              if (++hits === 1) return admitted(evidence)
              freshEntered.resolve()
              const cancelled = new AbortController()
              cancelled.abort()
              const changed: CallAccessEvidence = {
                ...evidence,
                action: fault === 'action' ? 'read' : evidence.action,
                ref:
                  fault === 'session'
                    ? {
                        ...evidence.ref,
                        session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
                      }
                    : fault === 'call'
                      ? { ...evidence.ref, callId: 'other-call' }
                      : evidence.ref,
                source:
                  fault === 'generation' ? { ...evidence.source, generation: {} } : evidence.source,
                revoked: fault === 'revoked' ? cancelled.signal : evidence.revoked,
              }
              return admitted(changed)
            }),
        }),
      })
      try {
        const acquired = await h.obtain()
        expect(acquired).toHaveProperty('consumer')
        await freshEntered.promise
        expect(source.receive).not.toHaveBeenCalled()
      } finally {
        source.taskStop.resolve()
        source.globalStop.resolve()
        await h.close()
      }
    },
  )

  it.each(['throw', 'completion', 'stopped'] as const)(
    'holds receiver ownership after %s until its original global stop',
    async fault => {
      const source = receiver()
      const originalReceive = source.original.receive
      Object.assign(source.original, {
        receive(...args: Parameters<typeof originalReceive>) {
          source.entered.resolve()
          if (fault === 'throw') throw new Error('actual receiver exception')
          const task = { ...originalReceive(...args) }
          Reflect.set(task, fault, undefined)
          return task
        },
      })
      const h = await liveAcquisition(source.original)
      try {
        const acquired = await h.obtain()
        if (!('view' in acquired) || acquired.consumer === undefined)
          throw new Error('actual consumer')
        await source.entered.promise
        acquired.consumer.release()
        let stopped = false
        acquired.consumer.stopped.then(() => {
          stopped = true
        })
        expect(await h.acquire.close()).toEqual({ unavailable: true })
        expect(stopped).toBe(false)
        source.taskStop.resolve()
        source.globalStop.resolve()
        await vi.waitFor(async () => expect(await h.acquire.close()).toEqual({ released: true }))
        await acquired.consumer.stopped
        expect(stopped).toBe(true)
      } finally {
        source.taskStop.resolve()
        source.globalStop.resolve()
        await h.close()
      }
    },
  )

  it.each(['revoked', 'physical-close'] as const)(
    'drains an unexposed consumer after late %s before returning acquisition',
    async fault => {
      const source = receiver(),
        admitted = deferred<void>(),
        returnAuthority = deferred<void>()
      let checks = 0
      const h = await liveAcquisition(source.original, {
        access: original => ({
          async check(input, callback) {
            const outer = ++checks === 1
            const result = await original.check(input, callback)
            if (outer) {
              admitted.resolve()
              await returnAuthority.promise
            }
            return result
          },
        }),
      })
      let pending: ReturnType<typeof h.obtain> | undefined
      try {
        let returned = false
        pending = h.obtain().then(result => {
          returned = true
          return result
        })
        await admitted.promise
        await source.entered.promise
        if (fault === 'revoked') h.revoked.abort()
        else expect(await h.acquire.close()).toEqual({ unavailable: true })
        returnAuthority.resolve()
        await source.stoppedRequested.promise
        expect(returned).toBe(false)
        source.taskStop.resolve()
        source.globalStop.resolve()
        await vi.waitFor(async () => expect(await h.acquire.close()).toEqual({ released: true }))
        expect(await pending).toEqual(
          fault === 'revoked' ? { unavailable: true } : { runtimeStopped: true },
        )
        expect(returned).toBe(true)
      } finally {
        returnAuthority.resolve()
        source.taskStop.resolve()
        source.globalStop.resolve()
        await h.acquire.close()
        await pending
        await h.close()
      }
    },
  )
})
