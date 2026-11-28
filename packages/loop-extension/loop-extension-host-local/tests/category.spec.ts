import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  LOOP_EXTENSION_CATEGORY,
  loopExtensionCategoryDisplay,
} from '@omne-harness/loop-extension-contract'
import { loopExtensionCategoryPlugin } from '@omne-harness/loop-extension-host-local/cordis'

it('contributes the loop extension category with its own name and withdraws it on unload', async () => {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(loopExtensionCategoryPlugin)
  await fiber.await()
  expect(root.assetCategories.view.list()).toEqual([
    {
      category: LOOP_EXTENSION_CATEGORY,
      display: loopExtensionCategoryDisplay,
      creation: 'directory',
      point: 'loop-extension.extensions',
    },
  ])
  const contract = root.assetCategories.view.lookup(LOOP_EXTENSION_CATEGORY)
  expect(contract?.layout?.namespace).toBe('loop-extensions')
  expect(contract?.settings).toBeTypeOf('function')
  await fiber.dispose()
  expect(root.assetCategories.view.list()).toEqual([])
})
