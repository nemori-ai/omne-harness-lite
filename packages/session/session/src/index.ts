// The root entry of the Cordis-free Session implementation (docs/public-api.md). The member reads
// every outside capability from the factory parameters and imports no Cordis.
export type { BeforeAdmitSlot, Current, SessionDependencies } from './dependencies.ts'
export {
  defaultSchedulingPolicy,
  type SchedulingPolicy,
  type SessionConfiguration,
} from './policy.ts'
export { createSessionInstance, type MaintenanceHandle, type SessionInstance } from './instance.ts'
