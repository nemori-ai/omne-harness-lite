// The public root of `@omne-harness/skill`: the two factories and the port bundle that
// `createSkillAccess` takes. The three stages of a read live in `access/` and are not public.
export { createPackageInspection } from './inspection.ts'
export type { SkillPorts } from './ports.ts'
