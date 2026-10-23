// Public entry of authorization. The admission decision and its port, permits with their
// consumption facts, the checkable evidence, and the in-process reference pieces. SPEC.md owns the
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
export { canonicalText, decisionEvidence, digestOf } from './evidence.ts'
export type { DecisionEvidence, EvidenceRef } from './evidence.ts'
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
