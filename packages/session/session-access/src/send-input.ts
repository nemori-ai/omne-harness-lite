import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { writeJsonText } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import type { InputId, SessionId } from '@omne-harness/session-contract'
import {
  commitCall,
  describedBy,
  readCall,
  refused,
  UNAVAILABLE,
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
}>

function userMessageOf(text: string): Message | undefined {
  const judged = judgeMessage(JSON.parse(text))
  return 'ok' in judged && judged.ok.role === 'user' ? judged.ok : undefined
}

export async function sendInput(
  ports: SendInputPorts,
  login: LoginIdentity,
  body: Body<'send-input'>,
): Promise<Answer<'send-input'>> {
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
  })
}

const RETRY: Admission = Object.freeze({ kind: 'retry' })

function settled(answer: Answer<'send-input'>): Admission {
  return { kind: 'settled', answer }
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
  const session = request.session as SessionId
  const result = await commitCall(() =>
    faces.work.accept({
      principal: issued.ok,
      tenant: caller.tenant,
      session,
      operation: acceptOperation(request.tenant, session, request.acceptId),
      value: {
        kind: 'ordinary',
        input: inputIdentity(request.tenant, session, request.inputId) as InputId,
        message,
        origin: loginEntryOrigin(caller.account, caller.login),
      },
    }),
  )
  if (result === 'unknown') return RETRY
  if ('ok' in result)
    return settled({ outcome: 'succeeded', body: { recovered: result.ok.recovered } })
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
