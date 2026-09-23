// 凭据校验提供者。契约来源：capability.account-identity S-8（凭据材料）、S-26（credential_policy）；
// 节点设计：.meta_harness/design/realization/packages/tenancy/credential-verification/design.md。
export type {
  PresentedCredential,
  CredentialMaterial,
  VerifyResult,
  ScryptParameters,
  DerivationParameters,
} from './scrypt.ts'
export { PASSWORD_SCRYPT_SCHEME } from './scrypt.ts'
export {
  type PolicyCheck,
  PasswordPolicy,
  CHARACTER_CLASSES,
  type CharacterClass,
} from './policy.ts'
export type { CredentialsService } from './service.ts'
export { CREDENTIALS_SERVICE, CredentialVerificationConfig, credentialsPlugin } from './plugin.ts'
