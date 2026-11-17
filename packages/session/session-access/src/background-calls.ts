import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  commitCall,
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import { controlOperation } from './derivation.ts'
import type { PrincipalFact } from './ports.ts'

export type BackgroundCallPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  factOf(principal: Principal): PrincipalFact | undefined
}>

// Session judges the relation: a call already in the background reconciles the control at once.
export async function backgroundCall(
  ports: BackgroundCallPorts,
  login: LoginIdentity,
  body: Body<'background-call'>,
): Promise<Answer<'background-call'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const { controlId, producer } = body
  const result = await commitCall(() =>
    faces.work.control({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      intent: { kind: 'background-tool', producer },
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('background-call', result.failure)
  const kind = result.ok.progress.state === 'reconciled' ? 'background' : 'requested'
  return { outcome: 'succeeded', body: { kind, controlId, producer } }
}

export async function listBackgroundCalls(
  ports: Pick<BackgroundCallPorts, 'admit'>,
  login: LoginIdentity,
  body: Body<'list-background-calls'>,
): Promise<Answer<'list-background-calls'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, faces } = admitted
  const result = await readCall(() => faces.work.readBackgroundCalls(access))
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('list-background-calls', result.failure)
  return { outcome: 'succeeded', body: { calls: result.ok.map(({ producer }) => ({ producer })) } }
}
