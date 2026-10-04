import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import { z } from 'zod'
import {
  createDefaultRetryImplementation,
  DEFAULT_RETRY_BUILTIN,
  type DefaultRetryConfiguration,
  type DefaultRetryResult,
} from './default-retry.ts'

export const MODEL_DEFAULT_RETRY_PLUGIN = 'model-default-retry'

interface BuiltinRegistration {
  readonly registerBuiltin: (
    name: string,
    implementation: (input: ExtensionInput, signal: AbortSignal) => Promise<DefaultRetryResult>,
  ) => () => void
}

function registration(value: unknown): value is BuiltinRegistration {
  return (
    value !== null &&
    typeof value === 'object' &&
    'registerBuiltin' in value &&
    typeof value.registerBuiltin === 'function'
  )
}

/** P-5 only owns its current Cordis effect; runner owns the registry and in-flight leases. */
export function createModelDefaultRetryPlugin(config: DefaultRetryConfiguration) {
  const implementation = createDefaultRetryImplementation(config)
  return definePlugin({
    name: MODEL_DEFAULT_RETRY_PLUGIN,
    inject: ['loopExtensionImplementations'],
    Config: z.object({}).strict(),
    apply(ctx) {
      const service: unknown = ctx.get('loopExtensionImplementations')
      if (!registration(service)) throw new TypeError('loop extension registry unavailable')
      ctx.effect(
        () => service.registerBuiltin(DEFAULT_RETRY_BUILTIN, implementation),
        'model-default-retry.register',
      )
    },
  })
}
