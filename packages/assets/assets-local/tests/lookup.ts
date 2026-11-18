import type { BodyContract, CategoryView } from '@omne-harness/assets'

export function lookupOf(...contracts: readonly BodyContract[]): Pick<CategoryView, 'lookup'> {
  return { lookup: category => contracts.find(contract => contract.category === category) }
}
