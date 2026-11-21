import type { Context } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { tenantLayerSource } from '@omne-harness/assets-local'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createConverterDefinitions, type ConverterLayers } from '@omne-harness/media-adapters'
import { converterCategoryPlugin } from '@omne-harness/media-adapters/cordis'
import {
  MediaConverterDefinitionsService,
  mediaConverterDefinitionsKey,
} from '@omne-harness/media-cordis-contract/cordis'
import { officialConverterBody, officialConverterSource } from '../../assets/converters.ts'
import { defineRow } from '../../row.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'

class ConverterDefinitions extends MediaConverterDefinitionsService {
  readonly resolve: MediaConverterDefinitionsService['resolve']
  constructor(ctx: Context) {
    super(ctx)
    const official = officialConverterSource()
    const { resolve } = createConverterDefinitions({
      async layersOf(tenant): Promise<ConverterLayers | undefined> {
        const ref = tenantCodec.encode(tenant)
        const assets = ref.ok ? await ctx.get(tenantAssetsKey)?.open(ref.value) : undefined
        if (assets === undefined) return undefined
        return {
          sources: [official, tenantLayerSource(assets)],
          async body(candidate) {
            const shipped = officialConverterBody(candidate.asset)
            if (shipped !== undefined) return shipped
            const read = await assets.readVersion({
              assetRef: candidate.asset,
              version: candidate.version,
            })
            return read.kind === 'version' ? read.version.body : undefined
          },
        }
      },
    })
    this.resolve = resolve
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
