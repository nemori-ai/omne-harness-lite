import { isTestPath } from '@omne-harness/repo-toolchain/core/rule'

export const TENANCY = 'tenancy/'

export const ENTRY_PACKAGE = 'tenancy/governance-center-entry-node/'
export const ENTRY_SRC = `${ENTRY_PACKAGE}src/`
export const ENTRY_OPS = `${ENTRY_SRC}ops/`
export const ENTRY_EVENTS = 'core/governance-center-entry/src/events.ts'
export const ENTRY_EVENTS_PACKAGE = '@omne-harness/governance-center-entry'
export const ENTRY_TRANSPORT = `${ENTRY_SRC}transport/`

export const ACCOUNT_IDENTITY = 'tenancy/account-identity-sql/'
export const ACCOUNT_IDENTITY_SRC = `${ACCOUNT_IDENTITY}src/`
export const ACCOUNT_IDENTITY_RANDOM_MODULE = `${ACCOUNT_IDENTITY_SRC}presentation.ts`
export const ACCOUNT_IDENTITY_PLUGIN_MODULE = `${ACCOUNT_IDENTITY_SRC}plugin.ts`

export const ACCOUNT_REGISTRATION = 'tenancy/account-registration-sequential/'
export const ACCOUNT_REGISTRATION_SRC = `${ACCOUNT_REGISTRATION}src/`
export const ACCOUNT_REGISTRATION_DEFINITION_SRC = 'core/account-registration/src/'
export const CREDENTIAL_VERIFICATION = 'tenancy/credential-verification-scrypt/'
export const ORGANIZATION_GOVERNANCE = 'tenancy/organization-governance-sql/'
export const ORGANIZATION_GOVERNANCE_DEFINITION = 'core/organization-governance/'
export const OFFER_EXPIRY = 'core/offer-expiry/'

export function productSourceIn(path: string, dir: string): boolean {
  return path.startsWith(dir) && !isTestPath(path)
}

export function tenancyPackageOf(path: string): string | undefined {
  const m = /^tenancy\/([^/]+)\/src\//.exec(path)
  return m === null || isTestPath(path) ? undefined : m[1]
}
