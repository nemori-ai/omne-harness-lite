import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EntryId, InputId } from '@omne-harness/session-contract'
import {
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import { inputIdentity, tenantTextOf } from './derivation.ts'
import { readWaiting, type ReadWaitingPorts } from './read-waiting.ts'

export type IntakeReadPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
}>

export async function readPending(
  ports: IntakeReadPorts,
  login: LoginIdentity,
  body: Body<'read-pending'>,
): Promise<Answer<'read-pending'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, faces } = admitted
  const after = body.after as EntryId | null
  const result = await readCall(() =>
    faces.work.readPending({ ...access, after, limit: Number(body.limit) }),
  )
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('read-pending', result.failure)
  return { outcome: 'succeeded', body: result.ok }
}

export async function readWaitingCalls(
  ports: IntakeReadPorts,
  login: LoginIdentity,
  body: Body<'read-waiting-calls'>,
): Promise<Answer<'read-waiting-calls'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, faces } = admitted
  const result = await readCall(() => faces.work.readWaitingCalls(access))
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('read-waiting-calls', result.failure)
  return { outcome: 'succeeded', body: { calls: result.ok } }
}

export async function readInputFate(
  ports: IntakeReadPorts,
  login: LoginIdentity,
  body: Body<'read-input-fate'>,
): Promise<Answer<'read-input-fate'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, faces } = admitted
  // The sender names the input by the text it sent; Session knows it by the derived identity.
  const input = inputIdentity(tenantTextOf(body.tenant), body.session, body.inputId) as InputId
  const result = await readCall(() => faces.work.readInputFate({ ...access, input }))
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('read-input-fate', result.failure)
  return { outcome: 'succeeded', body: { fate: result.ok } }
}

type Call = Readonly<{ principal: LoginIdentity }>

/** The reads of one session as handlers of the contribution. */
export function sessionReadOperations(ports: IntakeReadPorts & ReadWaitingPorts) {
  return {
    'read-waiting': (call: Call, body: Body<'read-waiting'>) =>
      readWaiting(ports, call.principal, body),
    'read-pending': (call: Call, body: Body<'read-pending'>) =>
      readPending(ports, call.principal, body),
    'read-waiting-calls': (call: Call, body: Body<'read-waiting-calls'>) =>
      readWaitingCalls(ports, call.principal, body),
    'read-input-fate': (call: Call, body: Body<'read-input-fate'>) =>
      readInputFate(ports, call.principal, body),
  }
}
