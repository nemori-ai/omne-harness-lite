// The single-machine Tool host exports the local start coordinator without importing Cordis.
export {
  createLocalStartCoordinator,
  START_COORDINATOR_DOMAIN_KEY,
  START_COORDINATOR_OWNER,
  startCoordinatorAdoption,
  type GuardResource,
  type LocalStartCoordinatorInput,
  type StartCoordinatorAccess,
} from './start-coordinator.ts'
