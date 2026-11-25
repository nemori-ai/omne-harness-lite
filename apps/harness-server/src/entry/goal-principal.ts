import type { EntryObjectModule } from '../types.ts'
import { goalPrincipalOf } from './principals.ts'

export const GOAL_PRINCIPAL_KEY = 'goalPrincipal'
/** The system principal goals work as, handed to the goal rows only. */
export const goalPrincipal: EntryObjectModule = {
  name: GOAL_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(GOAL_PRINCIPAL_KEY, goalPrincipalOf(env))
  },
}
