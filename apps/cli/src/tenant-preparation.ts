import type { ActionReport, GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import {
  isOk,
  parseMembershipStanding,
  parseOpaqueIdentifier,
  parseOrganizationId,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { parseOrganizationName } from '@omne-harness-lite/organization-governance'
import {
  reportBlock,
  resultOf,
  sameOrigin,
  validRunLoginBinding,
  type RunLoginBinding,
  type SessionPreparationOutcome,
} from './session-preparation.ts'

export type CreatedTenantPreparation =
  | { readonly kind: 'invalid-input' }
  | { readonly kind: 'unresolved'; readonly report: ActionReport }
  | {
      readonly kind: 'created'
      readonly tenant: TenantId
      readonly report: ActionReport
      readonly preparation:
        | Extract<SessionPreparationOutcome, { kind: 'blocked' }>
        | {
            readonly kind: 'observed'
            readonly identity: Extract<SessionPreparationOutcome, { kind: 'observed' }>['identity']
            readonly name: string
          }
    }

/** The caller retains the original request before this borrowed use can perform IO. */
export async function createTenantOrganization(
  use: GovernanceUse,
  login: RunLoginBinding,
  name: unknown,
  creationKey: unknown,
): Promise<CreatedTenantPreparation> {
  const parsedName = parseOrganizationName(name)
  const parsedKey = parseOpaqueIdentifier(creationKey, 'CreationKey')
  if (!validRunLoginBinding(login) || !isOk(parsedName) || !isOk(parsedKey))
    return { kind: 'invalid-input' }
  const report = await use.run({
    action: 'invoke',
    operation: createOperation,
    payload: { name: parsedName.ok, creationKey: parsedKey.ok },
  })
  if (reportBlock(report) !== undefined || !sameOrigin(login, report))
    return { kind: 'unresolved', report }
  const organization = parseOrganizationId(resultOf(report, createOperation))
  if (!isOk(organization)) return { kind: 'unresolved', report }
  const tenant: TenantId = { organization: organization.ok, account: login.accountId }
  return {
    kind: 'created',
    tenant,
    report,
    preparation: await prepareCreatedTenant(use, login, tenant, parsedName.ok),
  }
}

const createOperation = 'capability.organization-governance/v2#S-21'
const readOperation = 'capability.organization-governance/v2#S-22'
const membershipOperation = 'capability.organization-governance/v2#S-26'
type Preparation = Extract<CreatedTenantPreparation, { kind: 'created' }>['preparation']

function readBlock(
  login: RunLoginBinding,
  report: ActionReport,
): Extract<SessionPreparationOutcome, { kind: 'blocked' }> | undefined {
  const block = reportBlock(report)
  if (block !== undefined) return block
  return sameOrigin(login, report) ? undefined : { kind: 'blocked', reason: 'identity-mismatch' }
}

function verifiedCenterName(
  report: ActionReport,
  tenant: TenantId,
  expectedName: string,
): string | undefined {
  const data = resultOf(report, readOperation)
  if (
    typeof data !== 'object' ||
    data === null ||
    !('organization' in data) ||
    !('organizationKind' in data) ||
    !('name' in data)
  )
    return undefined
  if (data.organization !== tenant.organization || data.organizationKind !== 'team')
    return undefined
  const name = parseOrganizationName(data.name)
  return isOk(name) && name.ok === expectedName ? name.ok : undefined
}

async function prepareCreatedTenant(
  use: GovernanceUse,
  login: RunLoginBinding,
  tenant: TenantId,
  expectedName: string,
): Promise<Preparation> {
  const organization = await use.run({
    action: 'invoke',
    operation: readOperation,
    payload: { organization: tenant.organization },
    readMode: 'refresh',
  })
  const organizationBlock = readBlock(login, organization)
  if (organizationBlock !== undefined) return organizationBlock
  const name = verifiedCenterName(organization, tenant, expectedName)
  if (name === undefined) return { kind: 'blocked', reason: 'identity-mismatch' }
  const membership = await use.run({
    action: 'invoke',
    operation: membershipOperation,
    payload: { tenant },
    readMode: 'refresh',
  })
  const membershipBlock = readBlock(login, membership)
  if (membershipBlock !== undefined) return membershipBlock
  const standing = parseMembershipStanding(resultOf(membership, membershipOperation))
  if (!isOk(standing)) return { kind: 'blocked', reason: 'identity-mismatch' }
  if (standing.ok.standing !== 'effective')
    return { kind: 'blocked', reason: 'membership-ineffective' }
  return { kind: 'observed', identity: { ...login, tenant, role: standing.ok.role }, name }
}
