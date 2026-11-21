import { Context } from '@deepseek-ai/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { mcpCategoryDisplay } from '@omne-harness/mcp-contract'
import { mcpCategoryPlugin } from '@omne-harness/mcp-host-local/cordis'
import { expect, it } from 'vitest'

it('contributes the mcp category with its own name and withdraws it on unload', async () => {
  const root = new Context()
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(mcpCategoryPlugin)
  await fiber.await()
  expect(root.assetCategories.view.list()).toEqual([
    { category: 'mcp', display: mcpCategoryDisplay, creation: 'data' },
  ])
  await fiber.dispose()
  expect(root.assetCategories.view.list()).toEqual([])
})
