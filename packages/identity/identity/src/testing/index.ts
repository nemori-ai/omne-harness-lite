// The `./testing` entry, for tests only (SPEC ID-17, ID-18): the in-process reference doubles of the
// identity operations and of the governance port over shared records, a manual clock, adjustable
// login and invitation terms and a record store fault switch to inject into them, and the two
// contract suites that the doubles and any later provider run. Product code does not import it.
export { checkIdentityOperationsContract, IDENTITY_CONTRACT_CASES } from './contract.ts'
export type {
  IdentityContractCaseResult,
  IdentityContractFixture,
  IdentityContractOptions,
  IdentityContractProviderOptions,
  IdentityContractReport,
} from './contract.ts'
export {
  adjustableInvitationTerms,
  adjustableLoginTerms,
  manualIdentityClock,
  recordStoreFaults,
} from './controls.ts'
export type {
  AdjustableInvitationTerms,
  AdjustableLoginTerms,
  ManualIdentityClock,
  RecordStore,
  RecordStoreFaultControl,
  RecordStoreFaults,
} from './controls.ts'
export { inProcessIdentityOperations } from './double.ts'
export type { InProcessIdentityOptions } from './double.ts'
export {
  checkIdentityGovernanceContract,
  IDENTITY_GOVERNANCE_CONTRACT_CASES,
} from './governance-contract.ts'
export type {
  IdentityGovernanceContractCaseResult,
  IdentityGovernanceContractFixture,
  IdentityGovernanceContractOptions,
  IdentityGovernanceContractProviderOptions,
  IdentityGovernanceContractReport,
  IdentityProviders,
} from './governance-contract.ts'
export { inProcessIdentity } from './governance-double.ts'
export type { InProcessIdentity, InProcessIdentityGovernanceOptions } from './governance-double.ts'
