import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionAccess } from '@omne-harness/session-contract'
import {
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import type { RunFailureCause, RunFailureCauses } from './ports.ts'

export type ReadWaitingPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  causes(): RunFailureCauses | undefined
}>

async function causeOf(
  ports: ReadWaitingPorts,
  access: SessionAccess<Principal>,
  execution: string,
): Promise<RunFailureCause | null> {
  try {
    const causes = ports.causes()
    if (causes === undefined) return null
    const reading = await causes.read({
      principal: access.principal,
      tenant: access.tenant,
      execution,
    })
    if (reading.kind !== 'cause' || reading.cause.kind === '') return null
    const { kind, detail } = reading.cause
    return { kind, detail: detail === '' ? null : detail }
  } catch {
    return null
  }
}

export async function readWaiting(
  ports: ReadWaitingPorts,
  login: LoginIdentity,
  body: Body<'read-waiting'>,
): Promise<Answer<'read-waiting'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, faces } = admitted
  const result = await readCall(() => faces.work.readWaiting(access))
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('read-waiting', result.failure)
  const waiting = result.ok
  if (waiting === null) return { outcome: 'succeeded', body: { waiting: null } }
  const cause = waiting.execution === null ? null : await causeOf(ports, access, waiting.execution)
  return {
    outcome: 'succeeded',
    body: { waiting: { run: waiting.run, pending: String(waiting.pending), cause } },
  }
}
