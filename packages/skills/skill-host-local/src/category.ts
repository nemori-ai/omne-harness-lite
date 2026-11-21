import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { skillBodyContract, skillCategoryDisplay } from '@omne-harness/skill-contract'

export const skillCategoryPlugin = categoryContributionPlugin('skill-category', {
  contract: skillBodyContract(),
  display: skillCategoryDisplay,
})
