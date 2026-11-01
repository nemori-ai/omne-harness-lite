// The session location (SPEC「会话位置」): the read dispatch, then the six steps of the public
// contract's「会话判断次序」for the seven session operations, each reaching one Session face call
// through the derived identities, and the mapping of Session results to public outcomes.
import { readJsonBytes, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { judgeMessage, type Message } from '@omne-harness/message'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  readSessionRequest,
  type SessionRequest,
  type SessionSuccessBodies,
  type SessionTerminalSource,
} from '@omne-harness/public-contract'
import type {
  DurableEvidence,
  HistoryPage,
  InputId,
  RunId,
  SessionCreation,
  SessionFailure,
  SessionId,
  SessionOperationId,
} from '@omne-harness/session-contract'
import type { Answer, JsonAnswer, NoAnswer } from './answers.ts'
import type { ServerEntryConfig } from './config.ts'
import {
  acceptOperation,
  controlOperation,
  createOperation,
  inputIdentity,
  loginEntryOrigin,
  sessionIdentity,
  tenantTextOf,
} from './derivation.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import type { DefinitionResolver, SessionIngressFaces } from './faces.ts'
import { isRefusal, type Caller, type IdentitySteps } from './identity-steps.ts'
import {
  handleObservation,
  observationRejected,
  readObservationRequest,
  selectsObservation,
  type ObservationRegistry,
} from './observation.ts'
import { sessionAnswer, sessionProtocolRejected } from './session-codec.ts'
import type { PublicOutcome } from './status.ts'

export type SessionContext = Readonly<{
  config: ServerEntryConfig
  faces: SessionIngressFaces<ActingForTenantPrincipal>
  steps: IdentitySteps
  resolveDefinition: DefinitionResolver
  registry: ObservationRegistry
  readLimits: JsonLimits
  diagnostics: DiagnosticSink | undefined
}>

type Request = SessionRequest
type Reply = JsonAnswer | NoAnswer

/** A plain value of a json-text tree, for the message package. Keys are defined, never assigned. */
function plainOf(value: JsonValue): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(plainOf)
    case 'object': {
      const result: Record<string, unknown> = {}
      for (const entry of value.entries)
        Object.defineProperty(result, entry.key, {
          value: plainOf(entry.value),
          enumerable: true,
          writable: true,
          configurable: true,
        })
      return result
    }
  }
}

/** Step 1's second half for `send-input`: the message package admits the message and its role is `user`. */
function decodeUserMessage(wire: JsonValue): Message | undefined {
  const judged = judgeMessage(plainOf(wire))
  return 'ok' in judged && judged.ok.role === 'user' ? judged.ok : undefined
}

function failureOutcome(failure: SessionFailure): PublicOutcome {
  switch (failure.kind) {
    case 'denied':
      return 'denied'
    case 'invalid':
      return 'invalid'
    case 'conflict':
      return 'conflict'
    case 'commit-unknown':
      return 'unknown'
    case 'unavailable':
    case 'quarantined':
      return 'basis-unavailable'
    case 'archived':
      return 'archived'
    case 'frozen':
      return 'frozen'
    default:
      // A kind outside the public result set of the operation (`unsupported` for a Model target
      // included): the entry cannot say allowed now.
      return 'basis-unavailable'
  }
}

function sourceOf(evidence: DurableEvidence): SessionTerminalSource {
  return {
    owner: evidence.owner,
    record: evidence.record,
    revision: evidence.revision,
    digest: evidence.digest,
  }
}

function pageOf(page: HistoryPage): SessionSuccessBodies['read-history'] {
  return {
    entries: page.entries.map(entry => ({
      entryId: entry.id,
      revision: entry.revision,
      kind: entry.kind,
      payload: entry.payload,
    })),
    next: page.next,
    exhausted: page.exhausted,
    scannedThrough: page.scannedThrough,
  }
}

/** Whether a `pageBytes` text (digits only, no leading zero) is within the deployment bound. */
function withinPageBound(pageBytes: string, bound: number): boolean {
  const boundText = String(bound)
  return (
    pageBytes.length < boundText.length ||
    (pageBytes.length === boundText.length && pageBytes <= boundText)
  )
}

type Target = Readonly<{ tenant: TenantId; tenantText: string; session: SessionId }>

/** Steps 2 to 4 for one request: the caller, then the acting principal for the target tenant. */
async function admit(
  request: Request,
  context: SessionContext,
): Promise<
  | Readonly<{ caller: Caller; principal: ActingForTenantPrincipal; target: Target }>
  | Readonly<{ outcome: 'denied' | 'basis-unavailable' }>
> {
  const caller = await context.steps.recognize(request.proof)
  if (isRefusal(caller)) return caller
  const tenant = request.operation === 'create-session' ? request.actingTenant : request.body.tenant
  // Step 3: only create-session has an acting tenant; it must be the login's current selection.
  if (request.operation === 'create-session' && !sameTenant(tenant, caller.tenant))
    return { outcome: 'denied' }
  const principal = await context.steps.actingFor(caller, tenant)
  if (isRefusal(principal)) return principal
  const tenantText = tenantTextOf(tenant)
  const session =
    request.operation === 'create-session' || request.operation === 'query-create-session'
      ? sessionIdentity(tenantText, request.body.createCallId)
      : request.body.session
  return { caller, principal, target: { tenant, tenantText, session: session as SessionId } }
}

function sameTenant(left: TenantId, right: TenantId): boolean {
  return tenantTextOf(left) === tenantTextOf(right)
}

type Admitted = Readonly<{ caller: Caller; principal: ActingForTenantPrincipal; target: Target }>

/** A commit-class Session call: a throw after the call began is `unknown` with a body. */
async function commitCall<T>(
  call: () => Promise<T>,
  operation: Request['operation'],
  context: SessionContext,
): Promise<T | 'unknown'> {
  try {
    return await call()
  } catch {
    emit(context.diagnostics, { code: 'session.commit-fault', operation })
    return 'unknown'
  }
}

/** A read-class Session call: a throw is `basis-unavailable`, nothing was committed. */
async function readCall<T>(
  call: () => Promise<T>,
  operation: Request['operation'],
  context: SessionContext,
): Promise<T | 'basis-unavailable'> {
  try {
    return await call()
  } catch {
    emit(context.diagnostics, { code: 'session.read-fault', operation })
    return 'basis-unavailable'
  }
}

async function createSession(
  request: SessionRequest<'create-session'>,
  admitted: Admitted,
  context: SessionContext,
): Promise<Reply> {
  const answer = (outcome: PublicOutcome, body: unknown): Reply =>
    sessionAnswer(request.operation, request.messageId, outcome, body, context.diagnostics)
  // Step 5: the definition must be in the deployment mapping. A throwing mapping is the entry's own fault.
  const resolved = context.resolveDefinition(request.body.definition)
  if (resolved === undefined) return answer('invalid', {})
  const creation: SessionCreation = {
    definition: { name: request.body.definition, candidate: resolved.candidate },
    execution: resolved.execution,
    requiredIdentities: resolved.requiredIdentities,
    purpose: request.body.purpose,
    workspace: null,
    workspaceAttachment: null,
    modes: { kind: 'tenant-default', source: resolved.tenantDefaults },
    initial: null,
    entryContract: resolved.entryContract,
    ...(resolved.initialModelSelection === undefined
      ? {}
      : { initialModelSelection: resolved.initialModelSelection }),
  }
  const { target } = admitted
  const operation = createOperation(target.tenantText, request.body.createCallId)
  const result = await commitCall(
    () =>
      context.faces.management.create({
        principal: admitted.principal,
        tenant: target.tenant,
        session: target.session,
        operation,
        creation,
      }),
    request.operation,
    context,
  )
  if (result === 'unknown') return answer('unknown', {})
  if ('failure' in result) return answer(failureOutcome(result.failure), {})
  return answer('succeeded', { session: target.session, recovered: result.ok.receipt.recovered })
}

async function queryOperation(
  request: SessionRequest<'query-create-session' | 'query-send-input'>,
  operation: SessionOperationId,
  admitted: Admitted,
  context: SessionContext,
): Promise<Reply> {
  const answer = (outcome: PublicOutcome, body: unknown): Reply =>
    sessionAnswer(request.operation, request.messageId, outcome, body, context.diagnostics)
  const { target } = admitted
  const result = await readCall(
    () =>
      context.faces.work.queryOperation({
        principal: admitted.principal,
        tenant: target.tenant,
        session: target.session,
        operation,
      }),
    request.operation,
    context,
  )
  if (result === 'basis-unavailable') return answer('basis-unavailable', {})
  if ('failure' in result) return answer(failureOutcome(result.failure), {})
  const resolution = result.ok
  const isCreate = request.operation === 'query-create-session'
  switch (resolution.kind) {
    case 'committed':
      return answer('succeeded', isCreate ? { session: target.session } : {})
    case 'not-committed':
      // A creation that never committed means the session does not exist: denied, not disclosed.
      return answer(isCreate ? 'denied' : 'not-committed', {})
    case 'attempt-rejected':
    case 'unknown':
      return answer('unknown', {})
  }
}

async function sendInput(
  request: SessionRequest<'send-input'>,
  message: Message,
  admitted: Admitted,
  context: SessionContext,
): Promise<Reply> {
  const answer = (outcome: PublicOutcome, body: unknown): Reply =>
    sessionAnswer(request.operation, request.messageId, outcome, body, context.diagnostics)
  const { caller, target } = admitted
  const operation = acceptOperation(target.tenantText, target.session, request.body.acceptId)
  const input = inputIdentity(target.tenantText, target.session, request.body.inputId) as InputId
  const result = await commitCall(
    () =>
      context.faces.work.accept({
        principal: admitted.principal,
        tenant: target.tenant,
        session: target.session,
        operation,
        value: {
          kind: 'ordinary',
          input,
          message,
          origin: loginEntryOrigin(caller.accountText, caller.loginText),
        },
      }),
    request.operation,
    context,
  )
  if (result === 'unknown') return answer('unknown', {})
  if ('failure' in result) return answer(failureOutcome(result.failure), {})
  return answer('succeeded', { recovered: result.ok.recovered })
}

async function readHistory(
  request: SessionRequest<'read-history'>,
  admitted: Admitted,
  context: SessionContext,
): Promise<Reply> {
  const answer = (outcome: PublicOutcome, body: unknown): Reply =>
    sessionAnswer(request.operation, request.messageId, outcome, body, context.diagnostics)
  const { target } = admitted
  const access = { principal: admitted.principal, tenant: target.tenant, session: target.session }
  const { body } = request
  // Step 5: pageBytes within the deployment bound.
  if (body.cursor === null && !withinPageBound(body.pageBytes, context.config.maxPageBytes))
    return answer('invalid', {})
  const result = await readCall(
    () =>
      body.cursor === null
        ? context.faces.history.begin({
            ...access,
            kinds: context.config.historyKinds,
            from: null,
            direction: body.direction,
            pageBytes: Number(body.pageBytes),
          })
        : context.faces.history.next({ ...access, cursor: body.cursor }),
    request.operation,
    context,
  )
  if (result === 'basis-unavailable') return answer('basis-unavailable', {})
  if ('failure' in result) return answer(failureOutcome(result.failure), {})
  return answer('succeeded', pageOf(result.ok))
}

async function cancelRun(
  request: SessionRequest<'cancel-run'>,
  admitted: Admitted,
  context: SessionContext,
): Promise<Reply> {
  const answer = (outcome: PublicOutcome, body: unknown): Reply =>
    sessionAnswer(request.operation, request.messageId, outcome, body, context.diagnostics)
  const { caller, target } = admitted
  const { controlId, run } = request.body
  const operation = controlOperation(caller.loginText, target.tenantText, target.session, controlId)
  const result = await commitCall(
    () =>
      context.faces.work.cancelRun({
        principal: admitted.principal,
        tenant: target.tenant,
        session: target.session,
        operation,
        run: run as RunId,
        urgency: request.body.urgency,
      }),
    request.operation,
    context,
  )
  if (result === 'unknown') return answer('unknown', {})
  if ('failure' in result) return answer(failureOutcome(result.failure), {})
  const { answer: saved } = result.ok
  switch (saved.kind) {
    case 'requested':
      return answer('succeeded', { kind: 'requested', controlId, run })
    case 'ended':
      return answer('succeeded', {
        kind: 'ended',
        controlId,
        run,
        terminal: { outcome: saved.terminal.outcome, source: sourceOf(saved.terminal.evidence) },
      })
    case 'not-found':
      return answer('not-found', {})
  }
}

/** A Tool target keeps Session's access and availability answers; every other answer is `unsupported`. */
function toolTargetOutcome(result: Outcome<unknown, SessionFailure>): PublicOutcome {
  if ('failure' in result) {
    const { kind } = result.failure
    if (kind === 'denied') return 'denied'
    if (kind === 'unavailable' || kind === 'quarantined') return 'basis-unavailable'
  }
  return 'unsupported'
}

async function stopCall(
  request: SessionRequest<'stop-call'>,
  admitted: Admitted,
  context: SessionContext,
): Promise<Reply> {
  const answer = (outcome: PublicOutcome, body: unknown): Reply =>
    sessionAnswer(request.operation, request.messageId, outcome, body, context.diagnostics)
  const { caller, target } = admitted
  const { controlId, producer } = request.body
  const operation = controlOperation(caller.loginText, target.tenantText, target.session, controlId)
  // Session judges the access first, so `denied` and unavailability come from it. For a Tool
  // target the public answer is `unsupported` whatever else Session says: the entry does not
  // pre-empt the access judgment, and it discloses no business result for a Tool target.
  const result = await commitCall(
    () =>
      context.faces.work.stopCall({
        principal: admitted.principal,
        tenant: target.tenant,
        session: target.session,
        operation,
        producer,
      }),
    request.operation,
    context,
  )
  if (result === 'unknown') return answer('unknown', {})
  if (producer.kind === 'tool') return answer(toolTargetOutcome(result), {})
  if ('failure' in result) return answer(failureOutcome(result.failure), {})
  const { answer: saved } = result.ok
  switch (saved.kind) {
    case 'requested':
      return answer('succeeded', { kind: 'requested', controlId, producer })
    case 'ended':
      return answer('succeeded', {
        kind: 'ended',
        controlId,
        producer,
        terminal: {
          version: saved.terminal.version,
          outcome: saved.terminal.outcome,
          source: sourceOf(saved.terminal.source),
        },
      })
    case 'not-found':
      return answer('not-found', {})
  }
}

async function handleRequest(request: Request, context: SessionContext): Promise<Reply> {
  // The rest of step 1 for send-input happens before any identity call.
  let message: Message | undefined
  if (request.operation === 'send-input') {
    message = decodeUserMessage(request.body.message)
    if (message === undefined) return sessionProtocolRejected(request.messageId)
  }
  const admitted = await admit(request, context)
  if ('outcome' in admitted)
    return sessionAnswer(
      request.operation,
      request.messageId,
      admitted.outcome,
      {},
      context.diagnostics,
    )
  switch (request.operation) {
    case 'create-session':
      return createSession(request, admitted, context)
    case 'query-create-session':
      return queryOperation(
        request,
        createOperation(admitted.target.tenantText, request.body.createCallId),
        admitted,
        context,
      )
    case 'send-input':
      return sendInput(request, message as Message, admitted, context)
    case 'query-send-input':
      return queryOperation(
        request,
        acceptOperation(admitted.target.tenantText, admitted.target.session, request.body.acceptId),
        admitted,
        context,
      )
    case 'read-history':
      return readHistory(request, admitted, context)
    case 'cancel-run':
      return cancelRun(request, admitted, context)
    case 'stop-call':
      return stopCall(request, admitted, context)
  }
}

/** Answers one session-location message: the read dispatch, then the judgment order. */
export async function handleSession(bytes: Uint8Array, context: SessionContext): Promise<Answer> {
  const strict = readJsonBytes(bytes, context.readLimits)
  const observation = strict.kind === 'ok' ? selectsObservation(strict.value) : undefined
  if (observation !== undefined && strict.kind === 'ok') {
    const read = readObservationRequest(strict.value, observation, context.readLimits)
    if (read.kind === 'rejected') return observationRejected(observation, read.messageId)
    return handleObservation(read.request, context)
  }
  const read = readSessionRequest({ bytes, limits: context.readLimits })
  if (read.kind !== 'request') return sessionProtocolRejected(read.response.messageId)
  return handleRequest(read.request, context)
}
