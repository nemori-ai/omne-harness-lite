// The root entry of the single-machine Tool host. It does not import Cordis; the Cordis plugin is
// on the `./cordis` entry.
export {
  createLocalStartCoordinator,
  START_COORDINATOR_DOMAIN_KEY,
  START_COORDINATOR_OWNER,
  startCoordinatorAdoption,
  type GuardResource,
  type LocalStartCoordinatorInput,
  type StartCoordinatorAccess,
} from './start-coordinator.ts'
