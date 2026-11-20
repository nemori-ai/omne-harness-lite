import type { PermissionRelease } from '../../src/rows/authorization/current-tool-permission.ts'

/** A release on an allowed verdict at the tenant layer: for doubles whose tests do not read it. */
export const VERDICT_RELEASE: PermissionRelease = {
  by: 'verdict',
  grant: {
    via: 'verdict',
    layer: 'tenant',
    holder: 'tenant',
    gate: { capability: 'tool.test', key: 'tool.invoke' },
    revision: 'verdict-revision',
  },
}
