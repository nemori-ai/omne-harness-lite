import { createHash } from 'node:crypto'
import { canonicalText } from '@omne-harness/authorization'
import {
  accountEquals,
  loginStateCodec,
  type LoginStateId,
  type AccountId,
} from '@omne-harness/legal-identity'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type IdentityGovernance,
} from '@omne-harness/identity'
import {
  commandDigest,
  type DurableEvidence,
  type SessionAccessDecision,
  type SessionCommand,
  type SessionPermissionWriteQualification,
} from '@omne-harness/session-contract'
import { LOGIN_WORK_OWNER } from './principals.ts'

export const SESSION_PERMISSION_OWN_LOGIN_POLICY: DurableEvidence = Object.freeze({
  owner: 'authorization',
  record: 'session.permission-own-login',
  revision: '1',
  digest: `sha256:${createHash('sha256').update('authorization/session.permission-own-login/1').digest('hex')}`,
})

export type SessionPermissionLogin = Pick<IdentityGovernance, 'queryCurrentTenant'>
export type PreparedPermissionWrite = Readonly<{
  login: LoginStateId
  qualification: SessionPermissionWriteQualification
}>

/** Freezes the original binding before admission or login reads can yield. */
export function preparePermissionWrite(
  command: SessionCommand,
  principal: ActingForTenantPrincipal,
): PreparedPermissionWrite | null {
  if (command.kind !== 'change' || command.input.declaration.kind !== 'permission-assignment')
    return null
  const declaration = command.input.declaration
  const expression = declaration.authorization
  const policy = SESSION_PERMISSION_OWN_LOGIN_POLICY
  if (
    principal.work.owner !== LOGIN_WORK_OWNER ||
    canonicalText(expression) !== canonicalText(policy) ||
    !/^(0|[1-9][0-9]*)$/.test(declaration.expectedRevision)
  )
    return null
  const login = loginStateCodec.parse(principal.work.work)
  if (!login.ok) return null
  return Object.freeze({
    login: login.value,
    qualification: Object.freeze({
      tenant: command.input.tenant,
      session: command.input.session,
      operation: command.input.operation,
      commandDigest: commandDigest(command),
      permissionRevision: declaration.expectedRevision,
      principalRef: standingPrincipalRef(principal),
      policy,
    }),
  })
}

type LoginDecision =
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

async function currentLogin(
  login: LoginStateId,
  account: AccountId,
  source: SessionPermissionLogin | undefined,
): Promise<LoginDecision> {
  if (source === undefined)
    return {
      kind: 'unavailable',
      diagnostic: 'the Session permission login source is not installed',
    }
  try {
    const current = await source.queryCurrentTenant({ login })
    switch (current.kind) {
      case 'denied':
        return { kind: 'denied' }
      case 'succeeded':
        return accountEquals(current.tenant.account, account)
          ? { kind: 'current' }
          : { kind: 'denied' }
      default:
        return {
          kind: 'unavailable',
          diagnostic: 'the Session permission login source is unavailable',
        }
    }
  } catch {
    return { kind: 'unavailable', diagnostic: 'the Session permission login source is unavailable' }
  }
}

/** New durable operations cannot reuse a login decision made by an earlier caller. */
export function recheckSessionPermissionLogin(
  principal: ActingForTenantPrincipal,
  source: SessionPermissionLogin | undefined,
): Promise<LoginDecision> {
  const login = loginStateCodec.parse(principal.work.work)
  if (principal.work.owner !== LOGIN_WORK_OWNER || !login.ok)
    return Promise.resolve({ kind: 'denied' })
  return currentLogin(login.value, principal.tenant.account, source)
}

/** Called only after the original principal and target tenant pass the admission check. */
export async function qualifyPermissionWrite(
  prepared: PreparedPermissionWrite,
  evidence: DurableEvidence,
  login: SessionPermissionLogin | undefined,
): Promise<SessionAccessDecision> {
  const current = await currentLogin(prepared.login, prepared.qualification.tenant.account, login)
  return current.kind === 'current'
    ? Object.freeze({ kind: 'allowed', evidence, writeQualification: prepared.qualification })
    : current
}
