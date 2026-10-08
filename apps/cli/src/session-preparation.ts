import type { ActionReport, GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import {
  isGovernanceCenterId,
  type GovernanceCenterId,
} from '@omne-harness-lite/governance-center-entry'
import {
  isOk,
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
  parseMembershipStanding,
  type AccountId,
  type LoginStateId,
  type TenantId,
  type TenantRole,
} from '@omne-harness-lite/identity-values'

/** A fresh remote reading, never a Session Access credential or a continuing lease. */
export interface SessionIdentityObservation {
  readonly centerId: GovernanceCenterId
  readonly accountId: AccountId
  readonly loginStateHandle: LoginStateId
  readonly tenant: TenantId
  readonly role: TenantRole
}
export type SessionPreparationOutcome =
  | { readonly kind: 'observed'; readonly identity: SessionIdentityObservation }
  | {
      readonly kind: 'blocked'
      readonly reason:
        | 'login-rejected'
        | 'identity-unavailable'
        | 'membership-ineffective'
        | 'identity-mismatch'
        | 'reenter-required'
        | 'defect'
    }

/** The login chosen for this Run. It does not change the Session's owner. */
export type RunLoginBinding = Pick<
  SessionIdentityObservation,
  'centerId' | 'accountId' | 'loginStateHandle'
>
export type RunLoginObservationOutcome =
  | { readonly kind: 'observed'; readonly login: RunLoginBinding }
  | Extract<SessionPreparationOutcome, { kind: 'blocked' }>

/** Borrow a fixed use to observe login validity before one new Run. */
export async function readNewRunLogin(
  use: GovernanceUse,
  expected: RunLoginBinding,
): Promise<RunLoginObservationOutcome> {
  if (
    !isGovernanceCenterId(expected.centerId) ||
    !isOk(parseAccountId(expected.accountId)) ||
    !isOk(parseLoginStateId(expected.loginStateHandle))
  )
    return blocked('identity-mismatch')
  const current = await use.run({
    action: 'invoke',
    operation: currentOperation,
    payload: {},
    readMode: 'refresh',
  })
  const failure = reportBlock(current)
  if (failure !== undefined) return failure
  const identity = observedIdentity(current)
  if (identity === undefined || !sameOrigin(expected, current)) return blocked('identity-mismatch')
  return {
    kind: 'observed',
    login: {
      centerId: identity.centerId,
      accountId: identity.accountId,
      loginStateHandle: identity.loginStateHandle,
    },
  }
}

type Blocked = Extract<SessionPreparationOutcome, { kind: 'blocked' }>
const blocked = (reason: Blocked['reason']): Blocked => ({ kind: 'blocked', reason })
const currentOperation = 'capability.organization-governance/v2#S-36'
const membershipOperation = 'capability.organization-governance/v2#S-26'

function reportBlock(report: ActionReport): Blocked | undefined {
  if (report.defect !== undefined) return blocked('defect')
  if (report.remote.answer === 'login-state-rejected') return blocked('login-rejected')
  if (report.use !== 'active') return blocked('reenter-required')
  if (report.admission.status !== 'admitted') return blocked('identity-unavailable')
  if (report.remote.status !== 'success' || report.view.source !== 'online')
    return blocked('identity-unavailable')
  return undefined
}

function resultOf(report: ActionReport, operation: string): unknown {
  const data = report.remote.reply
  if (report.operation !== operation || data?.operation !== operation) return undefined
  return 'result' in data.reply ? data.reply.result : undefined
}

function observedIdentity(
  report: ActionReport,
): Omit<SessionIdentityObservation, 'role'> | undefined {
  const tenant = parseTenantId(resultOf(report, currentOperation))
  const account = parseAccountId(report.origin.accountId)
  const login = parseLoginStateId(report.origin.loginStateHandle)
  const centerId = report.origin.centerId
  if (!isOk(tenant) || !isOk(account) || !isOk(login) || !isGovernanceCenterId(centerId))
    return undefined
  if (tenant.ok.account !== account.ok) return undefined
  return { centerId, accountId: account.ok, loginStateHandle: login.ok, tenant: tenant.ok }
}

function sameOrigin(identity: RunLoginBinding, report: ActionReport): boolean {
  return (
    identity.centerId === report.origin.centerId &&
    identity.accountId === report.origin.accountId &&
    identity.loginStateHandle === report.origin.loginStateHandle
  )
}

/** Borrow one fixed governance use. Its caller owns opening and closing it. */
export async function readNewSessionIdentity(
  use: GovernanceUse,
): Promise<SessionPreparationOutcome> {
  const current = await use.run({
    action: 'invoke',
    operation: currentOperation,
    payload: {},
    readMode: 'refresh',
  })
  const currentFailure = reportBlock(current)
  if (currentFailure !== undefined) return currentFailure
  const identity = observedIdentity(current)
  if (identity === undefined) return blocked('identity-mismatch')
  const membership = await use.run({
    action: 'invoke',
    operation: membershipOperation,
    payload: { tenant: identity.tenant },
    readMode: 'refresh',
  })
  const membershipFailure = reportBlock(membership)
  if (membershipFailure !== undefined) return membershipFailure
  if (!sameOrigin(identity, membership)) return blocked('identity-mismatch')
  const standing = parseMembershipStanding(resultOf(membership, membershipOperation))
  if (!isOk(standing)) return blocked('identity-mismatch')
  if (standing.ok.standing !== 'effective') return blocked('membership-ineffective')
  return { kind: 'observed', identity: { ...identity, role: standing.ok.role } }
}
