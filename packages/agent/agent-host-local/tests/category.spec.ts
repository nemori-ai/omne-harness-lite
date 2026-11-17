import { Context } from '@deepseek-ai/cordis'
import { agentDefinitionCategoryDisplay } from '@omne-harness/agent-contract'
import { agentDefinitionCategoryPlugin } from '@omne-harness/agent-host-local/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { expect, it } from 'vitest'

it('contributes the agent definition category with its own name and withdraws it on unload', async () => {
  const root = new Context()
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(agentDefinitionCategoryPlugin)
  await fiber.await()
  expect(root.assetCategories.view.list()).toEqual([
    { category: 'AgentDefinition', display: agentDefinitionCategoryDisplay },
  ])
  await fiber.dispose()
  expect(root.assetCategories.view.list()).toEqual([])
})
