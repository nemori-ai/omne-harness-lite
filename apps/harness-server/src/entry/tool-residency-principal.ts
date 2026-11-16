import { TOOL_RESIDENCY_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryObjectModule } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'

export const TOOL_RESIDENCY_PRINCIPAL_KEY = 'toolResidencyPrincipal'

export const toolResidencyPrincipal: EntryObjectModule = {
  name: TOOL_RESIDENCY_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(
      TOOL_RESIDENCY_PRINCIPAL_KEY,
      issueEntrySystemPrincipal(env, TOOL_RESIDENCY_COMPONENT),
    )
  },
}
