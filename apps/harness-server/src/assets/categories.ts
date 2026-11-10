// The asset categories this application knows: one body contract per category, registered in the
// asset domain's category registry. Every holding of the application derives its settings through
// this registry, so Settings and the rows that read settings never branch on a category.
import { createCategoryRegistry, type CategoryRegistry } from '@omne-harness/assets'
import { modelProviderBodyContract } from '@omne-harness/model-contract/provider-asset'
import { toolBodyContract } from '@omne-harness/tool-contract'

/** A new registry with the body contract of every category the release holds. */
export function releaseCategories(): CategoryRegistry {
  const registry = createCategoryRegistry()
  registry.register(toolBodyContract())
  registry.register(modelProviderBodyContract())
  return registry
}
