import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { RunId } from '@omne-harness/session-contract'
import {
  commitCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import { controlOperation } from './derivation.ts'
import type { PrincipalFact } from './ports.ts'

export type RetryRunPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  factOf(principal: Principal): PrincipalFact | undefined
}>

export async function retryRun(
  ports: RetryRunPorts,
  login: LoginIdentity,
  body: Body<'retry-run'>,
): Promise<Answer<'retry-run'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const result = await commitCall(() =>
    faces.work.retryRun({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, body.controlId),
      run: body.run as RunId,
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('retry-run', result.failure)
  return { outcome: 'succeeded', body: { recovered: result.ok.recovered } }
}
