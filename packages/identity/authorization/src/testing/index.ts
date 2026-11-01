// Test doubles of the system action authorization (SPEC AU-12). They are stand-ins: a test source
// is never a production source of maintenance grants, and nothing here installs a grant by default.
export { scriptedMaintenanceGrants } from './grants.ts'
export type { ScriptedMaintenanceGrants } from './grants.ts'
export { manualSystemClock } from './clock.ts'
export type { ManualSystemClock } from './clock.ts'
