// capability.organization-governance v1 的提供者。契约：.meta_harness/design/spec/capabilities/organization-governance/v1/contract.md；
// 节点设计：.meta_harness/design/realization/packages/tenancy/organization-governance/design.md。
export * from './types.ts'
export {
  organizationGovernancePlugin,
  OrganizationGovernanceConfigSchema,
  STORAGE_SERVICE,
  CLOCK_SERVICE,
} from './plugin.ts'
export {
  organizationGovernanceMigrations,
  OG_TABLES,
  type OrganizationGovernanceMigrationOptions,
} from './migrations.ts'
export { StoredRecordMalformed } from './records.ts'
export { ParentChainCycle } from './organizations.ts'
