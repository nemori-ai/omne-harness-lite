// The access plugin of `assets/v1`: the contribution (four setting handlers) and the two ports it
// asks the assembly for. The Cordis binding is `./cordis`.
export { createAssetsContribution, type AssetsContributionInput } from './contribution.ts'
export type { TargetTenantPrincipals, TenantSettingsPort } from './ports.ts'
