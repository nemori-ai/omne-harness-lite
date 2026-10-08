import type { ActionReport, GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import type { SelectedTenantPorts, SelectionBlocked } from './selected-tenant-work.ts'
import type { TenantBinding } from './state-layout.ts'
import type { TenantAuthOutcome } from './tenant-auth.ts'
import { prepareTenantAuth } from './tenant-auth.ts'
import {
  readCurrentLogin,
  readNewSessionIdentity,
  reportBlock,
  resultOf,
  sameOrigin,
  type RunLoginBinding,
  type SessionIdentityObservation,
} from './session-preparation.ts'
import {
  isOk,
  parseMembershipStanding,
  parseTenantId,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { tenantReference } from './tenant-reference.ts'
import { StateLayoutFailure } from './state-layout.ts'
import { ClientStateOpenFailure } from '@omne-harness-lite/client-local-state-sqlite'

export type TenantMembershipOutcome =
  | { readonly kind: 'unconfirmed'; readonly operationId: string }
  | SelectionBlocked
  | { readonly kind: 'governance-result'; readonly report: ActionReport }
  | {
      readonly kind: 'tenant-prepared'
      readonly action: 'add' | 'switch'
      readonly report: ActionReport
      readonly binding: TenantBinding
      readonly reference: string
      readonly auth: TenantAuthOutcome
      readonly selection: 'unchanged' | 'selected' | 'conflict' | 'unconfirmed' | 'not-requested'
    }
export type TenantMembershipInput =
  | { readonly action: 'add'; readonly invitation: string; readonly operationId: string }
  | { readonly action: 'switch'; readonly target: TenantBinding; readonly operationId: string }

export async function runTenantMembershipCommand(
  input: TenantMembershipInput,
  ports: SelectedTenantPorts,
  use: GovernanceUse,
): Promise<TenantMembershipOutcome> {
  const captured = structuredClone(input)
  if (captured.action === 'switch' && !sameAccountCenter(captured.target, ports.selection.selected))
    return { kind: 'blocked', reason: 'identity-mismatch' }
  const login = await commandLogin(captured, ports, use)
  if (login.kind === 'blocked') return login
  if (captured.action === 'add') return acceptTenant(captured, ports, use, login.login)
  return switchTenant(captured, ports, use, login.login)
}

const og = (n: number) => `capability.organization-governance/v2#S-${n}`
function sameAccountCenter(a: TenantBinding, b: TenantBinding): boolean {
  return a.centerId === b.centerId && a.tenant.account === b.tenant.account
}
async function commandLogin(
  input: TenantMembershipInput,
  ports: SelectedTenantPorts,
  use: GovernanceUse,
): Promise<{ kind: 'observed'; login: RunLoginBinding } | SelectionBlocked> {
  const observation =
    input.action === 'add' ? await readCurrentLogin(use) : await readNewSessionIdentity(use)
  if (observation.kind === 'blocked') return observation
  const login = 'login' in observation ? observation.login : observation.identity
  const selected = ports.selection.selected
  if (login.centerId !== selected.centerId || login.accountId !== selected.tenant.account)
    return { kind: 'blocked', reason: 'identity-mismatch' }
  if (
    'identity' in observation &&
    observation.identity.tenant.organization !== selected.tenant.organization
  )
    return { kind: 'blocked', reason: 'identity-mismatch' }
  return { kind: 'observed', login }
}
async function acceptTenant(
  input: Extract<TenantMembershipInput, { action: 'add' }>,
  ports: SelectedTenantPorts,
  use: GovernanceUse,
  login: RunLoginBinding,
): Promise<TenantMembershipOutcome> {
  const report = await use.run({
    action: 'invoke',
    operation: og(25),
    payload: { invitation: input.invitation },
  })
  if (reportBlock(report) || !sameOrigin(login, report))
    return { kind: 'governance-result', report }
  const tenant = parseTenantId(resultOf(report, og(25)))
  if (!isOk(tenant) || tenant.ok.account !== login.accountId)
    return { kind: 'blocked', reason: 'identity-mismatch' }
  const prepared = await targetIdentity(use, login, tenant.ok)
  if (prepared.kind === 'blocked') return { ...prepared, report }
  const auth = await installAuth(ports, prepared.identity, input.operationId, 'empty-only')
  if ('kind' in auth) return { ...auth, report }
  const binding: TenantBinding = { formatVersion: 1, centerId: login.centerId, tenant: tenant.ok }
  return {
    kind: 'tenant-prepared',
    action: 'add',
    report,
    binding,
    reference: tenantReference(binding),
    auth,
    selection: 'unchanged',
  }
}
async function switchTenant(
  input: Extract<TenantMembershipInput, { action: 'switch' }>,
  ports: SelectedTenantPorts,
  use: GovernanceUse,
  login: RunLoginBinding,
): Promise<TenantMembershipOutcome> {
  const prepared = await targetIdentity(use, login, input.target.tenant)
  if (prepared.kind === 'blocked') return prepared
  const auth = await installAuth(
    ports,
    prepared.identity,
    input.operationId,
    'replace-same-account',
  )
  if ('kind' in auth) return auth
  if (auth.login.kind === 'unconfirmed')
    return { kind: 'unconfirmed', operationId: input.operationId }
  if (auth.login.kind === 'blocked') return { kind: 'blocked', reason: auth.login.reason }
  const report = await use.run({
    action: 'invoke',
    operation: og(37),
    payload: { targetTenant: input.target.tenant, expectedTenant: ports.selection.selected.tenant },
  })
  const known =
    reportBlock(report) === undefined &&
    sameOrigin(login, report) &&
    resultOf(report, og(37)) === 'ok'
  const selection = known
    ? await ports.catalog.selectTenant(ports.selection, input.target, input.operationId)
    : 'not-requested'
  return {
    kind: 'tenant-prepared',
    action: 'switch',
    report,
    binding: input.target,
    reference: tenantReference(input.target),
    auth,
    selection,
  }
}
async function targetIdentity(
  use: GovernanceUse,
  login: RunLoginBinding,
  tenant: TenantId,
): Promise<{ kind: 'observed'; identity: SessionIdentityObservation } | SelectionBlocked> {
  const report = await use.run({
    action: 'invoke',
    operation: og(26),
    payload: { tenant },
    readMode: 'refresh',
  })
  const blocked = reportBlock(report)
  if (blocked) return blocked
  if (!sameOrigin(login, report)) return { kind: 'blocked', reason: 'identity-mismatch' }
  const standing = parseMembershipStanding(resultOf(report, og(26)))
  if (!isOk(standing)) return { kind: 'blocked', reason: 'identity-mismatch' }
  if (standing.ok.standing !== 'effective')
    return { kind: 'blocked', reason: 'membership-ineffective' }
  return { kind: 'observed', identity: { ...login, tenant, role: standing.ok.role } }
}
async function installAuth(
  ports: SelectedTenantPorts,
  identity: SessionIdentityObservation,
  operationId: string,
  replacement: 'empty-only' | 'replace-same-account',
): Promise<TenantAuthOutcome | SelectionBlocked> {
  try {
    return await prepareTenantAuth(ports.home, ports.source, identity, operationId, replacement)
  } catch (error) {
    if (error instanceof StateLayoutFailure || error instanceof ClientStateOpenFailure)
      return { kind: 'blocked', reason: error.reason }
    throw error
  }
}
