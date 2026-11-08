import type { SystemPrincipal } from '@omne-harness/identity'
import { TOOL_MATERIAL_MAINTAINER_COMPONENT } from '../rows/authorization/grants.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'

export function issueToolMaterialMaintainer(env: EntryEnv): SystemPrincipal {
  return issueEntrySystemPrincipal(env, TOOL_MATERIAL_MAINTAINER_COMPONENT)
}

export const TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY = 'toolMaterialMaintainerPrincipal'
export const toolMaterialMaintainerPrincipal: EntryObjectModule = {
  name: TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY,
  implementation: 'real',
  install(scope, env) {
    scope.provide(TOOL_MATERIAL_MAINTAINER_PRINCIPAL_KEY, issueToolMaterialMaintainer(env))
  },
}
