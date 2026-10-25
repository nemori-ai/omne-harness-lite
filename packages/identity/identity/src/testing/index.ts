// The `./testing` entry, for tests only (SPEC ID-17): the in-process reference double of the
// identity operations, a manual clock, adjustable login terms and a record store fault switch to
// inject into it, and the contract suite that the double and any later provider run. Product code
// does not import it.
export { checkIdentityOperationsContract, IDENTITY_CONTRACT_CASES } from './contract.ts'
export type {
  IdentityContractCaseResult,
  IdentityContractFixture,
  IdentityContractOptions,
  IdentityContractProviderOptions,
  IdentityContractReport,
} from './contract.ts'
export { adjustableLoginTerms, manualIdentityClock, recordStoreFaults } from './controls.ts'
export type {
  AdjustableLoginTerms,
  ManualIdentityClock,
  RecordStore,
  RecordStoreFaultControl,
  RecordStoreFaults,
} from './controls.ts'
export { inProcessIdentityOperations } from './double.ts'
export type { InProcessIdentityOptions } from './double.ts'
