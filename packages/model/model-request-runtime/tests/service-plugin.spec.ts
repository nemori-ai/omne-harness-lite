import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  createModelRuntimePlugin,
  MODEL_RUNTIME_SERVICE,
  type ModelRuntimeAssemblyOwner,
} from '../src/service-plugin.ts'
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

async function dependencies(ctx: Context) {
  return await ctx.plugin(
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
    const retained = new Set<ModelRuntimeAssemblyOwner>()
    let releases = 0
    const plugin = createModelRuntimePlugin({
      async construct() {
        constructed++
        const owner: ModelRuntimeAssemblyOwner = {
          async close() {
            closeStarted = true
            await closing
            return { released: true }
          },
          release() {
            if (!retained.delete(owner)) throw new Error('owner not retained')
            releases++
          },
        }
        retained.add(owner)
        return {
          service: service(),
          owner,
        }
      },
    })
    const consumer = await ctx.plugin(plugin, {})
    expect(constructed).toBe(0)
    const provider = await dependencies(ctx)
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
    expect(retained.size).toBe(0)
    expect(releases).toBe(1)
    await consumer.dispose()
  })

  it('leaves an unavailable owner with its real host after the Cordis fiber unloads', async () => {
    const ctx = new Context()
    const retained = new Set<ModelRuntimeAssemblyOwner>()
    let actualStop = false
    let releases = 0
    const plugin = createModelRuntimePlugin({
      async construct() {
        const owner: ModelRuntimeAssemblyOwner = {
          async close() {
            return actualStop ? { released: true } : { unavailable: true }
          },
          release() {
            if (!retained.delete(owner)) throw new Error('owner not retained')
            releases++
          },
        }
        retained.add(owner)
        return { service: service(), owner }
      },
    })
    const consumer = await ctx.plugin(plugin, {})
    const provider = await dependencies(ctx)
    await consumer.await()
    expect(retained.size).toBe(1)
    await provider.dispose()
    await consumer.dispose()
    expect(ctx.get(MODEL_RUNTIME_SERVICE)).toBeUndefined()
    expect(retained.size).toBe(1)
    expect(releases).toBe(0)
    const original = [...retained][0]
    if (original === undefined) throw new Error('host lost the original owner')
    actualStop = true
    expect(await original.close()).toEqual({ released: true })
    original.release()
    expect(retained.size).toBe(0)
    expect(releases).toBe(1)
  })
})
