import { Context } from '@deepseek-ai/cordis'
import { agentDefinitionCategoryPlugin } from '@omne-harness/agent-host-local/cordis'
import {
  assetCategoriesPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { mcpCategoryPlugin } from '@omne-harness/mcp-host-local/cordis'
import { converterCategoryPlugin } from '@omne-harness/media-adapters/cordis'
import { modelProviderCategoryPlugin } from '@omne-harness/model-host-local/cordis'
import { skillCategoryPlugin } from '@omne-harness/skill-host-local/cordis'
import { toolBodyContract, toolCategoryDisplay } from '@omne-harness/tool-contract'
import { toolToolsPoint } from '@omne-harness/tool-cordis-contract/cordis'
import { expect, it } from 'vitest'

it('six domains contribute into one extension point, each with the name it declares', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  await root.plugin(skillCategoryPlugin)
  await root.plugin(mcpCategoryPlugin)
  await root.plugin(agentDefinitionCategoryPlugin)
  await root.plugin(modelProviderCategoryPlugin)
  await root.plugin(converterCategoryPlugin)
  await root.plugin(
    categoryContributionPlugin(
      'tool-category',
      { contract: toolBodyContract(), display: toolCategoryDisplay, generalCreation: 'closed' },
      toolToolsPoint,
    ),
  )
  expect(
    root.assetCategories.view
      .list()
      .map(listing => [listing.category, listing.display.title, listing.creation]),
  ).toEqual([
    ['AgentDefinition', '智能体', 'directory'],
    ['converter', '转换件', 'data'],
    ['mcp', 'MCP', 'data'],
    ['model-provider', '模型供应商', 'none'],
    ['skill', '技能', 'directory'],
    ['tool', '工具', 'none'],
  ])
  for (const listing of root.assetCategories.view.list())
    expect(root.assetCategories.view.lookup(listing.category)?.category).toBe(listing.category)
})
