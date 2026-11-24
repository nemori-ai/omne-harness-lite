import { MEMBER_INPUT_SOURCE } from './member-source.ts'
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { writeJsonText } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import type { InputId, OperationRequest, SessionId } from '@omne-harness/session-contract'
import {
  commitCall,
  describedBy,
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
  type Target,
} from './answers.ts'
import { acceptOperation, inputIdentity, loginEntryOrigin } from './derivation.ts'
import type {
  PrincipalFact,
  PrincipalFacts,
  SessionAccessFaces,
  TargetTenantPrincipals,
} from './ports.ts'
import type { PerformOperation } from './command-operations.ts'
import type { Admission, RequestDrain } from './request-drain.ts'
import type { QueuedRequest } from './request-queue.ts'

export type SendInputPorts = Readonly<{
  target(login: LoginIdentity, tenant: TenantId, session: string): Promise<Target | Refusal>
  factOf(principal: Principal): PrincipalFact | undefined
  faces(): SessionAccessFaces | undefined
  requests: Pick<RequestDrain, 'enqueue' | 'isQueued'>
}>

export type AdmissionPorts = Readonly<{
  principals: Pick<TargetTenantPrincipals, 'resume'>
  facts: PrincipalFacts
  faces(): SessionAccessFaces | undefined
  /** Does the operation a system command asks for; without it such a command is unsupported. */
  perform?: PerformOperation
}>

function userMessageOf(text: string): Message | undefined {
  const judged = judgeMessage(JSON.parse(text))
  return 'ok' in judged && judged.ok.role === 'user' ? judged.ok : undefined
}

async function enqueueInput(
  ports: SendInputPorts,
  login: LoginIdentity,
  body: Body<'send-input'>,
  urgent: boolean,
): Promise<Answer<'send-input'> | Answer<'interrupt-input'>> {
  const message = writeJsonText(body.message)
  if (userMessageOf(message) === undefined) return { outcome: 'protocol-rejected' }
  const targeted = await ports.target(login, body.tenant, body.session)
  if ('outcome' in targeted) return targeted
  const caller = ports.factOf(targeted.access.principal)
  if (caller === undefined) return UNAVAILABLE
  return ports.requests.enqueue({
    tenant: targeted.tenantText,
    session: body.session,
    acceptId: body.acceptId,
    inputId: body.inputId,
    message,
    login: caller.login,
    ...(urgent ? { urgent: true as const } : {}),
    ...(body.seen === undefined ? {} : { seen: body.seen }),
    ...('afterRun' in body && body.afterRun === 'yes' ? { afterRun: true as const } : {}),
  })
}

export async function sendInput(
  ports: SendInputPorts,
  login: LoginIdentity,
  body: Body<'send-input'>,
): Promise<Answer<'send-input'>> {
  return (await enqueueInput(ports, login, body, false)) as Answer<'send-input'>
}

// The same queue and the same query as send-input; Session decides if a Run is there to interrupt.
export async function interruptInput(
  ports: SendInputPorts,
  login: LoginIdentity,
  body: Body<'interrupt-input'>,
): Promise<Answer<'interrupt-input'>> {
  return (await enqueueInput(ports, login, body, true)) as Answer<'interrupt-input'>
}

const RETRY: Admission = Object.freeze({ kind: 'retry' })

// An urgent input that met no Run was taken as ordinary; the answer says which (C27).
function answerOf(
  value: Readonly<{ receipt: Readonly<{ recovered: boolean }>; progress: unknown }>,
): Readonly<{ recovered: boolean; as: 'interrupt' | 'ordinary' }> {
  return {
    recovered: value.receipt.recovered,
    as: value.progress === null ? 'ordinary' : 'interrupt',
  }
}

function settled(answer: Answer<'send-input'>): Admission {
  return { kind: 'settled', answer }
}

type Caller = NonNullable<ReturnType<typeof describedBy>>

// One queued input to Session: an urgent one interrupts the Run there, an ordinary one is accepted.
function commitInput(
  faces: SessionAccessFaces,
  principal: Principal,
  caller: Caller,
  request: QueuedRequest,
  message: Message,
) {
  const session = request.session as SessionId
  const access = { principal, tenant: caller.tenant, session }
  const operation = acceptOperation(request.tenant, session, request.acceptId)
  const value = {
    kind: 'ordinary' as const,
    input: inputIdentity(request.tenant, session, request.inputId) as InputId,
    message,
    origin: loginEntryOrigin(caller.account, caller.login),
    source: MEMBER_INPUT_SOURCE.name,
    ...(request.afterRun === true ? { afterRun: true as const } : {}),
  }
  const seen = request.seen === undefined ? {} : { seen: request.seen }
  if (request.urgent === true)
    return faces.management
      .interrupt({
        ...access,
        operation,
        run: null,
        urgent: value,
        decision: value.origin,
        ...seen,
      })
      .then(answer => ('ok' in answer ? { ok: answerOf(answer.ok) } : answer))
  return faces.work
    .accept({ ...access, operation, value, ...seen })
    .then(answer => ('ok' in answer ? { ok: { recovered: answer.ok.recovered } } : answer))
}

/** A system command: written into the session, then its operation done as itself; its answer is the operation's. */
async function commanded(
  admitted: Admitted,
  request: QueuedRequest,
  asked: OperationRequest,
  perform: PerformOperation,
): Promise<Admission> {
  const { access, faces } = admitted
  const operation = acceptOperation(request.tenant, access.session, `command:${request.acceptId}`)
  const recorded = await commitCall(() =>
    faces.management.recordCommand({ ...access, operation, name: asked.name, args: asked.args }),
  )
  if (recorded === 'unknown') return RETRY
  if ('failure' in recorded) {
    const { kind } = recorded.failure
    if (kind === 'unavailable' || kind === 'commit-unknown') return RETRY
    return settled(refused('send-input', recorded.failure))
  }
  const done = await perform(admitted, asked, `command:${request.acceptId}`)
  if (done.outcome === 'unknown' || done.outcome === 'basis-unavailable') return RETRY
  if (done.outcome !== 'succeeded' && done.outcome !== 'no-change')
    return settled({
      outcome: 'invalid',
      body: {
        field: 'value.message',
        reason: `${asked.name}: ${done.outcome}${done.detail === null ? '' : `: ${done.detail}`}`,
      },
    })
  const said = { name: asked.name, outcome: done.outcome, detail: done.detail }
  const as = request.urgent === true ? { as: 'ordinary' as const } : {}
  return settled({
    outcome: 'succeeded',
    body: { recovered: recorded.ok.recovered, ...as, operation: said },
  } as Answer<'send-input'>)
}

export async function admitRequest(
  ports: AdmissionPorts,
  request: QueuedRequest,
): Promise<Admission> {
  const issued = await readCall(() => ports.principals.resume(request.tenant, request.login))
  if (issued === 'basis-unavailable') return RETRY
  if ('refused' in issued)
    return issued.refused === 'denied' ? settled({ outcome: 'denied' }) : RETRY
  const faces = ports.faces()
  if (faces === undefined) return RETRY
  const caller = describedBy(ports.facts, issued.ok)
  if (caller === undefined) return settled(UNAVAILABLE)
  const message = userMessageOf(request.message)
  if (message === undefined) return settled({ outcome: 'protocol-rejected' })
  const result = await commitCall(() => commitInput(faces, issued.ok, caller, request, message))
  if (result === 'unknown') return RETRY
  if ('ok' in result) return settled({ outcome: 'succeeded', body: result.ok })
  const asked = result.failure.kind === 'unsupported' ? result.failure.request : undefined
  if (asked !== undefined && ports.perform !== undefined) {
    const access = {
      principal: issued.ok,
      tenant: caller.tenant,
      session: request.session as SessionId,
    }
    return commanded({ access, tenantText: request.tenant, faces }, request, asked, ports.perform)
  }
  const { kind } = result.failure
  if (kind === 'unavailable' || kind === 'commit-unknown') return RETRY
  return settled(refused('send-input', result.failure))
}

export async function querySendInput(
  ports: SendInputPorts,
  login: LoginIdentity,
  body: Body<'query-send-input'>,
): Promise<Answer<'query-send-input'>> {
  const targeted = await ports.target(login, body.tenant, body.session)
  if ('outcome' in targeted) return targeted
  const { access, tenantText } = targeted
  if (ports.requests.isQueued(tenantText, access.session, body.acceptId))
    return { outcome: 'unknown' }
  const faces = ports.faces()
  if (faces === undefined) return UNAVAILABLE
  const result = await readCall(() =>
    faces.work.queryOperation({
      ...access,
      operation: acceptOperation(tenantText, access.session, body.acceptId),
    }),
  )
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('query-send-input', result.failure)
  switch (result.ok.kind) {
    case 'committed':
      return { outcome: 'succeeded', body: {} }
    case 'not-committed':
      return { outcome: 'not-committed', body: {} }
    case 'attempt-rejected':
    case 'unknown':
      return { outcome: 'unknown' }
  }
}
