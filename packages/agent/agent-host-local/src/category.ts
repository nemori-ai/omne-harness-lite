import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { agentDefinitionsPoint } from '@omne-harness/agent-cordis-contract/cordis'
import { agentBodyContract, agentDefinitionCategoryDisplay } from '@omne-harness/agent-contract'

export const agentDefinitionCategoryPlugin = categoryContributionPlugin(
  'agent-definition-category',
  {
    contract: agentBodyContract(),
    display: agentDefinitionCategoryDisplay,
    generalCreation: 'closed',
    point: agentDefinitionsPoint.name,
  },
)
