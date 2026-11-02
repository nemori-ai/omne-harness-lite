// Root entry of the identity SQL provider. No Cordis import (IC-4): the plugin is in `./cordis`.
// The factory consumes the identity, scrypt and SQL storage contracts; the materials and the
// registration are what an application aggregates into its catalog and what the plugin registers.
export {
  createIdentitySql,
  CREDENTIAL_UTF8_LIMIT,
  LOGIN_IDENTIFIER_UTF8_LIMIT,
} from './provider.ts'
export type { IdentitySql, IdentitySqlInput, IdentitySqlResultUnknown } from './provider.ts'
export { randomIdentifiers } from './identifiers.ts'
export type { IdentifierSource } from './identifiers.ts'
export {
  IDENTITY_DOMAIN,
  IDENTITY_PARTICIPANT,
  IDENTITY_SCOPE,
  identitySqlCombination,
  identitySqlMaterials,
  identitySqlRegistration,
} from './materials.ts'
export type { IdentitySqlCombination, IdentitySqlMaterials } from './materials.ts'
export {
  constantLoginTerms,
  IDENTITY_SQL_DEFAULT_CONFIG,
  parseIdentitySqlConfig,
} from './config.ts'
export type { ConfigProblem, IdentitySqlConfig, IdentitySqlConfigJudgement } from './config.ts'
