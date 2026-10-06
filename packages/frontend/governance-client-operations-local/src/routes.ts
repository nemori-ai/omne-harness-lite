export const AR8 = 'composition.account-registration/v2#S-8'
export const AI15 = 'capability.account-identity/v3#S-15'
export const AI16 = 'capability.account-identity/v3#S-16'
export const AI37 = 'capability.account-identity/v3#S-37'
export const AI50 = 'capability.account-identity/v3#S-50'
export const ENTRY50 = 'composition.governance-center-entry/v2#S-50'
export const og = (n: number): string => `capability.organization-governance/v2#S-${n}`
export const OG36 = og(36)
export const READ_OPERATIONS: ReadonlySet<string> = new Set([
  AI37,
  ...[22, 26, 27, 34, 35, 36, 55, 56, 57, 58, 59, 60].map(og),
])
