import type { Context } from '@deepseek-ai/cordis'
import { mediaEnginesKey } from '@omne-harness/media-cordis-contract/cordis'
import { createPdfTextEngine } from '@omne-harness/media-engine-pdf'
import { defineRow } from '../../row.ts'

/** The engine pdf.extract-text, registered while the row is in the tree. */
export const mediaEnginePdfRow = defineRow({
  row: 'media-engine-pdf',
  implementation: 'real',
  manifest: { provides: [], injects: [mediaEnginesKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media-engine-pdf',
    inject: [mediaEnginesKey],
    apply(ctx: Context) {
      ctx.mediaEngines.register(createPdfTextEngine())
    },
  },
})
