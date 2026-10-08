export * from './execution-environments.ts'
export * from './facilities.ts'
export * from './terminal.ts'
export * from './file-facility.ts'
export * from './placement.ts'
export {
  captureEnvironmentScope,
  captureEnvironmentReference,
  captureEnvironmentRequirement,
  captureEnvironmentCall,
  captureEnvironmentPlacement,
  captureEnvironmentDescription,
  captureEnvironmentAdoption,
  sameEnvironmentScope,
  environmentBelongsTo,
  environmentVisibleInScope,
  matchesEnvironmentRequirement,
} from './data.ts'
export {
  captureCommandRequest,
  captureEnvironmentFacilities,
  isCommandProcess,
} from './facility-data.ts'

export {
  captureFileArguments,
  captureCommandArguments,
  commandFacilityMethods,
  fileFacilityMethods,
} from './facility-arguments.ts'
export { captureFileResult, captureCommandResult } from './facility-results.ts'
