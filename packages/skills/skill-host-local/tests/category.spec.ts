import { Context } from '@deepseek-ai/cordis'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { skillCategoryDisplay } from '@omne-harness/skill-contract'
import { skillCategoryPlugin } from '@omne-harness/skill-host-local/cordis'
import { expect, it } from 'vitest'

it('contributes the skill category with its own name and withdraws it on unload', async () => {
  const root = new Context()
  await root.plugin(assetCategoriesPlugin)
  const fiber = root.plugin(skillCategoryPlugin)
  await fiber.await()
  expect(root.assetCategories.view.list()).toEqual([
    { category: 'skill', display: skillCategoryDisplay, creation: 'directory' },
  ])
  expect(root.assetCategories.view.lookup('skill')?.layout?.namespace).toBe('skills')
  await fiber.dispose()
  expect(root.assetCategories.view.list()).toEqual([])
})
