import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { LOOP_EXTENSION_IMPLEMENTATIONS } from '@omne-harness-lite/loop-extension-runner/cordis'
import { MODEL_RETRY_SAMPLE } from '@omne-harness-lite/model-request-runtime/cordis'
import { isJsonNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { validate as validateTool, type Duration } from '@omne-harness-lite/tool-definition'
import { z } from 'zod'
import { createDefaultRetryImplementation, DEFAULT_RETRY_BUILTIN } from './default-retry.ts'

export const modelDefaultRetry = definePlugin({
  name: 'model-default-retry',
  inject: [LOOP_EXTENSION_IMPLEMENTATIONS, MODEL_RETRY_SAMPLE],
  Config: z.object({ policy: z.object({
    kind: z.enum(['constant', 'linear', 'exponential']),
    base: z.custom<Duration>(value => validateTool('Duration', value).valid),
    factor: z.custom<JsonNumber>(isJsonNumber),
    max: z.custom<Duration>(value => validateTool('Duration', value).valid),
    jitter: z.enum(['none', 'full', 'half', 'decorrelated']),
  }).strict() }).strict(),
  apply(ctx, config) {
    const implementation = createDefaultRetryImplementation({ policy: config.policy, sample: () => ctx.modelRetrySample.sample() })
    ctx.loopExtensionImplementations.registerBuiltin(DEFAULT_RETRY_BUILTIN, implementation)
  },
})

export * from './service-plugin.ts'
