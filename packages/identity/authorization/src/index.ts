// Public entry of authorization. The admission decision and its port, the system action decision
// and its port, permits with their consumption facts, the checkable evidence, and the in-process
// reference pieces. SPEC.md owns the
// behavior that these types cannot express.
export { decideAdmission } from './admission.ts'
export type {
  AdmissionBasis,
  AdmissionCheck,
  AdmissionDecision,
  AdmissionFacts,
  AdmissionInput,
  DenialReason,
  StandingBasis,
} from './admission.ts'
export {
  canonicalText,
  decisionEvidence,
  digestOf,
  effectiveArgumentsOf,
  noArguments,
} from './evidence.ts'
export type { DecisionEvidence, DurableEvidence, EffectiveArguments } from './evidence.ts'
export { operationEquals, targetEquals } from './operation.ts'
export type { AdmissionOperation, AdmissionTarget } from './operation.ts'
export { PERMIT_ID_MAX_LENGTH, decodePermitId, inMemoryPermitLedger } from './permit.ts'
export type {
  ConsumeOutcome,
  ConsumerPosition,
  ConsumptionFact,
  GrantOutcome,
  PermitGrant,
  PermitGrantor,
  PermitId,
  PermitIdFailure,
  PermitLedger,
  PermitLookup,
  PermitRef,
  PermitState,
} from './permit.ts'
export { referenceAdmissionCheck } from './reference.ts'
export type { ReferenceAdmissionDependencies } from './reference.ts'
export { decideSystemAction } from './system-action.ts'
export type {
  ExpiryReading,
  MaintenanceGrant,
  MaintenanceGrantReading,
  SystemActionAuthorization,
  SystemActionBasis,
  SystemActionDecision,
  SystemActionDenial,
  SystemActionFacts,
  SystemActionRequest,
  SystemActionTarget,
} from './system-action.ts'
export { SYSTEM_ACTION_MATRIX } from './system-matrix.ts'
export type { SystemActionRow } from './system-matrix.ts'
export { referenceSystemActionAuthorization } from './system-reference.ts'
export type {
  MaintenanceGrantSource,
  SystemActionClock,
  SystemActionDependencies,
} from './system-reference.ts'
