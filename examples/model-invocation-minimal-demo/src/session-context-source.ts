import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { z } from 'zod'
import { sessionIdentityValue, sessionRegistration } from './session-context-creation.ts'

/** The caller's effect owns this source generation. Session registrations remain in the log. */
export const sessionIdentitySource = definePlugin({
  name: 'demo-session-identity-source',
  inject: [RUNTIME_CONTEXT, 'clock'],
  Config: z.object({}).strict(),
  apply(ctx) {
    const clock: unknown = ctx.get('clock')
    if (!clock || typeof clock !== 'object' || !('now' in clock) || typeof clock.now !== 'function')
      throw new TypeError('session context source requires Clock')
    ctx.runtimeContext.registerSource({
      name: sessionRegistration.source,
      consumers: sessionRegistration.consumers,
      requiredKeys: ['session'],
      recovery: 'persisted',
      async read(scope) {
        const value = sessionIdentityValue(scope, clock as Clock)
        return value
          ? { kind: 'values', values: [value] }
          : { kind: 'rejected', reason: 'sourceUnavailable' }
      },
    })
  },
})
