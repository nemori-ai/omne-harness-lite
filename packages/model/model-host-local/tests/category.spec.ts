import { Context } from '@deepseek-ai/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { modelProviderCategoryDisplay } from '@omne-harness/model-contract/provider-asset'
import { modelProviderCategoryPlugin } from '@omne-harness/model-host-local/cordis'
import { expect, it } from 'vitest'

it('contributes the model provider category with its own name and withdraws it on unload', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(modelProviderCategoryPlugin)
  await fiber.await()
  expect(root.assetCategories.view.list()).toEqual([
    {
      category: 'model-provider',
      display: modelProviderCategoryDisplay,
      creation: 'none',
      point: 'model.providers',
    },
  ])
  await fiber.dispose()
  expect(root.assetCategories.view.list()).toEqual([])
})
