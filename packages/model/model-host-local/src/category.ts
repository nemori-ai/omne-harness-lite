import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import {
  modelProviderBodyContract,
  modelProviderCategoryDisplay,
} from '@omne-harness/model-contract/provider-asset'

export const modelProviderCategoryPlugin = categoryContributionPlugin('model-provider-category', {
  contract: modelProviderBodyContract(),
  display: modelProviderCategoryDisplay,
})
