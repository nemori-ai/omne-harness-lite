import type { SourceFile } from '../../src/core/rule.ts'

const sources: Readonly<Record<string, string>> = {
  'tenancy/account-identity-sql/src/logins.ts': `
function login(snapshot: Snapshot) {
  this.deps.diagnostics.error('random-source-unavailable', { cause: 'unavailable' })
  return credentials.verify(
    snapshot.credential_material as CredentialMaterial,
    presented,
  )
}
`,
  'tenancy/account-identity-sql/src/accounts.ts': `
function createAccount() {
  return this.deps.persistence.write(async tx => {
    return tx.insert(account)
  })
}
`,
  'tenancy/account-identity-sql/src/plugin.ts': 'const deps = { random: cryptoRandomSource }',
  'tenancy/account-identity-sql/src/presentation.ts': `
import { randomBytes } from 'node:crypto'
export const cryptoRandomSource = size => randomBytes(size)
`,
  'tenancy/account-identity-sql/src/deps.ts': 'interface Deps { readonly random: RandomSource }',
  'tenancy/account-identity-sql/src/records.ts':
    'interface AccountRecord { readonly material: CredentialMaterial }',
  'tenancy/account-identity-sql/src/schema.ts':
    'interface AccountTable { credential_material: string }',
  'tenancy/account-identity-sql/src/identity-data.ts':
    'export interface AccountRow { account_id: string }',
  'tenancy/organization-governance-sql/src/records.ts':
    'interface InvitationRecord { readonly settled: SettledState | null }',
  'core/organization-governance/src/types.ts': 'type SettledState = "accepted" | "withdrawn"',
  'tenancy/organization-governance-sql/src/offers.ts': `
function acceptInvitation(state: OfferState) {
  if (!acceptable(state)) return fail('offerNoLongerValid')
  return succeed()
}
function acceptAffiliationRequest(state: OfferState) {
  if (!acceptable(state)) return fail('offerNoLongerValid')
  return succeed()
}
`,
  'core/account-registration/src/types.ts': `
export const TERMINAL_OUTCOMES = ['registered', 'identifier-taken', 'credential-rejected', 'interrupted'] as const
export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number]
`,
  'tenancy/account-registration-sequential/src/index.ts': `
export async function register(): Promise<TerminalOutcome> {
  return 'registered'
}
`,
  'tenancy/organization-governance-sql/src/plugin.ts': `
const purge = new OrganizationPurgeSqlService(ctx, deps)
ctx.provide(ORGANIZATION_PURGE_SERVICE, purge)
`,
}

export function contractSource(path: string): SourceFile {
  const text = sources[path]
  if (text === undefined) throw new Error(`Missing checker fixture: ${path}`)
  return { path, text }
}

export const hostPolicySource = `
import { ORGANIZATION_PURGE_SERVICE } from '@omne-harness/organization-governance/cordis'
const required: Readonly<Record<string, readonly string[]>> = {
  organizations: [ORGANIZATION_PURGE_SERVICE],
}
function missing(name: string, row: Declaration) {
  return required[name].some(key => !row.provides.includes(key))
}
`
