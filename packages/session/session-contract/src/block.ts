import { digestOf } from './operations.ts'
import type { SessionBlockDeclaration } from './ports.ts'

const MODES_SCHEMA = {
  name: 'session.modes',
  members: ['permission', 'environment', 'collaboration'],
  permission: ['never', 'auto_permission', 'bypass-permissions'],
  collaboration: ['co-work', 'auto-drive'],
  environment: 'Adoption',
} as const

export const sessionModesBlock: SessionBlockDeclaration = Object.freeze({
  name: 'session.modes',
  kind: 'supplied',
  recovery: 'persisted',
  volatility: 'stable',
  consumers: Object.freeze(['model', 'coordinator'] as const),
  schema: Object.freeze({
    owner: '@omne-harness/session-contract',
    name: 'session.modes',
    revision: '1',
    digest: `sha256:${digestOf(MODES_SCHEMA)}`,
  }),
})
