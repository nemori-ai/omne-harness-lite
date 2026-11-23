import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { pluginCategoryPlugin } from '@omne-harness/plugin-host-local/cordis'
import { defineRow } from '../../row.ts'

/** Plugin on the server. It registers Plugin as a category of the assets, with its point. */
export const pluginHostRow = defineRow({
  row: 'plugin-host',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [assetCategoriesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: pluginCategoryPlugin,
})
