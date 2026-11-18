import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionAccess } from '@omne-harness/session-contract'
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
import { loginEntryOrigin, modeOperation } from './derivation.ts'
import type { PermissionModeReading, PrincipalFact, SessionPermissionModes } from './ports.ts'

export type PermissionModePorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  factOf(principal: Principal): PrincipalFact | undefined
  modes(): SessionPermissionModes | undefined
}>

async function current(
  ports: PermissionModePorts,
  access: SessionAccess<Principal>,
): Promise<Extract<PermissionModeReading, { kind: 'read' }> | Refusal> {
  const modes = ports.modes()
  if (modes === undefined) return UNAVAILABLE
  const reading = await readCall(() => modes.read(access))
  return reading === 'basis-unavailable' || reading.kind === 'unavailable' ? UNAVAILABLE : reading
}

export async function readPermissionMode(
  ports: PermissionModePorts,
  login: LoginIdentity,
  body: Body<'read-permission-mode'>,
): Promise<Answer<'read-permission-mode'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const now = await current(ports, admitted.access)
  if ('outcome' in now) return now
  return { outcome: 'succeeded', body: { mode: now.mode, revision: now.revision } }
}

// The revision is checked again in the commit; the read only answers the same value without one.
export async function changePermissionMode(
  ports: PermissionModePorts,
  login: LoginIdentity,
  body: Body<'change-permission-mode'>,
): Promise<Answer<'change-permission-mode'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const now = await current(ports, access)
  if ('outcome' in now) return now
  if (now.revision !== body.expectedRevision) return { outcome: 'conflict', body: {} }
  if (now.mode === body.mode)
    return { outcome: 'no-change', body: { mode: now.mode, revision: now.revision } }
  const operation = modeOperation(caller.login, tenantText, access.session, body)
  const result = await commitCall(() =>
    faces.management.change({
      ...access,
      operation,
      declaration: {
        kind: 'permission-mode',
        value: body.mode,
        expectedRevision: body.expectedRevision,
        authorization: loginEntryOrigin(caller.account, caller.login),
      },
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result)
    return result.failure.kind === 'changed'
      ? { outcome: 'conflict', body: {} }
      : refused('change-permission-mode', result.failure)
  const revision = String(BigInt(body.expectedRevision) + 1n)
  return { outcome: 'succeeded', body: { mode: body.mode, revision } }
}
