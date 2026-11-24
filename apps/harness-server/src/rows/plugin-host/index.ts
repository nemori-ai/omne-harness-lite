import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { pluginCategory } from '@omne-harness/plugin-host-local/cordis'
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
  plugin: pluginCategory(pluginEffectPorts),
})
