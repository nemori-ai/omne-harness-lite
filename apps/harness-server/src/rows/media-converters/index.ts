import type { Context } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { createConverterDefinitions } from '@omne-harness/media-adapters'
import { converterCategoryPlugin } from '@omne-harness/media-adapters/cordis'
import {
  MediaConverterDefinitionsService,
  mediaConverterDefinitionsKey,
} from '@omne-harness/media-cordis-contract/cordis'
import { converterLayersOf } from '../../assets/converters.ts'
import { defineRow } from '../../row.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'

class ConverterDefinitions extends MediaConverterDefinitionsService {
  readonly resolve: MediaConverterDefinitionsService['resolve']
  constructor(ctx: Context) {
    super(ctx)
    const layersOf = converterLayersOf(async ref => ctx.get(tenantAssetsKey)?.open(ref))
    this.resolve = createConverterDefinitions({ layersOf }).resolve
  }
}

/** Converter definitions are assets: the category, the release's two, and which one is in force. */
export const mediaConvertersRow = defineRow({
  row: 'media-converters',
  implementation: 'real',
  manifest: {
    provides: [mediaConverterDefinitionsKey],
    injects: [tenantAssetsKey, assetCategoriesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media-converters',
    inject: [tenantAssetsKey, assetCategoriesKey],
    apply(ctx: Context) {
      ctx.plugin(converterCategoryPlugin)
      new ConverterDefinitions(ctx)
    },
  },
})
