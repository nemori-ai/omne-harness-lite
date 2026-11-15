import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  classifyOutcome,
  connectionKeyOf,
  isActionArgs,
  type ActionArgs,
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
import {
  CONNECTION_UNAVAILABLE,
  type Ensured,
  type EnsureFailure,
  type NotSent,
} from './internal/entry.ts'
import type { AdmittedEndpoint } from './internal/gate.ts'
import { admitForUse, type UseGate } from './internal/guard.ts'
import type { InFlightCalls, InFlightKey, Reservation } from './internal/in-flight.ts'
import { connectionFailureOf, connectionFailureOfBuild, loseIfLost } from './internal/lost.ts'
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

const STOPPED = 'stopped'
type Stopped = typeof STOPPED

const SHUT = 'shut'
type Shut = typeof SHUT

type Halted = Stopped | Shut

const CALL_BREACHED = 'call-breached'
type CallBreached = typeof CALL_BREACHED

type Continuation = NonNullable<CallRequest['continuation']>

type Send =
  | Readonly<{ kind: 'invoke'; request: InvokeRequest }>
  | Readonly<{ kind: 'continue'; request: ContinueRequest }>

type Prepared = Readonly<{ ensured: Ensured; known: KnownAction }>

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

function notSentOfEnsure(failure: EnsureFailure): NotSentReason {
  return failure.stage === 'settings' ? failure.reason : connectionFailureOfBuild(failure)
}

function checkedSend(given: Send): Send {
  if (given.kind === 'invoke') {
    const { ref, action, args, expectedDefinition, correlationKey, signal, connectBound, observe } =
      given.request
    return {
      kind: 'invoke',
      request: {
        ref,
        action,
        args: judgedArgs(args),
        expectedDefinition,
        correlationKey,
        signal,
        ...(connectBound === undefined ? {} : { connectBound }),
        ...(observe === undefined ? {} : { observe }),
      },
    }
  }
  const { ref, action, args, requestState, inputResponses, issuedAt, correlationKey, signal } =
    given.request
  const { connectBound, observe } = given.request
  if (requestState === undefined && inputResponses === undefined)
    throw new TypeError('a continuation carries the request state or the input responses')
  return {
    kind: 'continue',
    request: {
      ref,
      action,
      args: judgedArgs(args),
      issuedAt,
      correlationKey,
      signal,
      ...(requestState === undefined ? {} : { requestState }),
      ...(inputResponses === undefined
        ? {}
        : { inputResponses: judgedTree(inputResponses, 'the input responses of an MCP action') }),
      ...(connectBound === undefined ? {} : { connectBound }),
      ...(observe === undefined ? {} : { observe }),
    },
  }
}

function judgedArgs(args: JsonValue): ActionArgs {
  const judged = judgedTree(args, 'the arguments of an MCP action')
  if (!isActionArgs(judged))
    throw new TypeError('the arguments of an MCP action are a JSON object (isActionArgs)')
  return judged
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

function observerOf(
  observe: ((notification: PeerNotification) => void) | undefined,
): ((notification: PeerNotification) => void) | undefined {
  if (observe === undefined) return undefined
  return notification => {
    try {
      observe(notification)
    } catch {}
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

  async function under<T>(
    stop: AbortSignal,
    work: () => Promise<Outcome<T, NotSentReason>>,
  ): Promise<Outcome<T, NotSentReason> | Halted> {
    if (stop.aborted) return STOPPED
    if (table.isShut()) return SHUT
    const waited = await within(work(), stop, scope)
    return waited.kind === 'expired' ? STOPPED : waited.value
  }

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

  function issuedOn(send: Send, generation: Generation | undefined): boolean {
    return send.kind === 'invoke' || generation === send.request.issuedAt
  }

  async function connectionOf(
    send: Send,
    access: Access<P>,
    endpoint: AdmittedEndpoint,
  ): Promise<Outcome<Ensured, NotSentReason>> {
    const ensured = await table.ensure(endpoint, access, ensureOptionsOf(send.request.connectBound))
    return 'failure' in ensured ? fail(notSentOfEnsure(ensured.failure)) : ensured
  }

  async function prepare(
    send: Send,
    access: Access<P>,
    stop: AbortSignal,
  ): Promise<Outcome<Prepared, NotSentReason> | Halted> {
    const { request } = send
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
    const ensured = await under(stop, () => connectionOf(send, access, endpoint))
    if (isHalted(ensured) || 'failure' in ensured) return ensured
    if (!issuedOn(send, ensured.ok.generation)) return fail(UNKNOWN)
    return succeed({ ensured: ensured.ok, known: known.ok })
  }

  function applyAnswer(on: Sent, answer: PeerAnswer): CallOutcome {
    const { outputSchema } = on.known.lastLawful
    const outcome = classifyOutcome(
      answer,
      classificationOf(on.ensured.generation, outputSchema, ports.checkOutput),
    )
    loseIfLost(table, on.ensured, answer)
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

  async function answerOf(on: Sent): Promise<InvokeResult> {
    const { requestId, answer } = on.call
    const waited = await waitAtMost(
      ask(() => answer, ABANDONED),
      on.stop,
    )
    if (waited.kind === 'expired') {
      const wire = on.ensured.wire()
      if ('ok' in wire) scope.spawn(ask(() => wire.ok.cancelRequest(requestId), undefined))
      return sent(UNKNOWN_ABANDONED)
    }
    return sent(applyAnswer(on, waited.value))
  }

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
    if (stop.aborted) return STOPPED
    const wire = ensured.wire()
    const called =
      'failure' in wire
        ? wire
        : await ask<Outcome<SentCall, NotSent> | CallBreached>(
            () => wire.ok.call(callRequestOf(send), stop, observerOf(send.request.observe)),
            CALL_BREACHED,
          )
    if (called === CALL_BREACHED) {
      place.recordSent(ensured.connection, ensured.generation)
      return sent(UNKNOWN_ABANDONED)
    }
    if ('failure' in called) {
      loseIfLost(table, ensured, called.failure)
      return notSent(connectionFailureOf(called.failure))
    }
    place.recordSent(ensured.connection, ensured.generation)
    return answerOf({ send, key, stop, ensured, known, call: called.ok })
  }

  function answerAtExit(result: InvokeResult | Halted, stop: AbortSignal): InvokeResult {
    if (result === STOPPED) return notSent(CANCELLED)
    if (result !== SHUT && result.kind === 'sent') return result
    if (stop.aborted) return notSent(CANCELLED)
    return result === SHUT || table.isShut() ? notSent(CONNECTION_UNAVAILABLE) : result
  }

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
