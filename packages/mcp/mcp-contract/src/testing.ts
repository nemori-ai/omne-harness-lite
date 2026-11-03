// The `./testing` entry: conformance suites of the five requirement ports, in-memory doubles
// that pass them, and the exhaustive sample tables of `classifyOutcome` and `mergeListing`.
// Product code does not import it. A double keeps nothing durable; do not assemble it into a
// product.
export {
  NotApplicable,
  isNotApplicable,
  runConformanceCase,
  type CaseVerdict,
  type ConformanceCase,
} from './testing-case.ts'
export {
  createMemoryAdoptionView,
  mcpAdoptionViewConformance,
  type AdoptionViewFixture,
  type MemoryAdoption,
  type MemoryAdoptionView,
} from './testing-adoption.ts'
export {
  createMemoryUseEligibility,
  mcpUseEligibilityConformance,
  type MemoryUseEligibility,
  type UseEligibilityFixture,
} from './testing-eligibility.ts'
export {
  createMemoryCredentialUse,
  mcpCredentialUseConformance,
  type CredentialUseFixture,
  type MemoryCredentialUse,
} from './testing-credentials.ts'
export {
  createMemoryProcessLanding,
  mcpProcessLandingConformance,
  type MemoryProcessLanding,
  type ProcessLandingFixture,
} from './testing-landing.ts'
export {
  createMemoryCatalogStore,
  mcpCatalogStoreConformance,
  type CatalogStoreFixture,
  type MemoryCatalogStore,
} from './testing-catalog-store.ts'
export { classifyOutcomeCases, type ClassifyOutcomeCase } from './testing-outcome-cases.ts'
export { mergeListingCases, type MergeListingCase } from './testing-listing-cases.ts'
