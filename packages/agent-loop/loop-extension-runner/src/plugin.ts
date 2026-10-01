import { definePlugin, fiberIsActive } from '@omne-harness-lite/kernel-basis'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { z } from 'zod'
import { createLoopExtensionRunner } from './service.ts'
import type { RunnerHostFactory } from './service-types.ts'

export const LOOP_EXTENSION_RUNNER_SERVICE = 'loopExtensionRunner'
export const LOOP_EXTENSION_IMPLEMENTATIONS_SERVICE = 'loopExtensionImplementations'
function sessionLog(value: unknown): value is SessionLog {
  return (
    value !== null &&
    typeof value === 'object' &&
    'append' in value &&
    typeof value.append === 'function' &&
    'readByKey' in value &&
    typeof value.readByKey === 'function' &&
    'readSince' in value &&
    typeof value.readSince === 'function'
  )
}
export const loopExtensionRunnerPlugin = definePlugin({
  name: 'loop-extension-runner',
  inject: ['sessionLog'],
  Config: z
    .object({ host: z.custom<RunnerHostFactory>(value => typeof value === 'function') })
    .strict(),
  apply(ctx, config) {
    const log: unknown = ctx.get('sessionLog')
    if (!sessionLog(log)) throw new TypeError('sessionLog is not an SL3 operation face')
    const host = config.host(ctx, log)
    if (typeof host?.acquireDispatch !== 'function' || typeof host?.acquireReplay !== 'function')
      throw new TypeError('Runner requires an authorized host')
    const instance = createLoopExtensionRunner({ log, host, isActive: () => fiberIsActive(ctx) })
    // One explicit close chain; it never closes or drains the borrowed physical owner.
    ctx.effect(
      () => async () => {
        instance.closeAdmission()
        await instance.drain()
      },
      'loop-extension-runner.close',
    )
    ctx.provide(LOOP_EXTENSION_RUNNER_SERVICE, instance.runner)
    ctx.provide(LOOP_EXTENSION_IMPLEMENTATIONS_SERVICE, instance.implementations)
  },
})
