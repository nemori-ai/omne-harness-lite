import type { Plugin } from '@deepseek-ai/cordis'
import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { agentDefinitionsPoint } from '@omne-harness/agent-cordis-contract/cordis'
import { agentBodyContract, agentDefinitionCategoryDisplay } from '@omne-harness/agent-contract'

type Contribution = Parameters<typeof categoryContributionPlugin>[1]

/** The Agent definition category as a contribution; `effect`: what the assembly knows of where a definition stands. */
export function agentDefinitionCategory(effect?: Contribution['effect']): Plugin.Object {
  return categoryContributionPlugin(
    'agent-definition-category',
    {
      contract: agentBodyContract(),
      display: agentDefinitionCategoryDisplay,
      ...(effect === undefined ? {} : { effect }),
    },
    agentDefinitionsPoint,
  )
}

export const agentDefinitionCategoryPlugin = agentDefinitionCategory()
