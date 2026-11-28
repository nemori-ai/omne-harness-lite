import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { pluginCategory } from '@omne-harness/plugin-host-local/cordis'
import { GUEST_TOOL_GATES } from '@omne-harness/tool-host-local'
import { gatedCategoryContract } from '../../entry/category-gates.ts'
import { defineRow } from '../../row.ts'
import { pluginEffectPorts } from './effect-ports.ts'

/** Plugin on the server. It registers Plugin as a category of the assets, with its point and what it tells of its own. */
export const pluginHostRow = defineRow({
  row: 'plugin-host',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [assetCategoriesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: pluginCategory(pluginEffectPorts, {
    gated: contract =>
      gatedCategoryContract(contract, { ...GUEST_TOOL_GATES, gates: [...GUEST_TOOL_GATES.gates] }),
  }),
})
