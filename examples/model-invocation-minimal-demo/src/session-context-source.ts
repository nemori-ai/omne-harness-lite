import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { z } from 'zod'
import {
  sessionIdentityValue,
  sessionRegistration,
  toolInitialValues,
} from './session-context-creation.ts'

/** The caller's effect owns this source generation. Session registrations remain in the log. */
export const sessionIdentitySource = definePlugin({
  name: 'demo-session-identity-source',
  inject: [RUNTIME_CONTEXT, 'clock'],
  Config: z
    .object({
      tools: z
        .object({ cwd: z.string().min(1), envs: z.record(z.string(), z.string()) })
        .strict()
        .optional(),
    })
    .strict(),
  apply(ctx, config) {
    const clock: unknown = ctx.get('clock')
    if (!clock || typeof clock !== 'object' || !('now' in clock) || typeof clock.now !== 'function')
      throw new TypeError('session context source requires Clock')
    if (config.tools) {
      const defaults = config.tools
      ctx.runtimeContext.registerSource({
        name: 'demo-tool-defaults',
        consumers: ['tool'],
        requiredKeys: ['shell.initial', 'files.initial'],
        recovery: 'persisted',
        async read(scope) {
          const identity = await sessionIdentityValue(scope, clock as Clock)
          return identity
            ? { kind: 'values', values: toolInitialValues(defaults, identity.observedAt) }
            : { kind: 'rejected', reason: 'sourceUnavailable' }
        },
      })
    }
    ctx.runtimeContext.registerSource({
      name: sessionRegistration.source,
      consumers: sessionRegistration.consumers,
      requiredKeys: ['session'],
      recovery: 'persisted',
      async read(scope) {
        const value = await sessionIdentityValue(scope, clock as Clock)
        return value
          ? { kind: 'values', values: [value] }
          : { kind: 'rejected', reason: 'sourceUnavailable' }
      },
    })
  },
})
