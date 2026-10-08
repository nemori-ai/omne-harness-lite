import type { CliCatalog } from './catalog.ts'
import type { GovernanceChoices, TenantChoice, InvitationChoice } from './governance-input.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import { usingSelectedTenant } from './selected-tenant-work.ts'
import { usingGovernanceUse } from './governance-use-work.ts'
import {
  readCurrentLogin,
  reportBlock,
  resultOf,
  sameOrigin,
  type RunLoginBinding,
} from './session-preparation.ts'
import type { GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import {
  isOk,
  parseTenantId,
  parseMembershipStanding,
  parseOpaqueIdentifier,
  parseOrganizationId,
  parseTenantRole,
} from '@omne-harness-lite/identity-values'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import { parseOfferTiming, OFFER_STATES } from '@omne-harness-lite/offer-expiry'
import { InputFailure } from './diagnostic.ts'
import { tenantReference } from './tenant-reference.ts'
import type { TenantBinding } from './state-layout.ts'

export interface ChoicePolicy {
  readonly maxChoices: number
}
const og = (n: number) => `capability.organization-governance/v2#S-${n}`
const unavailable = (): never => {
  throw new InputFailure('input-unavailable')
}
export function createGovernanceChoices(
  home: string,
  catalog: CliCatalog,
  signal: AbortSignal,
  policy: ChoicePolicy,
  factory?: PreparedFactory,
): GovernanceChoices {
  const limit = policy.maxChoices
  if (!Number.isSafeInteger(limit) || limit < 1) throw new InputFailure('invalid-options')
  return {
    centers: async () => {
      const profiles = await catalog.listCenters()
      boundedList(profiles, limit)
      return profiles
    },
    tenants: () =>
      readChoices(
        home,
        catalog,
        signal,
        (use, login, selected) => tenantChoices(use, login, selected, limit),
        factory,
      ),
    invitations: () =>
      readChoices(
        home,
        catalog,
        signal,
        (use, login) => invitationChoices(use, login, limit),
        factory,
      ),
  }
}
async function readChoices<T>(
  home: string,
  catalog: CliCatalog,
  signal: AbortSignal,
  work: (
    use: GovernanceUse,
    login: RunLoginBinding,
    selected: TenantBinding,
  ) => Promise<readonly T[]>,
  factory?: PreparedFactory,
): Promise<readonly T[]> {
  const result = await usingSelectedTenant(
    home,
    catalog,
    signal,
    async ports => {
      const opened = await ports.client.openUse()
      if (opened.kind !== 'use') return unavailable()
      return usingGovernanceUse(opened.use, async use => {
        const current = await readCurrentLogin(use)
        if (current.kind !== 'observed') return unavailable()
        if (
          current.login.centerId !== ports.selection.selected.centerId ||
          current.login.accountId !== ports.selection.selected.tenant.account
        )
          return unavailable()
        return work(use, current.login, ports.selection.selected)
      })
    },
    factory,
  )
  if (result.diagnostics.length) throw new Error('candidate reader cleanup failed')
  if (!Array.isArray(result.outcome)) return unavailable()
  return result.outcome as readonly T[]
}
async function currentResult(
  use: GovernanceUse,
  login: RunLoginBinding,
  operation: string,
  payload: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const report = await use.run({ action: 'invoke', operation, payload, readMode: 'refresh' })
  if (reportBlock(report) || !sameOrigin(login, report)) return unavailable()
  return resultOf(report, operation)
}
function boundedList(value: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(value)) return unavailable()
  if (value.length > limit) throw new InputFailure('input-too-large')
  return value
}
async function tenantChoices(
  use: GovernanceUse,
  login: RunLoginBinding,
  selected: TenantBinding,
  limit: number,
): Promise<readonly TenantChoice[]> {
  const rows = boundedList(await currentResult(use, login, og(27), {}), limit)
  const choices: TenantChoice[] = [],
    seen = new Set<string>()
  for (const row of rows) {
    const tenant = parseTenantId(row)
    if (!isOk(tenant) || tenant.ok.account !== login.accountId) return unavailable()
    const standing = parseMembershipStanding(
      await currentResult(use, login, og(26), { tenant: tenant.ok }),
    )
    if (!isOk(standing)) return unavailable()
    if (standing.ok.standing !== 'effective') continue
    const name = await organizationName(use, login, tenant.ok.organization)
    const binding = { formatVersion: 1 as const, centerId: login.centerId, tenant: tenant.ok }
    const reference = tenantReference(binding)
    if (seen.has(reference)) return unavailable()
    seen.add(reference)
    choices.push({
      binding,
      reference,
      label: `${reference === tenantReference(selected) ? 'Current local selection / ' : ''}${name} / ${tenant.ok.organization} / ${login.accountId} / ${standing.ok.role} / ${login.centerId}`,
    })
  }
  return choices
}
async function organizationName(
  use: GovernanceUse,
  login: RunLoginBinding,
  organization: string,
): Promise<string> {
  const result = await currentResult(use, login, og(22), { organization })
  if (!object(result) || result.organization !== organization) return unavailable()
  const name = parseOrganizationName(result.name)
  return isOk(name) ? name.ok : unavailable()
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
async function invitationChoices(
  use: GovernanceUse,
  login: RunLoginBinding,
  limit: number,
): Promise<readonly InvitationChoice[]> {
  const rows = boundedList(await currentResult(use, login, og(57), {}), limit)
  const choices: InvitationChoice[] = [],
    seen = new Set<string>()
  for (const row of rows) {
    const invitation = invitationChoice(row, login)
    if (invitation === null) continue
    if (seen.has(invitation.id)) return unavailable()
    seen.add(invitation.id)
    choices.push(invitation)
  }
  return choices
}
function invitationChoice(value: unknown, login: RunLoginBinding): InvitationChoice | null {
  if (!object(value) || value.invitedAccount !== login.accountId) return unavailable()
  const id = parseOpaqueIdentifier(value.invitation, 'InvitationId'),
    issuer = parseOrganizationId(value.issuerOrganization),
    role = parseTenantRole(value.role),
    timing = parseOfferTiming(value.offerTiming)
  if (!isOk(id) || !isOk(issuer) || !isOk(role) || !isOk(timing)) return unavailable()
  if (!OFFER_STATES.some(state => state === value.offerState)) return unavailable()
  if (value.offerState !== 'pending') return null
  const times = value.offerTiming as { expiresAt: string }
  return {
    id: id.ok,
    label: `${issuer.ok} / ${login.accountId} / ${role.ok} / expires ${times.expiresAt} / ${login.centerId}`,
  }
}
