import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createModelRuntimePlugin, MODEL_RUNTIME_SERVICE } from '../src/service-plugin.ts'
import type { ModelRuntimeService } from '../src/service-types.ts'

const unavailable = async () => ({ unavailable: true }) as const
function service(): ModelRuntimeService {
  return {
    legalTargets: unavailable,
    displayList: unavailable,
    effectiveModel: unavailable,
    selectModel: unavailable,
    openCall: unavailable,
    dispatch: unavailable,
    dispatchAgain: unavailable,
    interrupt: unavailable,
    releaseCall: unavailable,
    reconcile: unavailable,
    readAttempts: unavailable,
    settleReply: unavailable,
    canDispatchAgain: unavailable,
  }
}

describe('Cordis P-2 runtime assembly', () => {
  it('waits for required providers and closes admission before actual assembly close completes', async () => {
    const ctx = new Context()
    let constructed = 0
    let closeStarted = false
    let finishClose: (() => void) | undefined
    const closing = new Promise<void>(resolve => {
      finishClose = resolve
    })
    const plugin = createModelRuntimePlugin({
      async construct() {
        constructed++
        return {
          service: service(),
          async close() {
            closeStarted = true
            await closing
            return { released: true } as const
          },
        }
      },
    })
    const consumer = await ctx.plugin(plugin, {})
    expect(constructed).toBe(0)
    const provider = await ctx.plugin(
      definePlugin({
        name: 'runtime-test-dependencies',
        Config: z.object({}).strict(),
        apply(inner) {
          inner.provide('sessionLog', {})
          inner.provide('modelCatalogRead', {})
          inner.provide('credentialLookup', {})
          inner.provide('modelTransport', {})
          inner.provide('storage', {})
          inner.provide('clock', {})
        },
      }),
      {},
    )
    await consumer.await()
    expect(constructed).toBe(1)
    const offered = ctx.get(MODEL_RUNTIME_SERVICE)
    if (offered === undefined || typeof offered !== 'object' || !('openCall' in offered))
      throw new Error('runtime service absent')
    const actual = offered as ModelRuntimeService
    const disposing = provider.dispose()
    await Promise.resolve()
    expect(closeStarted).toBe(true)
    expect(await actual.openCall({} as Parameters<ModelRuntimeService['openCall']>[0])).toEqual({
      runtimeStopped: true,
    })
    expect(
      await actual.readAttempts({} as Parameters<ModelRuntimeService['readAttempts']>[0]),
    ).toEqual({
      unavailable: true,
    })
    finishClose?.()
    await disposing
    await consumer.dispose()
  })
})
