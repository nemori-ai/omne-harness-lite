import { Context, type Plugin } from '@deepseek-ai/cordis'
import type { CategoryView } from '@omne-harness/assets'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService, dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { heldOnRegistry, type HeldOnRegistry } from '../../src/rows/tenant-assets/held.ts'

export type HeldRegistry = Readonly<{
  root: Context
  categories: CategoryView
  held: HeldOnRegistry
}>

/** For a case that opens tenant assets without the rows: a real registry, the categories given, and the keeper of what tenants hold. */
export async function heldRegistry(categories: readonly Plugin.Object[]): Promise<HeldRegistry> {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  for (const category of categories) await root.plugin(category)
  let held: HeldOnRegistry | undefined
  await root.plugin({
    name: 'tenant-assets',
    inject: ['assetCategories'],
    apply(ctx: Context) {
      const made = heldOnRegistry(
        () => ctx.assetCategories,
        () => undefined,
        () => (ctx.get(dynamisKey) as DynamisService | undefined)?.registry(),
      )
      ctx.on('dynamis-cordis/changed', () => made.registryChanged())
      held = made
    },
  })
  if (held === undefined) throw new Error('the keeper did not start')
  return { root, categories: root.assetCategories.view, held }
}
