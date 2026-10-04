import { tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import type { ModelCallId } from '@omne-harness-lite/call-accounts'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  AuthorizedCallObserver,
  ModelArrivalTarget,
  ModelObserverEndpoint,
  ObserverReceiver,
  RuntimeCloseResult,
  SessionObserverAccess,
} from '@omne-harness-lite/model-request-runtime-local'

interface EndpointGrant {
  readonly endpoint: ModelObserverEndpoint
  readonly session: SessionRef
  readonly tenant: TenantId
  readonly callId?: ModelCallId
  target?: ModelArrivalTarget
  readonly current: () => boolean
  readonly receivers: Set<ObserverReceiver>
  valid: boolean
}

/** The trusted session entry creates a grant only after actor and held-session checks. */
export function createDemoObserverAccess(): {
  readonly access: SessionObserverAccess
  readonly grant: (input: {
    readonly endpoint: ModelObserverEndpoint
    readonly session: SessionRef
    readonly tenant: TenantId
    readonly callId?: ModelCallId
    readonly current: () => boolean
  }) => { readonly revoke: () => Promise<RuntimeCloseResult> }
} {
  const grants = new WeakMap<ModelObserverEndpoint, EndpointGrant>()
  const unavailable = { unavailable: true } as const
  const mismatch = { invalidInput: { reason: 'observer_scope_mismatch' } } as const

  function closeGrant(grant: EndpointGrant): Promise<RuntimeCloseResult> {
    grant.valid = false
    for (const receiver of grant.receivers) {
      try {
        receiver.stop()
      } catch {
        // The failed receiver remains owned for a later close attempt.
      }
    }
    return Promise.resolve(grant.receivers.size === 0 ? { released: true } : unavailable)
  }

  const access: SessionObserverAccess = {
    authorize({ request, session, tenant, callId }) {
      const grant = grants.get(request.endpoint)
      if (grant === undefined) return unavailable
      if (
        request.session !== session ||
        grant.session !== session ||
        !tenantIdEquals(grant.tenant, tenant) ||
        (grant.callId !== undefined && grant.callId !== callId) ||
        (grant.target !== undefined && grant.target.callId !== callId)
      )
        return mismatch
      if (!grant.valid || !grant.current()) return unavailable
      const authorizedCallId = callId
      const observer: AuthorizedCallObserver = {
        check(target) {
          if (target.kind !== 'model_call' || target.callId !== authorizedCallId) return mismatch
          if (!grant.valid || !grant.current()) return unavailable
          if (grant.target === undefined) grant.target = target
          else if (
            grant.target.callId !== target.callId ||
            String(grant.target.dispatch) !== String(target.dispatch)
          )
            return mismatch
          return { valid: true }
        },
        open(target) {
          const checked = observer.check(target)
          if (!('valid' in checked)) return checked
          let receiver: ObserverReceiver
          try {
            receiver = grant.endpoint.open({
              session: grant.session,
              tenant: grant.tenant,
              target,
            })
          } catch {
            return unavailable
          }
          grant.receivers.add(receiver)
          void receiver.stopped.then(
            () => grant.receivers.delete(receiver),
            () => {},
          )
          const rechecked = observer.check(target)
          if (!('valid' in rechecked)) {
            receiver.stop()
            return rechecked
          }
          return { receiver }
        },
        close: () => closeGrant(grant),
      }
      return { observer }
    },
  }

  return {
    access,
    grant(input) {
      if (grants.has(input.endpoint)) throw new TypeError('observer endpoint already bound')
      const grant: EndpointGrant = { ...input, receivers: new Set(), valid: true }
      grants.set(input.endpoint, grant)
      return { revoke: () => closeGrant(grant) }
    },
  }
}

/** A receiver reports actual completion of the supplied sink, including terminal write callbacks. */
export function createDemoObserverEndpoint(
  consume: (serialized: string, signal: AbortSignal) => Promise<void>,
): ModelObserverEndpoint {
  return {
    open() {
      const controller = new AbortController()
      const active = new Set<Promise<void>>()
      let stopping = false
      let finishStopped = () => {}
      const stopped = new Promise<void>(resolve => {
        finishStopped = resolve
      })
      function finishIfStopped() {
        if (stopping && active.size === 0) finishStopped()
      }
      const receiver: ObserverReceiver = {
        receive(serialized, signal) {
          if (stopping) {
            const failure = Promise.reject(new Error('observer receiver stopped'))
            return { completion: failure, stopped: failure.catch(() => {}) }
          }
          const joined = AbortSignal.any([signal, controller.signal])
          const completion = Promise.resolve().then(() => consume(serialized, joined))
          const actualStopped = completion.then(
            () => {},
            () => {},
          )
          active.add(actualStopped)
          void actualStopped.then(() => {
            active.delete(actualStopped)
            finishIfStopped()
          })
          return { completion, stopped: actualStopped }
        },
        stop() {
          if (!stopping) {
            stopping = true
            controller.abort()
          }
          finishIfStopped()
        },
        stopped,
      }
      return receiver
    },
  }
}
