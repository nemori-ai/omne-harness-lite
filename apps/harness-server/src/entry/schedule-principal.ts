import type { EntryObjectModule } from '../types.ts'
import { schedulePrincipalOf } from './principals.ts'

export const SCHEDULE_PRINCIPAL_KEY = 'schedulePrincipal'
/** The system principal Jobs work as, handed to the row that puts Jobs into sessions only. */
export const schedulePrincipal: EntryObjectModule = {
  name: SCHEDULE_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(SCHEDULE_PRINCIPAL_KEY, schedulePrincipalOf(env))
  },
}
