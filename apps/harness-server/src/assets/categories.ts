import type { BodyContract, CategoryView } from '@omne-harness/assets'
import { modelProviderBodyContract } from '@omne-harness/model-contract/provider-asset'
import { toolBodyContract } from '@omne-harness/tool-contract'

export function officialCategories(): Pick<CategoryView, 'lookup'> {
  const contracts = new Map<string, BodyContract>(
    [toolBodyContract(), modelProviderBodyContract()].map(contract => [
      contract.category,
      contract,
    ]),
  )
  return { lookup: category => contracts.get(category) }
}
