// data.identity-values v1 的纯模块。公开入口以 realization 节点 core/identity-values 的投影表为准。
export { type Parsed, ok, invalidInput, isOk, unwrap } from './parsed.ts'
export {
  type Branded,
  type OpaqueIdentifier,
  parseOpaqueIdentifier,
  opaqueIdentifierEquals,
} from './opaque.ts'
export {
  type AccountId,
  type OrganizationId,
  type LoginStateId,
  type LoginIdentifier,
  type OrganizationKind,
  type TenantRole,
  type TenantId,
  type MembershipStanding,
  type MembershipStandingResult,
  type ScopeLayerIdentity,
  ORGANIZATION_KINDS,
  TENANT_ROLES,
  parseAccountId,
  parseOrganizationId,
  parseLoginStateId,
  parseLoginIdentifier,
  parseOrganizationKind,
  parseTenantRole,
  parseTenantId,
  tenantIdEquals,
  toCanonicalJson,
  parseMembershipStanding,
  parseMembershipStandingResult,
  parseScopeLayerIdentity,
} from './values.ts'
export {
  type ParentSnapshot,
  type ChainResult,
  type ShareAncestorResult,
  sameAccountDistinctTenants,
  ancestorChain,
  shareAncestor,
} from './predicates.ts'
export {
  type SchemaDefName,
  type SchemaValidation,
  SCHEMA_DEF_NAMES,
  validate,
  schemaId,
} from './validate.ts'
export {
  type HandoffWarrant,
  type WarrantPurpose,
  type HandoffKeyPairPem,
  type SigningKey,
  type VerificationKey,
  type WarrantVerification,
  handoffWarrant,
  parseHandoffWarrant,
  generateHandoffKeyPair,
  loadSigningKey,
  loadVerificationKey,
  issue as issueHandoffWarrant,
  verifyWarrant as verifyHandoffWarrant,
} from './handoff-warrant.ts'
export { generateOpaqueIdentifier } from './identifier.ts'
