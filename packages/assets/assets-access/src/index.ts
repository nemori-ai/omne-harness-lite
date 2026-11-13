// The access plugin of `assets/v1`: the contribution (four setting handlers) and the ports it asks
// the assembly for. The Cordis binding is `./cordis`.
export { createAssetsContribution, type AssetsContributionInput } from './contribution.ts'
export type {
  AssetQuery,
  AssetRef,
  Editable,
  Presence,
  ReadRefusal,
  SecretState,
  SettingInput,
  SettingJson,
  SettingView,
  TargetTenantPrincipals,
  TenantSettingsPort,
  WriteOutcome,
} from './ports.ts'
