import { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { describe, expect, it } from 'vitest'
import { createModelRuntimePlugin, type ModelRuntimeAssemblyOwner } from '../src/service-plugin.ts'
import { MODEL_RUNTIME_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import type {
  FailureConsumableOperation,
  FailureConsumption,
  ModelRuntimeService,
} from '@omne-harness-lite/model-request-runtime'

const unavailable = async () => ({ unavailable: true }) as const
function failureUnavailable<I>(
  observe?: (options: { readonly consumeFailure: true } | undefined) => void,
): FailureConsumableOperation<I, { readonly unavailable: true }> {
  function invoke(input: I): Promise<{ readonly unavailable: true }>
  function invoke(
    input: I,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<{ readonly unavailable: true }>>
  async function invoke(
    _input: I,
    options?: { readonly consumeFailure: true },
  ): Promise<{ readonly unavailable: true } | FailureConsumption<{ readonly unavailable: true }>> {
    observe?.(options)
    return options === undefined
      ? { unavailable: true }
      : { result: { unavailable: true }, consumption: { kind: 'notApplicable' } }
  }
  return invoke
}
function service(): ModelRuntimeService {
  return {
    acquireCall: unavailable,
    legalTargets: unavailable,
    displayList: unavailable,
    effectiveModel: unavailable,
    selectModel: unavailable,
    openCall: unavailable,
    dispatch: failureUnavailable(),
    dispatchAgain: failureUnavailable(),
    interrupt: unavailable,
    releaseCall: unavailable,
    reconcile: unavailable,
    readAttempts: failureUnavailable(),
    settleReply: unavailable,
    canDispatchAgain: unavailable,
    acknowledgeCall: unavailable,
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

function isRuntimeService(value: unknown): value is ModelRuntimeService {
  return (
    value !== null &&
    typeof value === 'object' &&
    [
      'acquireCall',
      'legalTargets',
      'displayList',
      'effectiveModel',
      'selectModel',
      'openCall',
      'dispatch',
      'dispatchAgain',
      'interrupt',
      'releaseCall',
      'reconcile',
      'readAttempts',
      'settleReply',
      'canDispatchAgain',
    ].every(key => typeof Reflect.get(value, key) === 'function')
  )
}

describe('Cordis P-2 runtime assembly', () => {
  it('forwards the fourteenth acquireCall operation through actual Cordis', async () => {
    const ctx = new Context()
    const parsedSession = parseOpaqueIdentifier('ref-session', 'SessionRef')
    const parsedCall = parseOpaqueIdentifier('ref-call', 'ModelCallId')
    if (!('ok' in parsedSession) || !('ok' in parsedCall)) throw new Error('fixture identifiers')
    const input = {
      ref: { session: parsedSession.ok, callId: parsedCall.ok },
      mode: 'read' as const,
    }
    const received: unknown[] = []
    const consumer = await ctx.plugin(
      createModelRuntimePlugin({
        construct: async () => ({
          service: {
            ...service(),
            acquireCall: async request => {
              received.push(request)
              return { callNotFound: true }
            },
          },
          owner: { close: async () => ({ released: true as const }), release() {} },
        }),
      }),
      {},
    )
    const provider = await dependencies(ctx)
    try {
      await consumer.await()
      const actual = ctx.get(MODEL_RUNTIME_SERVICE)
      if (!isRuntimeService(actual)) throw new Error('complete service required')
      expect(await actual.acquireCall(input)).toEqual({ callNotFound: true })
      expect(received).toEqual([input])
    } finally {
      await provider.dispose()
      await consumer.dispose()
    }
  })
  it('forwards explicit failure consumption through the real Cordis service for all three methods', async () => {
    const ctx = new Context()
    const seen: string[] = []
    const original = service()
    const consumer = await ctx.plugin(
      createModelRuntimePlugin({
        async construct() {
          return {
            service: {
              ...original,
              dispatch: failureUnavailable(options =>
                seen.push(`dispatch:${options?.consumeFailure}`),
              ),
              dispatchAgain: failureUnavailable(options =>
                seen.push(`dispatchAgain:${options?.consumeFailure}`),
              ),
              readAttempts: failureUnavailable(options =>
                seen.push(`readAttempts:${options?.consumeFailure}`),
              ),
            },
            owner: { close: async () => ({ released: true as const }), release() {} },
          }
        },
      }),
      {},
    )
    const provider = await dependencies(ctx)
    try {
      await consumer.await()
      const actual = ctx.get(MODEL_RUNTIME_SERVICE)
      if (actual === undefined || typeof actual !== 'object' || !('dispatch' in actual))
        throw new Error('Cordis runtime service missing')
      const methods = actual as ModelRuntimeService
      expect(
        await methods.dispatch({} as Parameters<ModelRuntimeService['dispatch']>[0], {
          consumeFailure: true,
        }),
      ).toEqual({ result: { unavailable: true }, consumption: { kind: 'notApplicable' } })
      expect(
        await methods.dispatchAgain({} as Parameters<ModelRuntimeService['dispatchAgain']>[0], {
          consumeFailure: true,
        }),
      ).toEqual({ result: { unavailable: true }, consumption: { kind: 'notApplicable' } })
      expect(
        await methods.readAttempts({} as Parameters<ModelRuntimeService['readAttempts']>[0], {
          consumeFailure: true,
        }),
      ).toEqual({ result: { unavailable: true }, consumption: { kind: 'notApplicable' } })
      expect(seen).toEqual(['dispatch:true', 'dispatchAgain:true', 'readAttempts:true'])
      expect(
        await methods.readAttempts({} as Parameters<ModelRuntimeService['readAttempts']>[0]),
      ).toEqual({
        unavailable: true,
      })
      expect(seen.at(-1)).toBe('readAttempts:undefined')
    } finally {
      await provider.dispose()
      await consumer.dispose()
    }
  })
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
