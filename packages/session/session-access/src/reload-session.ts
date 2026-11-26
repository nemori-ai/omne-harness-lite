import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import { commitCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import { controlOperation } from './derivation.ts'
import type { RetryRunPorts } from './retry-run.ts'

/** A person asks the session to take the definition in force now; the session judges and answers. */
export async function reloadSession(
  ports: RetryRunPorts,
  login: LoginIdentity,
  body: Body<'reload-session'>,
): Promise<Answer<'reload-session'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const result = await commitCall(() =>
    faces.work.reloadSession({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, body.controlId),
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('ok' in result) return { outcome: 'succeeded', body: { kind: result.ok.kind } }
  const { failure } = result
  if (failure.kind === 'invalid') return { outcome: 'invalid', body: { reason: failure.reason } }
  if (failure.kind === 'frozen')
    return { outcome: 'frozen', body: { capability: failure.verdict?.capability ?? null } }
  const reason = CONFLICTS[failure.kind]
  if (reason !== undefined) return { outcome: 'conflict', body: { reason } }
  return refused('reload-session', failure)
}

const CONFLICTS: Readonly<Record<string, 'cancelled' | 'not-current' | 'changed'>> = {
  cancelled: 'cancelled',
  'stale-advance': 'not-current',
  changed: 'changed',
  conflict: 'changed',
}
