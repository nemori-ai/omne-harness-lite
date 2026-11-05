// The call port `ActionCalls` (SPEC S1, S2, S6, R2, R5, O1–O6): `invoke` and `continueWithInput`
// walk the one send order of SPEC MC-16 on the in-flight table, the gate, the catalog and the
// connection table; `cancel` reads the in-flight table only. From its reservation to its answer a
// call has one owner, `perform`: every wait before the send is under the call's one stop signal
// (the caller's signal and `cancel` as one), the key is concluded in one place by the phase the
// call reached, and after the send the peer is told once and not waited for.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  classifyOutcome,
  connectionKeyOf,
  isActionArgs,
  type ActionCalls,
  type ActionName,
  type CallOutcome,
  type CancelAnswer,
  type CatalogKey,
  type ContinueRequest,
  type CorrelationKey,
  type Generation,
  type InvokeRequest,
  type InvokeResult,
  type KnownAction,
  type NotSentReason,
  type PeerAnswer,
  type PeerNotification,
} from '@omne-harness/mcp-contract'
import type { CallRequest, SentCall } from '@omne-harness/mcp-contract/provider'
import type { Ensured, EnsureFailure } from './internal/entry.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import type { CallPhase, InFlightKey } from './internal/in-flight.ts'
import {
  connectionFailureOf,
  loseInScope,
  lostOfNoAnswer,
  lostOfNotSent,
  type NotSent,
} from './internal/lost.ts'
import { ask, waitAtMost, within } from './internal/port.ts'
import { prepareSettings } from './internal/settings.ts'
import type { EnsureOptions } from './internal/table.ts'
import type { InvokerDependencies } from './invoker.ts'

export type CallsDependencies<P, S> = Pick<
  InvokerDependencies<P, S>,
  'ports' | 'config' | 'table' | 'inFlight' | 'tasks'
>

const CORRELATION_KEY_IN_USE: NotSentReason = { kind: 'correlation-key-in-use' }
const CANCELLED: NotSentReason = { kind: 'cancelled' }
const DEFINITION_CHANGED: NotSentReason = { kind: 'definition-changed' }
const ACTION_UNAVAILABLE: NotSentReason = { kind: 'action-unavailable' }
const UNKNOWN: NotSentReason = { kind: 'unknown' }
const CONNECTION_UNAVAILABLE: NotSentReason = { kind: 'connection-unavailable' }
const ABANDONED: PeerAnswer = { kind: 'no-answer', cause: 'abandoned' }
const UNKNOWN_ABANDONED: CallOutcome = { kind: 'unknown', cause: 'abandoned' }

/** What a continuation sends besides the action and the arguments. */
type Continuation = NonNullable<CallRequest['continuation']>

/** The two sends: a first call, and the continuation of an `inputRequired` outcome (S2). */
type Send =
  | Readonly<{ kind: 'invoke'; request: InvokeRequest }>
  | Readonly<{ kind: 'continue'; request: ContinueRequest }>

/** What the send needs once the steps before it passed: the connection and the known action. */
type Prepared = Readonly<{ ensured: Ensured; known: KnownAction }>

/** A call on the wire: what the answer is read with. */
type Sent<P> = Readonly<{
  send: Send
  access: Access<P>
  key: InFlightKey
  stop: AbortSignal
  ensured: Ensured
  known: KnownAction
  call: SentCall
}>

function notSent(reason: NotSentReason): InvokeResult {
  return { kind: 'not-sent', reason }
}

function sent(outcome: CallOutcome): InvokeResult {
  return { kind: 'sent', outcome }
}

/** The "not sent" reason of a connection that `ensure` did not give (R2, SPEC MC-16 table). */
function notSentOfEnsure(failure: EnsureFailure): NotSentReason {
  if (failure.stage === 'settings') return failure.reason
  // The call itself did not leave: an unknown effect of `discover` is not an unknown effect of it.
  return failure.reason.kind === 'effect-unknown' ? CONNECTION_UNAVAILABLE : failure.reason
}

/**
 * The preconditions of a send (R2, MC-16 step 1), checked before any place is taken: a caller
 * defect is a `TypeError`, not a "not sent" reason. The arguments are a JSON object. A
 * continuation carries its request state or its input responses, each optional (S2): one with
 * neither continues nothing.
 */
function checkRequest(send: Send): void {
  if (!isActionArgs(send.request.args))
    throw new TypeError('the arguments of an MCP action are a JSON object (isActionArgs)')
  if (send.kind !== 'continue') return
  const { requestState, inputResponses } = send.request
  if (requestState === undefined && inputResponses === undefined)
    throw new TypeError('a continuation carries the request state or the input responses')
}

function continuationOf(request: ContinueRequest): Continuation {
  return {
    ...(request.requestState === undefined ? {} : { requestState: request.requestState }),
    ...(request.inputResponses === undefined ? {} : { inputResponses: request.inputResponses }),
  }
}

function ensureOptionsOf(request: Send['request']): EnsureOptions {
  return request.connectBound === undefined ? {} : { connectBound: request.connectBound }
}

function callRequestOf(send: Send): CallRequest {
  return {
    action: send.request.action,
    args: send.request.args,
    ...(send.kind === 'continue' ? { continuation: continuationOf(send.request) } : {}),
  }
}

/** The observer as the transport gets it: one that throws changes no outcome (S6). */
function observerOf(
  observe: ((notification: PeerNotification) => void) | undefined,
): ((notification: PeerNotification) => void) | undefined {
  if (observe === undefined) return undefined
  return notification => {
    try {
      observe(notification)
    } catch {
      // S6: the observer's error is the observer's; the call goes on.
    }
  }
}

export function createCalls<P, S>(deps: CallsDependencies<P, S>): ActionCalls<P> {
  const { ports, config, table, inFlight, tasks } = deps
  const { scope } = table.runtime
  const gate: UseGate<P, S> = { ports, table }

  const keyOf = (access: Access<P>, correlationKey: CorrelationKey): InFlightKey => ({
    tenant: access.tenant,
    principalKey: config.principalKey(access.principal),
    correlationKey,
  })

  /**
   * A wait of the send order under the call's stop signal (MC-16 step 2). A stop that fired
   * already starts nothing. One that fires first ends the wait: the work goes on in the table's
   * scope. An answer that arrives once the stop fired is not read either. All three are
   * `cancelled`.
   */
  async function under<T, F>(
    stop: AbortSignal,
    work: () => Promise<Outcome<T, F>>,
  ): Promise<Outcome<T, F | typeof CANCELLED>> {
    if (stop.aborted) return fail(CANCELLED)
    const waited = await within(work(), stop, scope)
    return waited.kind === 'expired' || stop.aborted ? fail(CANCELLED) : waited.value
  }

  /**
   * Step 5: the known action in the stored catalog. Not acquired, not listed or unavailable is
   * `action-unavailable`; a store that breaches is `unknown` (MC-15); for a first call the
   * caller's expected definition has to be the current one (R2).
   */
  async function knownActionOf(
    send: Send,
    catalogKey: CatalogKey,
  ): Promise<Outcome<KnownAction, NotSentReason>> {
    const read = await ask(() => ports.store.read(catalogKey), fail('unavailable'))
    if ('failure' in read) return fail(UNKNOWN)
    if (read.ok === 'absent') return fail(ACTION_UNAVAILABLE)
    const action: ActionName = send.request.action
    const known = read.ok.actions.find(candidate => candidate.name === action)
    if (known === undefined || known.availability.kind === 'unavailable')
      return fail(ACTION_UNAVAILABLE)
    if (send.kind === 'invoke' && known.definitionDigest !== send.request.expectedDefinition)
      return fail(DEFINITION_CHANGED)
    return succeed(known)
  }

  /**
   * Step 6: a continuation goes only on the generation the `inputRequired` outcome was issued at
   * (S2). Without a usable connection of that generation the state cannot be proven; nothing is
   * built or sent to find out, because a build gives a later generation.
   */
  function issuedOn(send: Send, generation: Generation | undefined): boolean {
    return send.kind === 'invoke' || generation === send.request.issuedAt
  }

  /** Steps 3–7 of MC-16: what the send needs, or why the call is not sent. Every wait is under `stop`. */
  async function prepare(
    send: Send,
    access: Access<P>,
    stop: AbortSignal,
  ): Promise<Outcome<Prepared, NotSentReason>> {
    const { request } = send
    // S8: after `closeAll` nothing connects, for a first call and a continuation alike; no port
    // is asked.
    if (table.isShut()) return fail(CONNECTION_UNAVAILABLE)
    const admitted = await under(stop, () => admitForUse(gate, access, request.ref))
    if ('failure' in admitted) return admitted
    const endpoint = admitted.ok
    const prepared = prepareSettings(endpoint, request.connectBound)
    if ('failure' in prepared) return prepared
    const { account } = prepared.ok
    const known = await under(stop, () =>
      knownActionOf(send, catalogKeyOf(access.tenant, endpoint, account)),
    )
    if ('failure' in known) return known
    const current = table.current(connectionKeyOf(access.tenant, endpoint, account))
    if (!issuedOn(send, current?.generation)) return fail(UNKNOWN)
    // The build is shared by every caller of the key and bounded by the connection bound; the
    // stop ends only this call's wait for it.
    const ensured = await under(stop, () =>
      table.ensure(endpoint, access, ensureOptionsOf(request)),
    )
    if ('failure' in ensured)
      return fail('stage' in ensured.failure ? notSentOfEnsure(ensured.failure) : ensured.failure)
    if (!issuedOn(send, ensured.ok.generation)) return fail(UNKNOWN)
    return succeed({ ensured: ensured.ok, known: known.ok })
  }

  /**
   * Step 9: a call the transport did not send. A transport answering the stop signal that fired
   * is a cancel before the send, not a lost connection (T5); otherwise the connection is gone (S7)
   * and its teardown goes on in the table's scope.
   */
  function notSentBy(ensured: Ensured, failure: NotSent, stop: AbortSignal): void {
    if (failure.cause === 'connection-unavailable' && stop.aborted) return
    loseInScope(table, ensured, lostOfNotSent(failure))
  }

  /** Step 12: the outcome of the answer (O1–O6); a lost connection and a task go to their tables. */
  function outcomeOf(on: Sent<P>, answer: PeerAnswer): CallOutcome {
    const { outputSchema } = on.known.lastLawful
    const outcome = classifyOutcome(answer, {
      issuedAt: on.ensured.generation,
      ...(outputSchema === undefined ? {} : { outputSchema }),
      checkOutput: ports.checkOutput,
    })
    const lost = outcome.kind === 'unknown' ? lostOfNoAnswer(outcome.cause) : undefined
    if (lost !== undefined) loseInScope(table, on.ensured, lost)
    if (outcome.kind === 'task')
      tasks.record(
        {
          tenant: on.access.tenant,
          principalKey: on.key.principalKey,
          holding: on.send.request.ref.holding,
          taskId: outcome.taskId,
        },
        {
          issuedAt: outcome.issuedAt,
          account: on.ensured.key.account,
          ...(outputSchema === undefined ? {} : { outputSchema }),
        },
      )
    return outcome
  }

  /**
   * Steps 11–12 on a call that is on the wire: the wait for the answer under the stop signal.
   * A stop that fires first tells the peer once, in the table's scope, and does not wait for it:
   * the outcome is `unknown` (`abandoned`) (T5, O6). An answer that rejects (T9) is no answer.
   */
  async function answerOf(on: Sent<P>): Promise<InvokeResult> {
    const { requestId, answer } = on.call
    const waited = await waitAtMost(
      ask(() => answer, ABANDONED),
      on.stop,
    )
    if (waited.kind === 'expired') {
      scope.spawn(ask(() => on.ensured.transport.cancelRequest(requestId), undefined))
      return sent(UNKNOWN_ABANDONED)
    }
    return sent(outcomeOf(on, waited.value))
  }

  /**
   * The one owner of a call (MC-16): the reservation hands out the stop signal; the steps before
   * the send run under it; the send; the answer; and one conclusion of the key, by the phase the
   * call reached. A call not sent whose stop signal fired is `cancelled`, whatever the step it
   * fired in refused (S2).
   */
  async function perform(send: Send, access: Access<P>): Promise<InvokeResult> {
    checkRequest(send)
    const { request } = send
    const key = keyOf(access, request.correlationKey)
    const stop = inFlight.reserve(key, request.signal)
    if (stop === 'in-use') return notSent(CORRELATION_KEY_IN_USE)
    const unsent = (reason: NotSentReason): InvokeResult =>
      notSent(stop.aborted ? CANCELLED : reason)
    let phase: CallPhase = 'unsent'
    try {
      const prepared = await prepare(send, access, stop)
      if ('failure' in prepared) return unsent(prepared.failure)
      const { ensured, known } = prepared.ok
      const called = await ask(
        () => ensured.transport.call(callRequestOf(send), stop, observerOf(request.observe)),
        undefined,
      )
      if (called === undefined) {
        // T9: a `call` that breached left with an unknown effect; there is no request to cancel.
        phase = 'sent'
        return sent(UNKNOWN_ABANDONED)
      }
      if ('failure' in called) {
        notSentBy(ensured, called.failure, stop)
        return unsent(connectionFailureOf(called.failure))
      }
      phase = 'sent'
      inFlight.markSent(key, ensured.connection, ensured.generation)
      return await answerOf({ send, access, key, stop, ensured, known, call: called.ok })
    } finally {
      inFlight.conclude(key, phase)
    }
  }

  return {
    invoke: (access, request) => perform({ kind: 'invoke', request }, access),
    continueWithInput: (access, request) => perform({ kind: 'continue', request }, access),
    cancel: (access, correlationKey): Promise<CancelAnswer> =>
      Promise.resolve(inFlight.cancel(keyOf(access, correlationKey))),
  }
}
