import type { SystemPrincipal } from '@omne-harness/identity'
import { TOOL_HISTORY_UPGRADER_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'

export function issueToolHistoryUpgrader(env: EntryEnv): SystemPrincipal {
  return issueEntrySystemPrincipal(env, TOOL_HISTORY_UPGRADER_COMPONENT)
}

export const TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY = 'toolHistoryUpgraderPrincipal'
export const toolHistoryUpgraderPrincipal: EntryObjectModule = {
  name: TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(TOOL_HISTORY_UPGRADER_PRINCIPAL_KEY, issueToolHistoryUpgrader(env))
  },
}
