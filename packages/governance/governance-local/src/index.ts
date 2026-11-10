export {
  governanceSelectedDefinitionFact,
  governanceSelectedDefinitionCommand,
} from './selected-definition-projection.ts'
export { governanceSqlMaterials } from './materials.ts'
export {
  createGovernanceLocal,
  createGovernanceLocalDestination,
  type GovernanceLocalOptions,
  type GovernanceLocalCoordination,
} from './provider.ts'
export type { GovernanceProviderClose } from './provider-lifetime.ts'
export type { GovernanceProjectionRead } from './catalog.ts'
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
