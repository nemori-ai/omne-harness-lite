export {
  governanceSelectedDefinitionFact,
  governanceSelectedDefinitionCommand,
} from './selected-definition-projection.ts'
export { governanceSqlMigrations, governanceSqlMaterials } from './materials.ts'
export {
  createGovernanceLocal,
  createGovernanceLocalDestination,
  createGovernanceLocalSourceDestination,
  type GovernanceLocalOptions,
  type GovernanceLocalCoordination,
} from './provider.ts'
export type { GovernanceProviderClose } from './provider-lifetime.ts'
export type { AdmissionGrant as GovernanceAdmissionGrant } from './admission-schema.ts'
export type { AdoptionProjection as GovernanceAdoptionProjection } from './registrar-execution.ts'
export { ADOPTION_CURRENT as governanceAdoptionCurrentFact } from './activation-schema.ts'
export {
  adoptionEvidenceSchema as GovernanceAdoptionCurrentSchema,
  type AdoptionEvidence as GovernanceAdoptionCurrent,
} from './adoption-schema.ts'
export {
  CATALOG_CURRENT as governanceCatalogCurrentFact,
  catalogCurrentSchema as GovernanceCatalogCurrentSchema,
  catalogBindingSchema as GovernanceCatalogBindingSchema,
  type CatalogBinding as GovernanceCatalogBinding,
  type CatalogCurrent as GovernanceCatalogCurrent,
} from './catalog-schema.ts'
export { createGovernanceCollection, type GovernanceCollectionMember } from './collection.ts'
export {
  GovernanceDefinitionBindingSchema,
  GovernanceDefinitionProjectionSchema,
  governanceDefinitionProjectionFact,
  governanceDefinitionProjectionCommand,
  GOVERNANCE_DEFINITION_PROJECTION as governanceDefinitionProjectionParticipant,
  type GovernanceDefinitionBinding,
  type GovernanceDefinitionProjection,
} from './definition-projection.ts'

export {
  GovernanceTargetBindingSchema,
  GovernanceTargetProjectionSchema,
  governanceTargetProjectionFact,
  governanceTargetProjectionCommand,
  GOVERNANCE_TARGET_PROJECTION as governanceTargetProjectionParticipant,
  type GovernanceTargetBinding,
  type GovernanceTargetProjection,
} from './target-projection.ts'

export type { GovernanceSourceReservations } from './source-coordinator.ts'

export type {
  GovernancePermissionOptions,
  PermissionProjectionRequest,
  PermissionProjection,
  PermissionReadPlan,
} from './permission-reader.ts'
export {
  permissionQualificationSchema as GovernancePermissionQualificationSchema,
  type PermissionQualification as GovernancePermissionQualification,
} from './permission-qualification.ts'
export {
  permissionCurrentSchema as GovernancePermissionCurrentSchema,
  PERMISSION_CURRENT as governancePermissionCurrentFact,
  type PermissionCurrent as GovernancePermissionCurrent,
} from './permission-capture-schema.ts'

export type {
  GovernanceExternalWriteIntent,
  GovernanceExternalWriteQualification,
  GovernanceExternalWriteInput,
  GovernanceExternalWriteOptions,
  GovernanceExternalWriteOutcome,
  GovernanceExternalWrites,
} from './external-write.ts'

export {
  governanceExternalWriteBasisFact,
  governanceExternalWriteResultFact,
  GovernanceExternalWriteExecutionSchema,
  type GovernanceExternalWriteExecution,
  GovernanceExternalWriteBasisSchema,
  GovernanceExternalWriteResultSchema,
  type GovernanceExternalWriteBasis,
  type GovernanceExternalWriteResult,
} from './external-write-protocol.ts'
