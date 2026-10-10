import { expect, vi } from 'vitest'
import type {
  CallAccess,
  AcquireCallResult,
  CallAccessEvidence,
  CallConsumer,
  CallPresenceFact,
  DispatchResult,
  ModelObserverEndpoint,
  ModelObserverRequest,
  ObserverReceiver,
  SessionRuntimeBinding,
} from '@omne-harness-lite/model-request-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { createRuntimeAcquire } from '../src/service-acquire.ts'
import { acknowledgementHost, kinds } from './acknowledgement-host-fixture.ts'
import { deferred } from './anchored-invocation-fixture.ts'

const otherSession = unwrap(parseOpaqueIdentifier('acquire-other-session', 'SessionRef'))

export const admissionCases = [
  'open-read',
  'open-wait',
  'missing-allowed',
  'missing-denied',
  'bind-invalid',
  'bind-unavailable',
  'bind-throw',
  'bind-session',
  'bind-generation',
  'first-unavailable',
  'first-throw',
  'first-origin',
  'latest-unavailable',
  'latest-missing',
  'latest-session',
  'latest-call',
  'latest-generation',
  'latest-origin',
  'access-unavailable',
  'access-throw',
  'evidence-action',
  'evidence-session',
  'evidence-call',
  'evidence-generation',
  'evidence-version',
  'evidence-revoked',
  'presence-missing',
  'presence-unknown',
  'presence-stopped',
  'presence-generation',
  'presence-progress',
  'presence-revoke',
  'access-late-revoke',
  'closed-read',
] as const
export type AdmissionCase = (typeof admissionCases)[number]

/** Actual SQL creation and durable facts; only trusted-port answers are fault-injected. */
export async function acquisitionScenario(fault: AdmissionCase, traceFields = false) {
  const world = await acknowledgementHost()
  const trace: string[] = []
  function watch<T extends object>(value: T, label: string): T {
    if (!traceFields) return value
    return new Proxy(value, {
      get(target, key, receiver) {
        trace.push('get:' + label + '.' + String(key))
        return Reflect.get(target, key, receiver)
      },
    })
  }
  const revoked = world.grant('owner', fault === 'missing-denied' ? [] : ['read', 'wait'])
  let consumer: CallConsumer | undefined
  let acquire: Pick<ReturnType<typeof createRuntimeAcquire>, 'acquireCall' | 'close'> | undefined
  let lookups = 0
  try {
    const opened = await world.service.openCall(world.request('acquire_' + fault))
    if (!('ref' in opened)) throw new Error('actual creation failed')
    const ref = fault.startsWith('missing-')
      ? { ...opened.ref, callId: 'missing-acquire' }
      : opened.ref
    const bound = await world.construction.sessions.bind(ref.session)
    if (!('binding' in bound)) throw new Error('actual binding failed')
    const binding: SessionRuntimeBinding = {
      ...bound.binding,
      log: {
        ...bound.binding.log,
        ...(fault === 'bind-session' ? { session: otherSession } : {}),
        ...(fault === 'bind-generation' ? { currentGeneration: () => ({}) } : {}),
      },
    }
    acquire = createRuntimeAcquire({
      ...world.construction,
      sessions: {
        async bind() {
          trace.push('bind')
          if (fault === 'bind-invalid') return { failure: 'invalidInput' as const }
          if (fault === 'bind-unavailable') return { failure: 'unavailable' as const }
          if (fault === 'bind-throw') throw new Error('binding failure')
          return { binding }
        },
      },
      callFacts: {
        ...world.construction.callFacts,
        async lookup(input) {
          lookups++
          trace.push('lookup:' + lookups)
          if (lookups === 1 && fault === 'first-unavailable') return { unavailable: true as const }
          if (lookups === 1 && fault === 'first-throw') throw new Error('facts failure')
          if (lookups === 2 && fault === 'latest-unavailable') return { unavailable: true as const }
          if (lookups === 2 && fault === 'latest-missing') return { callNotFound: true as const }
          const found = await world.construction.callFacts.lookup(input)
          if (!('view' in found)) return found
          if (lookups === 1 && fault === 'first-origin')
            return {
              view: { ...found.view, origin: { ...found.view.origin, session: otherSession } },
            }
          if (lookups !== 2) return { view: watch(found.view, 'first.view') }
          return {
            view: {
              ...found.view,
              ref:
                fault === 'latest-session'
                  ? { ...found.view.ref, session: otherSession }
                  : fault === 'latest-call'
                    ? { ...found.view.ref, callId: 'other-call' }
                    : found.view.ref,
              source:
                fault === 'latest-generation'
                  ? { ...found.view.source, generation: {} }
                  : found.view.source,
              origin:
                fault === 'latest-origin'
                  ? { ...found.view.origin, session: otherSession }
                  : found.view.origin,
            },
          }
        },
      },
      callAccess: {
        async check(input, admitted) {
          trace.push('access:' + input.action)
          if (fault === 'access-unavailable') return { unavailable: true as const }
          if (fault === 'access-throw') throw new Error('access failure')
          const result = await world.construction.callAccess.check(input, evidence => {
            const cancelled = new AbortController()
            cancelled.abort()
            const changed: CallAccessEvidence = {
              ...evidence,
              action: fault === 'evidence-action' ? 'ack' : evidence.action,
              ref:
                fault === 'evidence-session'
                  ? { ...evidence.ref, session: otherSession }
                  : fault === 'evidence-call'
                    ? { ...evidence.ref, callId: 'other-call' }
                    : evidence.ref,
              source:
                fault === 'evidence-generation'
                  ? { ...evidence.source, generation: {} }
                  : evidence.source,
              sourceVersion: fault === 'evidence-version' ? '' : evidence.sourceVersion,
              revoked: fault === 'evidence-revoked' ? cancelled.signal : evidence.revoked,
            }
            trace.push('admitted')
            return admitted(watch(changed, 'evidence'))
          })
          if (fault === 'access-late-revoke') revoked.abort()
          trace.push('access:return')
          return result
        },
      },
      callPresence: {
        read: (input, observed) => {
          trace.push('presence')
          return world.construction.callPresence.read(input, presence => {
            if (fault === 'presence-revoke') revoked.abort()
            const changed: CallPresenceFact =
              fault === 'presence-missing'
                ? { ...presence, kind: 'notFound' }
                : fault === 'presence-unknown'
                  ? { ...presence, kind: 'unknown' }
                  : fault === 'presence-stopped'
                    ? { ...presence, kind: 'stopped', target: null, unknownBatches: [] }
                    : {
                        ...presence,
                        source:
                          fault === 'presence-generation'
                            ? { ...presence.source, generation: {} }
                            : fault === 'presence-progress'
                              ? { ...presence.source, progress: -1 }
                              : presence.source,
                      }
            return observed(watch(changed, 'presence'))
          })
        },
      },
    })
    if (fault === 'closed-read') await acquire.close()
    const result = await acquire.acquireCall({ ref, mode: fault === 'open-wait' ? 'wait' : 'read' })
    if ('view' in result) consumer = result.consumer
    return {
      result,
      trace,
      lookups,
      frozenView: 'view' in result ? Object.isFrozen(result.view) : undefined,
      hasConsumer: 'view' in result && result.consumer !== undefined,
      sends: world.wire.sends(),
      durableKinds: kinds(await world.entries()),
    }
  } finally {
    consumer?.release()
    await consumer?.stopped
    await acquire?.close()
    await world.runtime.close()
    await world.host.close()
  }
}

/** Real live invocation and resource owner; explicit gates control physical reader/receiver stop. */
export async function liveAcquisition(
  receiver: ObserverReceiver,
  options: {
    readonly access?: (original: CallAccess) => CallAccess
    readonly observer?: 'no-authority' | 'authorize-refused' | 'open-refused'
  } = {},
) {
  const world = await acknowledgementHost()
  const entered = deferred<void>(),
    finish = deferred<void>()
  const originalRead = world.wire.adapter.read
  Object.assign(world.wire.adapter, {
    async *read(...args: Parameters<typeof originalRead>) {
      const iterator = originalRead(...args)
      while (true) {
        const step = await iterator.next()
        if (step.done) return step.value
        yield step.value
        if (step.value.t === 'fill') {
          entered.resolve()
          await finish.promise
        }
      }
    },
  })
  const endpoint: ModelObserverEndpoint = { open: () => receiver }
  const observer: ModelObserverRequest = {
    session: world.host.session,
    endpoint,
    observer_max_buffered_events: 10,
    observer_max_buffered_bytes: 100000,
  }
  const bound = await world.construction.sessions.bind(world.host.session)
  if (!('binding' in bound)) throw new Error('actual binding')
  let authorizationCloses = 0
  const binding: SessionRuntimeBinding = {
    ...bound.binding,
    ...(options.observer === 'no-authority'
      ? {}
      : {
          observers: {
            authorize() {
              if (options.observer === 'authorize-refused') return { unavailable: true as const }
              return {
                observer: {
                  check: () => ({ valid: true as const }),
                  open: target =>
                    options.observer === 'open-refused'
                      ? { unavailable: true as const }
                      : {
                          receiver: endpoint.open({
                            session: world.host.session,
                            tenant: binding.log.tenant,
                            target,
                          }),
                        },
                  close: async () => {
                    authorizationCloses++
                    return { released: true as const }
                  },
                },
              }
            },
          },
        }),
  }
  const acquire = createRuntimeAcquire({
    ...world.construction,
    sessions: { bind: async () => ({ binding }) },
    callAccess: options.access?.(world.construction.callAccess) ?? world.construction.callAccess,
  })
  const opened = await world.service.openCall(world.request('acquire_live'))
  if (!('ref' in opened)) throw new Error('actual creation')
  const ref = opened.ref
  const dispatching: Promise<DispatchResult> = world.service.dispatch(ref)
  await Promise.race([
    entered.promise,
    dispatching.then(result => {
      throw new Error('dispatch ended before barrier: ' + JSON.stringify(result))
    }),
  ])
  const revoked = world.grant('owner', ['read', 'wait'])
  const consumers = new Set<CallConsumer>()
  return {
    world,
    acquire,
    ref,
    observer,
    revoked,
    authorizationCloses: () => authorizationCloses,
    async obtain(): Promise<AcquireCallResult> {
      const result = await acquire.acquireCall({ ref, mode: 'wait', observer })
      if ('view' in result && result.consumer !== undefined) consumers.add(result.consumer)
      return result
    },
    async close() {
      finish.resolve()
      for (const consumer of consumers) consumer.release()
      await vi.waitFor(async () => expect(await acquire.close()).toEqual({ released: true }))
      await dispatching
      for (const consumer of consumers) await consumer.stopped
      await world.runtime.close()
      await world.host.close()
    },
  }
}
