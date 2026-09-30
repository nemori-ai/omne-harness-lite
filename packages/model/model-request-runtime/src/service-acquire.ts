import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { createIndependentCallConsumer } from './reference-consumer.ts'
import { createModelObserverQueue } from './service-observer-queue.ts'
import { settlementGenerationCurrent } from './settlement-prefix.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import type {
  AcquireCallInput,
  AcquireCallResult,
  RetainedCallReadView,
  CallConsumer,
} from './reference-types.ts'
import type {
  RuntimeConstruction,
  RuntimeCloseResult,
  ModelObserverRequest,
  ModelObserverQueue,
  AuthorizedCallObserver,
  ObserverReceiver,
} from './service-types.ts'
import type { PlannedSemantics } from './types.ts'

const unavailable = Object.freeze({ unavailable: true } as const)
const malformed = Object.freeze({ invalidInput: { reason: 'malformed' } } as const)
function ownInput(input: AcquireCallInput): AcquireCallInput | typeof malformed {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.ref === null ||
    typeof input.ref !== 'object' ||
    Array.isArray(input.ref) ||
    Object.keys(input.ref).length !== 2 ||
    !Object.hasOwn(input.ref, 'session') ||
    !Object.hasOwn(input.ref, 'callId')
  )
    return malformed
  const session = parseOpaqueIdentifier(input.ref.session, 'SessionRef')
  const call = parseOpaqueIdentifier(input.ref.callId, 'ModelCallId')
  if (
    !('ok' in session) ||
    !('ok' in call) ||
    (input.mode !== 'read' && input.mode !== 'wait') ||
    (input.mode === 'read' && input.observer !== undefined)
  )
    return malformed
  let observer: ModelObserverRequest | undefined
  if (input.observer !== undefined) {
    const value = input.observer
    if (
      value === null ||
      typeof value !== 'object' ||
      value.session !== session.ok ||
      value.endpoint === null ||
      typeof value.endpoint !== 'object' ||
      typeof value.endpoint.open !== 'function' ||
      ![value.observer_max_buffered_events, value.observer_max_buffered_bytes].every(
        n => isNonNegativeJsonInteger(n) && ExactDecimal.from(n).compare(ExactDecimal.from(0)) > 0,
      )
    )
      return malformed
    const endpoint = value.endpoint
    const open = endpoint.open
    observer = Object.freeze({
      session: session.ok,
      endpoint: Object.freeze({
        open: (scope: Parameters<typeof open>[0]) => open.call(endpoint, scope),
      }),
      observer_max_buffered_events: value.observer_max_buffered_events,
      observer_max_buffered_bytes: value.observer_max_buffered_bytes,
    })
  }
  return Object.freeze({
    ref: Object.freeze({ session: session.ok, callId: call.ok }),
    mode: input.mode,
    ...(observer === undefined ? {} : { observer }),
  })
}

/** All attachment is inside trusted presence admission; no model task is owned by a consumer. */
export function createRuntimeAcquire<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): {
  readonly acquireCall: (input: AcquireCallInput) => Promise<AcquireCallResult>
  readonly close: () => Promise<RuntimeCloseResult>
} {
  if (
    typeof runtime.callAccess?.check !== 'function' ||
    typeof runtime.callPresence?.read !== 'function' ||
    typeof runtime.callFacts?.lookup !== 'function' ||
    typeof runtime.callFacts.creation !== 'function' ||
    typeof runtime.callFacts.refresh !== 'function' ||
    typeof runtime.callFacts.close !== 'function' ||
    typeof runtime.callFacts.content?.put !== 'function' ||
    typeof runtime.callFacts.content.read !== 'function' ||
    typeof runtime.callFacts.content.close !== 'function'
  )
    throw new TypeError('trusted access, original presence and durable call facts required')
  const resources = new Set<{ readonly close: () => Promise<RuntimeCloseResult> }>()
  let closed = false
  async function acquireCall(input: AcquireCallInput): Promise<AcquireCallResult> {
    const inspected = ownInput(input)
    if ('invalidInput' in inspected) return inspected
    const owned = inspected
    try {
      const bound = await runtime.sessions.bind(owned.ref.session)
      if ('failure' in bound) return bound.failure === 'invalidInput' ? malformed : unavailable
      const binding = bound.binding.log
      if (binding.session !== owned.ref.session || !settlementGenerationCurrent(binding))
        return unavailable
      const first = await runtime.callFacts.lookup({ binding, ref: owned.ref })
      if (!('view' in first) && !('callNotFound' in first)) return unavailable
      const admitted = await runtime.callAccess.check(
        {
          binding,
          ref: owned.ref,
          action: owned.mode,
          ...('view' in first ? { origin: first.view.origin } : {}),
        },
        async evidence => {
          function current(): boolean {
            return (
              evidence.action === owned.mode &&
              evidence.ref.session === owned.ref.session &&
              evidence.ref.callId === owned.ref.callId &&
              evidence.source.generation === binding.generation &&
              typeof evidence.sourceVersion === 'string' &&
              evidence.sourceVersion.length > 0 &&
              !evidence.revoked.aborted &&
              settlementGenerationCurrent(binding)
            )
          }
          if (!current()) return unavailable
          const latest = await runtime.callFacts.lookup({ binding, ref: owned.ref })
          if (!('view' in latest)) return current() ? latest : unavailable
          if (!('view' in first)) return unavailable
          const view = latest.view
          // The RT12 S-97 branch is not projected by lookup yet; fail closed rather than read.
          if (view.acknowledged !== undefined || first.view.acknowledged !== undefined)
            return unavailable
          if (
            view.ref.session !== owned.ref.session ||
            view.ref.callId !== owned.ref.callId ||
            view.origin.session !== binding.session ||
            !tenantIdEquals(view.origin.tenant, binding.tenant) ||
            view.source.generation !== binding.generation ||
            ('view' in first &&
              (first.view.origin.session !== view.origin.session ||
                !tenantIdEquals(first.view.origin.tenant, view.origin.tenant) ||
                first.view.origin.run !== view.origin.run ||
                (first.view.origin.attempt === undefined) !== (view.origin.attempt === undefined) ||
                (first.view.origin.attempt !== undefined &&
                  view.origin.attempt !== undefined &&
                  ExactDecimal.from(first.view.origin.attempt).compare(
                    ExactDecimal.from(view.origin.attempt),
                  ) !== 0)))
          )
            return unavailable
          const observed = await runtime.callPresence.read(
            {
              ref: owned.ref,
              origin: view.origin,
              source: view.source,
              executionGeneration: view.presence.executionGeneration,
            },
            async presence => {
              if (
                !current() ||
                presence.kind === 'notFound' ||
                presence.source.generation !== view.source.generation ||
                ExactDecimal.from(presence.source.progress).compare(
                  ExactDecimal.from(view.source.progress),
                ) !== 0
              )
                return unavailable
              const actual: RetainedCallReadView = Object.freeze({ ...view, presence })
              if (
                owned.mode === 'read' ||
                actual.result !== undefined ||
                actual.state === 'open' ||
                presence.kind !== 'live'
              )
                return { view: actual }
              if (closed) return { runtimeStopped: true as const }
              const container = runtime.calls.find(owned.ref)
              const local = container?.view()
              if (
                container === undefined ||
                local === undefined ||
                presence.executionGeneration !== view.presence.executionGeneration ||
                local.executionGeneration !== presence.executionGeneration ||
                local.session.log.generation !== binding.generation ||
                !tenantIdEquals(local.session.log.tenant, binding.tenant)
              )
                return unavailable
              let queue: ModelObserverQueue | undefined
              let authorization: AuthorizedCallObserver | undefined
              let consumer: CallConsumer | undefined
              let unregister: (() => void) | undefined
              let closing: Promise<RuntimeCloseResult> | undefined
              const entry = {
                close(): Promise<RuntimeCloseResult> {
                  if (closing !== undefined) return closing
                  closing = Promise.resolve()
                    .then(async () => {
                      consumer?.release()
                      const actualQueue = queue
                      const actualAuthorization = authorization
                      const outcomes = await Promise.allSettled([
                        ...(actualQueue === undefined
                          ? []
                          : [Promise.resolve().then(() => actualQueue.close())]),
                        ...(actualAuthorization === undefined
                          ? []
                          : [Promise.resolve().then(() => actualAuthorization.close())]),
                      ])
                      if (
                        !outcomes.every(
                          result => result.status === 'fulfilled' && 'released' in result.value,
                        )
                      )
                        return unavailable
                      await consumer?.stopped
                      unregister?.()
                      unregister = undefined
                      resources.delete(entry)
                      return { released: true as const }
                    })
                    .catch(() => unavailable)
                    .finally(() => {
                      closing = undefined
                    })
                  return closing
                },
              }
              resources.add(entry)
              const retained = local.request.host.register(entry.close)
              if (!('registration' in retained)) {
                await entry.close()
                return retained
              }
              unregister = retained.registration.unregister
              try {
                if (owned.observer !== undefined) {
                  if (
                    local.operation.phase !== 'dispatching' ||
                    local.invocation === undefined ||
                    bound.binding.observers === undefined
                  ) {
                    await entry.close()
                    return unavailable
                  }
                  const authorized = bound.binding.observers.authorize({
                    request: owned.observer,
                    session: owned.ref.session,
                    tenant: binding.tenant,
                    callId: owned.ref.callId,
                  })
                  if (!('observer' in authorized)) {
                    await entry.close()
                    return unavailable
                  }
                  authorization = authorized.observer
                  const target = local.operation.target
                  const opened = authorization.open(target)
                  if (!('receiver' in opened)) {
                    await entry.close()
                    return unavailable
                  }
                  const originalReceiver = opened.receiver
                  const receiver: ObserverReceiver = {
                    stop: () => originalReceiver.stop(),
                    stopped: originalReceiver.stopped,
                    receive(serialized, signal) {
                      let attempted = false
                      let actuallyStopped = false
                      const completion = runtime.callAccess
                        .check(
                          { binding, ref: owned.ref, action: 'wait', origin: actual.origin },
                          async fresh => {
                            if (
                              !current() ||
                              fresh.action !== 'wait' ||
                              fresh.ref.session !== owned.ref.session ||
                              fresh.ref.callId !== owned.ref.callId ||
                              fresh.source.generation !== binding.generation ||
                              fresh.revoked.aborted ||
                              signal.aborted
                            )
                              return 'unavailable' as const
                            attempted = true
                            const task = originalReceiver.receive(
                              serialized,
                              AbortSignal.any([signal, fresh.revoked, evidence.revoked]),
                            )
                            if (
                              !(task?.completion instanceof Promise) ||
                              !(task.stopped instanceof Promise)
                            )
                              throw new TypeError('observer receive lacks actual stop proof')
                            try {
                              await task.completion
                            } finally {
                              await task.stopped
                              actuallyStopped = true
                            }
                            return 'delivered' as const
                          },
                        )
                        .then(result => {
                          if (!('allowed' in result) || result.allowed !== 'delivered')
                            throw new Error('observer access unavailable')
                        })
                      const stopped = completion.then(
                        () => undefined,
                        async () => {
                          // A throwing/bad provider may have begun receiving: require its real global stop.
                          if (attempted && !actuallyStopped) await originalReceiver.stopped
                        },
                      )
                      return { completion, stopped }
                    },
                  }
                  queue = createModelObserverQueue({
                    scope: { session: owned.ref.session, tenant: binding.tenant, target },
                    authorization,
                    receiver,
                    maxBufferedEvents: owned.observer.observer_max_buffered_events,
                    maxBufferedBytes: owned.observer.observer_max_buffered_bytes,
                    diagnostic: event => {
                      try {
                        drainDiagnosticThenable(
                          runtime.policy.diagnostic({
                            kind: 'model_observer.delivery',
                            detail: {
                              stage: event.stage,
                              reason: event.reason,
                              callId: event.callId,
                              dispatch: event.dispatch,
                            },
                          }),
                        )
                      } catch {
                        /* Diagnostic failure does not authorize delivery. */
                      }
                    },
                  })
                }
                const original = local.executionGeneration
                consumer = createIndependentCallConsumer({
                  container,
                  revoked: evidence.revoked,
                  valid: () =>
                    current() &&
                    runtime.calls.find(owned.ref)?.view().executionGeneration === original,
                  read: async () => {
                    const read = await acquireCall({ ref: owned.ref, mode: 'read' })
                    return 'view' in read ? { view: read.view } : unavailable
                  },
                  ...(queue === undefined || local.invocation === undefined
                    ? {}
                    : { queue, initialSnapshot: local.invocation.snapshot() }),
                  onStopped: () => {
                    // This original entry retains the cleanup promise; failed cleanup remains retryable.
                    entry.close()
                  },
                })
                if (!current()) {
                  await entry.close()
                  return unavailable
                }
                return { view: actual, consumer }
              } catch {
                await entry.close()
                return unavailable
              }
            },
          )
          return 'read' in observed && current() ? observed.read : unavailable
        },
      )
      if ('allowed' in admitted) {
        if (!settlementGenerationCurrent(binding) || admitted.evidence.revoked.aborted) {
          if ('view' in admitted.allowed) admitted.allowed.consumer?.release()
          return unavailable
        }
        if ('view' in admitted.allowed && admitted.allowed.consumer !== undefined && closed) {
          admitted.allowed.consumer.release()
          return { runtimeStopped: true }
        }
        return admitted.allowed
      }
      return 'invalidInput' in admitted ? admitted : unavailable
    } catch {
      return unavailable
    }
  }
  return Object.freeze({
    acquireCall,
    async close() {
      closed = true
      const outcomes = await Promise.allSettled([...resources].map(resource => resource.close()))
      return resources.size === 0 &&
        outcomes.every(result => result.status === 'fulfilled' && 'released' in result.value)
        ? { released: true as const }
        : unavailable
    },
  })
}
