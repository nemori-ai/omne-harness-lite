// The call port `ActionCalls` (SPEC S1, S2, S6, R2, R5, O1–O6): `invoke` and `continueWithInput`
// walk the one send order of SPEC MC-16 on the in-flight table, the gate, the catalog and the
// connection table; `cancel` reads the in-flight table only. A call that was not sent has no peer
// effect and gives its place back at once; a sent call ends in the table with its outcome.
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
import type { Ensured, EnsureFailure } from './internal/entry.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import { InFlightCalls, type InFlightKey } from './internal/in-flight.ts'
import { connectionFailureOf, lostOfNoAnswer, lostOfNotSent } from './internal/lost.ts'
import { ask, waitAtMost, within } from './internal/port.ts'
import { prepareSettings } from './internal/settings.ts'
import type { ConnectionTable } from './internal/table.ts'
import { TaskTable } from './internal/task-table.ts'

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
const CONNECTION_UNAVAILABLE: NotSentReason = { kind: 'connection-unavailable' }
const ABANDONED: PeerAnswer = { kind: 'no-answer', cause: 'abandoned' }
const UNKNOWN_ABANDONED: CallOutcome = { kind: 'unknown', cause: 'abandoned' }

/** What a continuation sends besides the action and the arguments. */
type Continuation = NonNullable<CallRequest['continuation']>

/** The two sends: a first call, and the continuation of an `inputRequired` outcome (S2). */
type Send =
  | Readonly<{ kind: 'invoke'; request: InvokeRequest }>
  | Readonly<{ kind: 'continue'; request: ContinueRequest; continuation: Continuation }>

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

function continuationOf(request: ContinueRequest): Continuation {
  return {
    ...(request.requestState === undefined ? {} : { requestState: request.requestState }),
    ...(request.inputResponses === undefined ? {} : { inputResponses: request.inputResponses }),
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
   * Step 4: the known action in the stored catalog. Not acquired, not listed or unavailable is
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
   * Step 6: a cancel, or the caller's abort, before the send (S2, R2). The call existed and
   * ended without a peer effect, so a later `cancel` answers `no-call-in-flight`.
   */
  function cancelled(key: InFlightKey): InvokeResult {
    inFlight.markEnded(key)
    return notSent(CANCELLED)
  }

  /** A connection the transport reported gone under a sent or unsent request (S7). */
  async function lose(
    ensured: Ensured,
    lost: ReturnType<typeof lostOfNotSent> | undefined,
  ): Promise<void> {
    if (lost === undefined) return
    await table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
  }

  /**
   * Step 8 after a cancel or the caller's abort: the peer is told once, the answer is not waited
   * for, and the outcome is `unknown` (`abandoned`) (O6, S2).
   */
  async function abandon(
    ensured: Ensured,
    key: InFlightKey,
    requestId: string,
  ): Promise<InvokeResult> {
    inFlight.markEnded(key)
    await ask(() => ensured.transport.cancelRequest(requestId), undefined)
    return sent(UNKNOWN_ABANDONED)
  }

  /** Steps 7–9 on a usable connection: the send, the wait under the stop signal, the outcome. */
  async function sendOn(
    send: Send,
    access: Access<P>,
    key: InFlightKey,
    stop: AbortSignal,
    ensured: Ensured,
    known: KnownAction,
  ): Promise<InvokeResult> {
    const { request } = send
    const call: CallRequest = {
      action: request.action,
      args: request.args,
      ...(send.kind === 'continue' ? { continuation: send.continuation } : {}),
    }
    const called = await ask(
      () => ensured.transport.call(call, stop, observerOf(request.observe)),
      undefined,
    )
    if (called === undefined) {
      // T9: a `call` that breached left with an unknown effect; there is no request to cancel.
      inFlight.markEnded(key)
      return sent(UNKNOWN_ABANDONED)
    }
    if ('failure' in called) {
      // T5: a transport answers `not-sent` to a signal that fired before the send. A cancel or
      // abort that raced the send is a cancel before the send, not a lost connection.
      if (called.failure.cause === 'connection-unavailable' && stop.aborted) return cancelled(key)
      await lose(ensured, lostOfNotSent(called.failure))
      inFlight.release(key)
      return notSent(connectionFailureOf(called.failure))
    }
    const { requestId, answer }: SentCall = called.ok
    if (inFlight.markSent(key, ensured.connection) === 'cancelled')
      return abandon(ensured, key, requestId)
    const waited = await waitAtMost(
      ask(() => answer, ABANDONED),
      stop,
    )
    if (waited.kind === 'expired') return abandon(ensured, key, requestId)
    const outcome = classifyOutcome(waited.value, {
      issuedAt: ensured.generation,
      ...(known.lastLawful.outputSchema === undefined
        ? {}
        : { outputSchema: known.lastLawful.outputSchema }),
      checkOutput: ports.checkOutput,
    })
    if (outcome.kind === 'unknown') await lose(ensured, lostOfNoAnswer(outcome.cause))
    if (outcome.kind === 'task')
      tasks.record(
        {
          tenant: access.tenant,
          principalKey: key.principalKey,
          holding: request.ref.holding,
          taskId: outcome.taskId,
        },
        {
          issuedAt: outcome.issuedAt,
          account: ensured.key.account,
          ...(known.lastLawful.outputSchema === undefined
            ? {}
            : { outputSchema: known.lastLawful.outputSchema }),
        },
      )
    inFlight.markEnded(key)
    return sent(outcome)
  }

  /** The send order of SPEC MC-16, steps 1–6, then `sendOn`. A refused step gives the place back. */
  async function perform(send: Send, access: Access<P>): Promise<InvokeResult> {
    const { request } = send
    if (!isActionArgs(request.args))
      throw new TypeError('the arguments of an MCP action are a JSON object (isActionArgs)')
    const key = keyOf(access, request.correlationKey)
    if (inFlight.reserve(key) === 'in-use') return notSent(CORRELATION_KEY_IN_USE)
    const cancellation = inFlight.stopOf(key)
    const stop =
      cancellation === undefined ? request.signal : AbortSignal.any([request.signal, cancellation])
    const refused = (reason: NotSentReason): InvokeResult => {
      inFlight.release(key)
      return notSent(reason)
    }
    const admitted = await admitForUse(gate, access, request.ref)
    if ('failure' in admitted) return refused(admitted.failure)
    const prepared = prepareSettings(admitted.ok, request.connectBound)
    if ('failure' in prepared) return refused(prepared.failure)
    const { account } = prepared.ok
    const known = await knownActionOf(send, catalogKeyOf(access.tenant, admitted.ok, account))
    if ('failure' in known) return refused(known.failure)
    // S2: a continuation goes only on the generation the `inputRequired` outcome was issued at.
    // Without a usable connection of that generation the state cannot be proven; nothing is
    // built or sent to find out, because a build gives a later generation.
    if (send.kind === 'continue') {
      const current = table.current(connectionKeyOf(access.tenant, admitted.ok, account))
      if (current === undefined || current.generation !== send.request.issuedAt)
        return refused(UNKNOWN)
    }
    if (stop.aborted) return cancelled(key)
    // The build is shared by every caller of the key and bounded by the connection bound; the
    // caller's abort ends only this call's wait, as a cancel before the send.
    const options = request.connectBound === undefined ? {} : { connectBound: request.connectBound }
    const asked = await within(table.ensure(admitted.ok, access, options), request.signal, scope)
    if (asked.kind === 'expired') return cancelled(key)
    if ('failure' in asked.value) return refused(notSentOfEnsure(asked.value.failure))
    const ensured = asked.value.ok
    if (send.kind === 'continue' && ensured.generation !== send.request.issuedAt)
      return refused(UNKNOWN)
    if (stop.aborted) return cancelled(key)
    return sendOn(send, access, key, stop, ensured, known.ok)
  }

  return {
    invoke: (access, request) => perform({ kind: 'invoke', request }, access),
    continueWithInput: (access, request) =>
      perform({ kind: 'continue', request, continuation: continuationOf(request) }, access),
    cancel: (access, correlationKey): Promise<CancelAnswer> =>
      Promise.resolve(inFlight.cancel(keyOf(access, correlationKey))),
  }
}
