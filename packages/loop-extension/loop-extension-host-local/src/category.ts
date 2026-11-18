import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import {
  loopExtensionBodyContract,
  loopExtensionCategoryDisplay,
} from '@omne-harness/loop-extension-contract'

export const loopExtensionCategoryPlugin = categoryContributionPlugin('loop-extension-category', {
  contract: loopExtensionBodyContract(),
  display: loopExtensionCategoryDisplay,
})
