import { categoryContributionPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { mcpCategoryDisplay, mcpEndpointBodyContract } from '@omne-harness/mcp-contract'

export const mcpCategoryPlugin = categoryContributionPlugin('mcp-category', {
  contract: mcpEndpointBodyContract(),
  display: mcpCategoryDisplay,
})
