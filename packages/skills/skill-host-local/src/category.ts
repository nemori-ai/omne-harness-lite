import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { skillSkillsPoint } from '@omne-harness/skill-cordis-contract/cordis'
import { skillBodyContract, skillCategoryDisplay } from '@omne-harness/skill-contract'

export const skillCategoryPlugin = categoryContributionPlugin('skill-category', {
  contract: skillBodyContract(),
  display: skillCategoryDisplay,
  point: skillSkillsPoint.name,
})
