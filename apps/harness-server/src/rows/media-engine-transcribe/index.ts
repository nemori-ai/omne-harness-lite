import type { Context } from '@deepseek-ai/cordis'
import { mediaEnginesKey } from '@omne-harness/media-cordis-contract/cordis'
import { createTranscribeEngine } from '@omne-harness/media-engine-transcribe'
import { z } from 'zod'
import { providerKeyOf } from '../../assets/provider-keys.ts'
import { defineRow } from '../../row.ts'
import { settingsSecretCustodyKey } from '../secret-custody/index.ts'

export const mediaEngineTranscribeConfig = z.strictObject({
  endpoint: z.url().default('https://openrouter.ai/api/v1/audio/transcriptions'),
})

/** The engine voice.transcribe, with the OpenRouter key of the tenant that asks, else the deployment's. */
export const mediaEngineTranscribeRow = defineRow({
  row: 'media-engine-transcribe',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [mediaEnginesKey, settingsSecretCustodyKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'media-engine-transcribe',
    inject: [mediaEnginesKey, settingsSecretCustodyKey],
    Config: mediaEngineTranscribeConfig,
    apply(ctx: Context, raw: unknown) {
      const { endpoint } = mediaEngineTranscribeConfig.parse(raw ?? {})
      const keyOf = providerKeyOf('openrouter', ctx.settingsSecretCustody)
      ctx.mediaEngines.register(
        createTranscribeEngine({ endpoint, key: async access => keyOf(access.tenant) }),
      )
    },
  },
})
