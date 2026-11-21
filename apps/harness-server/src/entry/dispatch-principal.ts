import type { EntryObjectModule } from '../types.ts'
import { dispatchPrincipalOf } from './principals.ts'

export const DISPATCH_PRINCIPAL_KEY = 'dispatchPrincipal'
/** The system principal dispatch works as, handed to the dispatch rows only. */
export const dispatchPrincipal: EntryObjectModule = {
  name: DISPATCH_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(DISPATCH_PRINCIPAL_KEY, dispatchPrincipalOf(env))
  },
}
