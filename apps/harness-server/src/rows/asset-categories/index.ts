import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { assetCategoriesPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { defineRow } from '../../row.ts'

export const assetCategoriesRow = defineRow({
  row: 'asset-categories',
  implementation: 'real',
  manifest: {
    provides: [assetCategoriesKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: assetCategoriesPlugin,
})
