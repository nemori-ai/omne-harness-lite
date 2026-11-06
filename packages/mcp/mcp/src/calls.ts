// The call port `ActionCalls` (SPEC S1, S2, S6, R2, R5, O1–O6): `invoke` and `continueWithInput`
// walk the one send order of SPEC MC-16 on the in-flight table, the gate, the catalog and the
// connection table; `cancel` reads the in-flight table only. From its reservation to its answer a
// call has one owner, `perform`: every wait before the send is under the call's one stop signal
// (the caller's signal and `cancel` as one), the place is concluded in one spot by the phase the
// table recorded, and after the send the peer is told once and not waited for.
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
  type McpConfig,
  type McpPorts,
  type NotSentReason,
  type PeerAnswer,
  type PeerNotification,
} from '@omne-harness/mcp-contract'
import type { CallRequest, SentCall } from '@omne-harness/mcp-contract/provider'
import { judgedTree } from './internal/caller-values.ts'
import { classificationOf } from './internal/classification.ts'
import { CONNECTION_UNAVAILABLE, type Ensured, type EnsureFailure } from './internal/entry.ts'
import type { AdmittedEndpoint } from './internal/gate.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import type { InFlightCalls, InFlightKey, Reservation } from './internal/in-flight.ts'
import {
  connectionFailureOf,
  connectionFailureOfBuild,
  loseInScope,
  lostOfNotSent,
  lostOfOutcome,
  type NotSent,
} from './internal/lost.ts'
import { ask, waitAtMost, within } from './internal/port.ts'
import { prepareSettings } from './internal/settings.ts'
import { ensureOptionsOf, type ConnectionTable } from './internal/table.ts'
import type { TaskTable } from './internal/task-table.ts'

export type CallsDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  inFlight: InFlightCalls
  tasks: TaskTable
}>

const CORRELATION_KEY_IN_USE: NotSentReason = { kind: 'correlation-key-in-use' }
const CANCELLED: NotSentReason = { kind: 'cancelled' }
const DEFINITION_CHANGED: NotSentReason = { kind: 'definition-changed' }
const ACTION_UNAVAILABLE: NotSentReason = { kind: 'action-unavailable' }
const UNKNOWN: NotSentReason = { kind: 'unknown' }
const ABANDONED: PeerAnswer = { kind: 'no-answer', cause: 'abandoned' }
const UNKNOWN_ABANDONED: CallOutcome = { kind: 'unknown', cause: 'abandoned' }

/** The stop signal fired before the send: the one answer `perform` turns into `cancelled`. */
const STOPPED = 'stopped'
type Stopped = typeof STOPPED

/** The shutdown began before the send: `perform` answers it as S8's refusal. */
const SHUT = 'shut'
type Shut = typeof SHUT

/** Why the send order went no further before the send: the stop signal or the shutdown. */
type Halted = Stopped | Shut

/** A `call` that breached its contract (T9): no answer and no request to cancel. */
const CALL_BREACHED = 'call-breached'
type CallBreached = typeof CALL_BREACHED

/** What a continuation sends besides the action and the arguments. */
type Continuation = NonNullable<CallRequest['continuation']>

/** The two sends: a first call, and the continuation of an `inputRequired` outcome (S2). */
type Send =
  | Readonly<{ kind: 'invoke'; request: InvokeRequest }>
  | Readonly<{ kind: 'continue'; request: ContinueRequest }>

/** What the send needs once the steps before it passed: the connection and the known action. */
type Prepared = Readonly<{ ensured: Ensured; known: KnownAction }>

/** A call on the wire: what the answer is read with. */
type Sent = Readonly<{
  send: Send
  key: InFlightKey
  stop: AbortSignal
  ensured: Ensured
  known: KnownAction
  call: SentCall
}>

function isHalted<T>(value: T | Halted): value is Halted {
  return value === STOPPED || value === SHUT
}

function notSent(reason: NotSentReason): InvokeResult {
  return { kind: 'not-sent', reason }
}

function sent(outcome: CallOutcome): InvokeResult {
  return { kind: 'sent', outcome }
}

/** The "not sent" reason of a connection that `ensure` did not give (R2, SPEC MC-16 table). */
function notSentOfEnsure(failure: EnsureFailure): NotSentReason {
  return failure.stage === 'settings' ? failure.reason : connectionFailureOfBuild(failure)
}

/**
 * The preconditions of a send (R2, MC-16 step 1), checked before any place is taken: a caller
 * defect is a `TypeError`, not a "not sent" reason. Each value tree the caller gives passes
 * `judgeJsonValue`, the precondition of `McpTransport.call`, and the arguments are a JSON object.
 * A continuation carries its request state or its input responses, each optional (S2): one with
 * neither continues nothing. The send that comes back carries the judged copies, so the
 * transport writes the trees that were judged.
 */
function checkedSend(send: Send): Send {
  const args = judgedTree(send.request.args, 'the arguments of an MCP action')
  if (!isActionArgs(args))
    throw new TypeError('the arguments of an MCP action are a JSON object (isActionArgs)')
  if (send.kind === 'invoke') return { kind: 'invoke', request: { ...send.request, args } }
  const { requestState, inputResponses } = send.request
  if (requestState === undefined && inputResponses === undefined)
    throw new TypeError('a continuation carries the request state or the input responses')
  return {
    kind: 'continue',
    request: {
      ...send.request,
      args,
      ...(inputResponses === undefined
        ? {}
        : { inputResponses: judgedTree(inputResponses, 'the input responses of an MCP action') }),
    },
  }
}

function continuationOf(request: ContinueRequest): Continuation {
  return {
    ...(request.requestState === undefined ? {} : { requestState: request.requestState }),
    ...(request.inputResponses === undefined ? {} : { inputResponses: request.inputResponses }),
  }
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
   * A wait of the send order under the call's stop signal and the table's shutdown (MC-16 steps
   * 2 and 3), both read before the wait: a stop that fired starts nothing, and one that fires
   * first ends the wait (the work goes on in the table's scope), both `stopped`; a shutdown that
   * began starts nothing either, `shut`, so no port is asked after it. Neither is an answer:
   * `perform` decides the answer when the call concludes, from the state of that moment.
   */
  async function under<T>(
    stop: AbortSignal,
    work: () => Promise<Outcome<T, NotSentReason>>,
  ): Promise<Outcome<T, NotSentReason> | Halted> {
    if (stop.aborted) return STOPPED
    if (table.isShut()) return SHUT
    const waited = await within(work(), stop, scope)
    return waited.kind === 'expired' ? STOPPED : waited.value
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

  /** Step 7: the build, shared by every caller of the key and bounded by the connection bound. */
  async function connectionOf(
    send: Send,
    access: Access<P>,
    endpoint: AdmittedEndpoint,
  ): Promise<Outcome<Ensured, NotSentReason>> {
    const ensured = await table.ensure(endpoint, access, ensureOptionsOf(send.request.connectBound))
    return 'failure' in ensured ? fail(notSentOfEnsure(ensured.failure)) : ensured
  }

  /** Steps 3–7 of MC-16: what the send needs, or why the call is not sent. Every wait is under `stop`. */
  async function prepare(
    send: Send,
    access: Access<P>,
    stop: AbortSignal,
  ): Promise<Outcome<Prepared, NotSentReason> | Halted> {
    const { request } = send
    // Step 3: the shutdown first, read by `under` before the gate is asked (S8), then the gate.
    const admitted = await under(stop, () => admitForUse(gate, access, request.ref))
    if (isHalted(admitted) || 'failure' in admitted) return admitted
    const endpoint = admitted.ok
    const prepared = prepareSettings(endpoint, request.connectBound)
    if ('failure' in prepared) return prepared
    const { account } = prepared.ok
    const known = await under(stop, () =>
      knownActionOf(send, catalogKeyOf(access.tenant, endpoint, account)),
    )
    if (isHalted(known) || 'failure' in known) return known
    const current = table.current(connectionKeyOf(access.tenant, endpoint, account))
    if (!issuedOn(send, current?.generation)) return fail(UNKNOWN)
    // The stop ends only this call's wait for the build.
    const ensured = await under(stop, () => connectionOf(send, access, endpoint))
    if (isHalted(ensured) || 'failure' in ensured) return ensured
    if (!issuedOn(send, ensured.ok.generation)) return fail(UNKNOWN)
    return succeed({ ensured: ensured.ok, known: known.ok })
  }

  /**
   * Step 9: a call the transport did not send takes the connection down (S7), with the teardown
   * in the table's scope, unless the answer is the transport's to a stop signal that fired: a
   * cancel before the send, not a lost connection (T5).
   */
  function loseUnlessStopReply(ensured: Ensured, failure: NotSent, stop: AbortSignal): void {
    if (failure.cause === 'connection-unavailable' && stop.aborted) return
    loseInScope(table, ensured, lostOfNotSent(failure))
  }

  /**
   * Step 12: the answer applied to the tables: classified (O1–O6), a lost connection reported to
   * the connection table, a task recorded for its initiator (MC-17).
   */
  function applyAnswer(on: Sent, answer: PeerAnswer): CallOutcome {
    const { outputSchema } = on.known.lastLawful
    const outcome = classifyOutcome(
      answer,
      classificationOf(on.ensured.generation, outputSchema, ports.checkOutput),
    )
    const lost = lostOfOutcome(outcome)
    if (lost !== undefined) loseInScope(table, on.ensured, lost)
    if (outcome.kind === 'task')
      tasks.record(
        {
          tenant: on.key.tenant,
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
   * A stop that fires first ends the wait: the outcome is `unknown` (`abandoned`) (T5, O6), and
   * the peer is told once, in the table's scope, without a wait for it; after the shutdown began
   * it is not told (S8): the transport is closing and settles its own requests (T5). The answer
   * is always read through `ask`, so one that rejects (T9) is no answer, and one that arrives
   * after the stop is dropped.
   */
  async function answerOf(on: Sent): Promise<InvokeResult> {
    const { requestId, answer } = on.call
    const waited = await waitAtMost(
      ask(() => answer, ABANDONED),
      on.stop,
    )
    if (waited.kind === 'expired') {
      if (!table.isShut())
        scope.spawn(ask(() => on.ensured.transport.cancelRequest(requestId), undefined))
      return sent(UNKNOWN_ABANDONED)
    }
    return sent(applyAnswer(on, waited.value))
  }

  /**
   * Steps 3–12 under the reservation: the steps before the send, the send, and the answer. A
   * stop signal or a shutdown read before a wait or before the send halts the order; `perform`
   * answers it, and reads both once more for a refusal.
   */
  async function sendOrder(
    send: Send,
    access: Access<P>,
    key: InFlightKey,
    place: Reservation,
  ): Promise<InvokeResult | Halted> {
    const { stop } = place
    const prepared = await prepare(send, access, stop)
    if (isHalted(prepared)) return prepared
    if ('failure' in prepared) return notSent(prepared.failure)
    const { ensured, known } = prepared.ok
    // Step 8: the last look at the stop signal and the shutdown, in the same synchronous run as
    // the send: a stop that fired by now keeps the call off the transport, and so does a
    // shutdown that began since the last wait answered (P13).
    if (stop.aborted) return STOPPED
    if (table.isShut()) return SHUT
    const called = await ask<Outcome<SentCall, NotSent> | CallBreached>(
      () => ensured.transport.call(callRequestOf(send), stop, observerOf(send.request.observe)),
      CALL_BREACHED,
    )
    if (called === CALL_BREACHED) {
      // T9: a `call` that breached left with an unknown effect; the place is a sent one.
      place.recordSent(ensured.connection, ensured.generation)
      return sent(UNKNOWN_ABANDONED)
    }
    if ('failure' in called) {
      loseUnlessStopReply(ensured, called.failure, stop)
      return notSent(connectionFailureOf(called.failure))
    }
    place.recordSent(ensured.connection, ensured.generation)
    return answerOf({ send, key, stop, ensured, known, call: called.ok })
  }

  /**
   * The answer of a call (MC-16 steps 2 and 3), read from the state of the moment it concludes.
   * A call not sent whose stop signal fired by then is `cancelled`, whatever the step it fired in
   * refused (S2). Else a call not sent once the shutdown began is S8's `connection-unavailable`,
   * whatever step or transport refused it, so a call in flight at `closeAll` answers as one that
   * started after it. A sent call answers its outcome.
   */
  function answerAtExit(result: InvokeResult | Halted, stop: AbortSignal): InvokeResult {
    if (result === STOPPED) return notSent(CANCELLED)
    if (result !== SHUT && result.kind === 'sent') return result
    if (stop.aborted) return notSent(CANCELLED)
    return result === SHUT || table.isShut() ? notSent(CONNECTION_UNAVAILABLE) : result
  }

  /**
   * The one owner of a call (MC-16): the reservation hands out the stop signal; the send order
   * runs under it; and the place is concluded once, in one `finally`, by the phase the table
   * recorded. The answer is decided here and nowhere else, in the same synchronous run as the
   * conclusion, so a `cancel` that answered `signalled` makes the call answer `cancelled`, and a
   * `closeAll` that lands at any microtask before it gives the call S8's answer.
   */
  async function perform(given: Send, access: Access<P>): Promise<InvokeResult> {
    const send = checkedSend(given)
    const key = keyOf(access, send.request.correlationKey)
    const place = inFlight.reserve(key, send.request.signal)
    if (place === 'in-use') return notSent(CORRELATION_KEY_IN_USE)
    try {
      return answerAtExit(await sendOrder(send, access, key, place), place.stop)
    } finally {
      place.conclude()
    }
  }

  return {
    invoke: (access, request) => perform({ kind: 'invoke', request }, access),
    continueWithInput: (access, request) => perform({ kind: 'continue', request }, access),
    cancel: (access, correlationKey): Promise<CancelAnswer> =>
      Promise.resolve(inFlight.cancel(keyOf(access, correlationKey))),
  }
}
