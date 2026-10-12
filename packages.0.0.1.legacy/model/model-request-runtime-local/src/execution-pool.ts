import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import type {
  ModelExecutionObservation,
  ModelExecutionRef,
  ModelExecutionRequest,
  ModelInvocationHandle,
  ModelPoolInstance,
  PlannedSemantics,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime'
import { invokeModel } from './invoke.ts'

type SessionScope = Pick<ModelExecutionRef, 'tenant' | 'session'>
interface Entry {
  readonly ref: ModelExecutionRef
  state: ModelExecutionObservation['state']
  readonly abort: () => void
  readonly stopped: Promise<void>
}
function ownScope(value: SessionScope): SessionScope | undefined {
  const tenant = parseTenantId(value?.tenant)
  const session = parseOpaqueIdentifier(value?.session, 'SessionRef')
  if (!('ok' in tenant) || !('ok' in session)) return undefined
  return Object.freeze({ tenant: Object.freeze(tenant.ok), session: session.ok })
}
function ownRef(value: ModelExecutionRef): ModelExecutionRef | undefined {
  const scope = ownScope(value)
  const call = parseOpaqueIdentifier(value?.callId, 'ModelCallId')
  const dispatchValue = value?.dispatch
  if (!scope || !('ok' in call) || !isNonNegativeJsonInteger(dispatchValue)) return undefined
  const dispatch = ExactDecimal.from(dispatchValue)
  if (dispatch.compare(ExactDecimal.from(0)) <= 0) return undefined
  return Object.freeze({ ...scope, callId: call.ok, dispatch: dispatchValue })
}
function keyOf(ref: ModelExecutionRef): string {
  return JSON.stringify([
    ref.tenant.organization,
    ref.tenant.account,
    ref.session,
    ref.callId,
    ExactDecimal.from(ref.dispatch).toCanonicalString(),
  ])
}
function matchesTarget<P extends PlannedSemantics, R>(
  input: ModelExecutionRequest<P, R>['input'],
  ref: ModelExecutionRef,
): boolean {
  const target = input?.target
  return (
    target?.kind === 'model_call' &&
    target.callId === ref.callId &&
    isNonNegativeJsonInteger(target.dispatch) &&
    ExactDecimal.from(target.dispatch).compare(ExactDecimal.from(ref.dispatch)) === 0
  )
}

export function createModelExecutionPool(): ModelPoolInstance {
  const entries = new Map<string, Entry>()
  let admissionClosed = false
  let closing: Promise<RuntimeCloseResult> | undefined

  function execute<P extends PlannedSemantics, R>(request: ModelExecutionRequest<P, R>) {
    if (admissionClosed) return { rejected: 'closed' } as const
    const ref = ownRef(request?.ref)
    const supplied = request?.input
    if (!ref || !matchesTarget(supplied, ref)) return { rejected: 'invalidInput' } as const
    const input = {
      ...supplied,
      target: { kind: 'model_call' as const, callId: ref.callId, dispatch: ref.dispatch },
    }
    const key = keyOf(ref)
    if (admissionClosed) return { rejected: 'closed' } as const
    if (entries.has(key)) return { rejected: 'duplicateActive' } as const
    const stop = Promise.withResolvers<void>()
    void stop.promise.catch(() => {})
    let invocation: ModelInvocationHandle | undefined
    let abortRequested = false
    const entry: Entry = {
      ref,
      state: 'active',
      stopped: stop.promise,
      abort: () => {
        abortRequested = true
        invocation?.abort()
      },
    }
    entries.set(key, entry)
    const stopFailed = (error: unknown) => {
      entry.state = 'stopUnconfirmed'
      stop.reject(error)
    }
    try {
      invocation = invokeModel(input)
      void invocation.stopped.then(() => {
        entries.delete(key)
        stop.resolve()
      }, stopFailed)
      if (abortRequested) invocation.abort()
      return { invocation }
    } catch (error) {
      stopFailed(error)
      throw error
    }
  }
  function closeAdmission(): void {
    admissionClosed = true
  }
  function close(): Promise<RuntimeCloseResult> {
    closeAdmission()
    closing ??= (async () => {
      const outcomes = await Promise.allSettled(
        [...entries.values()].map(async entry => {
          entry.abort()
          await entry.stopped
        }),
      )
      return outcomes.some(result => result.status === 'rejected')
        ? ({ unavailable: true } as const)
        : ({ released: true } as const)
    })()
    return closing
  }
  function snapshot(scope: SessionScope): readonly ModelExecutionObservation[] {
    const owned = ownScope(scope)
    if (!owned) throw new TypeError('invalid model execution scope')
    return Object.freeze(
      [...entries.values()]
        .filter(
          entry =>
            entry.ref.session === owned.session && tenantIdEquals(entry.ref.tenant, owned.tenant),
        )
        .map(entry => Object.freeze({ ref: entry.ref, state: entry.state })),
    )
  }
  return Object.freeze({
    execute,
    executionSource: Object.freeze({ snapshot }),
    closeAdmission,
    close,
  })
}
