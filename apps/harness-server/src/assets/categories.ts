import { createCategoryRegistry, type CategoryRegistry } from '@omne-harness/assets'
import { modelProviderBodyContract } from '@omne-harness/model-contract/provider-asset'
import { toolBodyContract } from '@omne-harness/tool-contract'

export function releaseCategories(): CategoryRegistry {
  const registry = createCategoryRegistry()
  registry.register(toolBodyContract())
  registry.register(modelProviderBodyContract())
  return registry
}
