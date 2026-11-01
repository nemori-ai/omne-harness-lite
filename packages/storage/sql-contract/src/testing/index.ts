// The testing entry: the memory doubles and the conformance suites. Durability of the doubles is none.
export { createMemorySqlStorage } from './memory.ts'
export type { MemorySqlStorageInput, MemorySqlStorageLimits } from './memory.ts'
export { runSqlStorageConformance } from './conformance.ts'
export type { SqlConformanceFailure, SqlConformanceSubject } from './conformance.ts'
export {
  createMemoryTenantDomainLookup,
  runTenantDomainLookupConformance,
} from './tenant-domain-lookup.ts'
export type {
  MemoryTenantDomainLookup,
  TenantDomainLookupFixture,
  TenantDomainLookupVerdicts,
} from './tenant-domain-lookup.ts'
