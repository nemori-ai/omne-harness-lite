import { Context } from '@deepseek-ai/cordis'
import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { TOOL_RUNTIME_REGISTRY } from '@omne-harness-lite/tool-execution-runtime/cordis'
import type {
  ExecutionObserver,
  ExecutionRead,
  ToolRuntimeOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import { runtimeRegistry } from '../src/cordis.ts'

const ref = {
  tenant: unwrap(parseTenantId({ organization: 'registry-org', account: 'registry-user' })),
  session: unwrap(parseOpaqueIdentifier('registry-session', 'SessionRef')),
  callId: unwrap(parseOpaqueIdentifier('registry-call', 'CallId')),
}
// A controlled provider isolates the caller ownership obligation; it does not prove authorization.
const access = Object.freeze({}) as SessionAccess

function observer() {
  let closed = false
  const ending = Promise.withResolvers<ExecutionRead>()
  const release = vi.fn(() => {
    closed = true
    ending.resolve({ kind: 'rejected', reason: 'ownerStopped' })
  })
  return {
    release,
    value: {
      async read(): Promise<ExecutionRead> {
        return closed
          ? { kind: 'rejected', reason: 'ownerStopped' }
          : {
              kind: 'found',
              snapshot: {
                ref,
                origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
                adoptedContext: [],
                state: { phase: 'queued' },
              },
            }
      },
      waitForEnd: () => ending.promise,
      frames: async () => ({ kind: 'rejected', reason: 'runtimeUnavailable' }),
      release,
    } satisfies ExecutionObserver,
  }
}

async function fixture(acquire: ToolRuntimeOperations['acquire']) {
  const root = new Context()
  const registry = await root.plugin(runtimeRegistry, {})
  const provider = await root.plugin({
    name: 'registry-provider',
    inject: [TOOL_RUNTIME_REGISTRY],
    apply(ctx: Context) {
      ctx.toolRuntimeRegistry.register({
        acquire,
        submit: async () => ({ kind: 'rejected', reason: 'runtimeUnavailable' }),
        stop: async () => 'unavailable',
        answer: async () => 'unavailable',
      })
    },
  })
  let caller: Context | undefined
  const fiber = await root.plugin({
    name: 'registry-caller',
    inject: [TOOL_RUNTIME_REGISTRY],
    apply(ctx: Context) {
      caller = ctx
    },
  })
  if (!caller) throw new Error('caller did not load')
  return {
    caller,
    fiber,
    async close() {
      await fiber.dispose()
      await provider.dispose()
      await registry.dispose()
      await root.fiber.dispose()
    },
  }
}

test('short observer reads release their caller effects while the caller remains loaded', async () => {
  const originals: ReturnType<typeof observer>[] = []
  const h = await fixture(async () => {
    const held = observer()
    originals.push(held)
    return { kind: 'acquired', observer: held.value }
  })
  try {
    for (let index = 0; index < 128; index++) {
      const result = await h.caller.toolRuntimeRegistry.acquire(access, ref)
      if (result.kind !== 'acquired') throw new Error('controlled provider unavailable')
      expect((await result.observer.read()).kind).toBe('found')
      result.observer.release()
      result.observer.release()
      expect(await result.observer.read()).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
      expect(
        h.fiber.getEffects().filter(effect => effect.label === 'tool-runtime-registry.observer'),
      ).toHaveLength(0)
    }
    await h.fiber.dispose()
    for (const held of originals) expect(held.release).toHaveBeenCalledOnce()
  } finally {
    await h.close()
  }
})

test('caller withdrawal while acquisition is pending releases the late original observer', async () => {
  const entered = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>(),
    held = observer()
  const h = await fixture(async () => {
    entered.resolve()
    await finish.promise
    return { kind: 'acquired', observer: held.value }
  })
  try {
    const pending = h.caller.toolRuntimeRegistry.acquire(access, ref)
    await entered.promise
    await h.fiber.dispose()
    finish.resolve()
    expect(await pending).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    expect(held.release).toHaveBeenCalledOnce()
  } finally {
    finish.resolve()
    await h.close()
  }
})

test('rejected acquisition also removes its temporary caller effect', async () => {
  const h = await fixture(async () => ({ kind: 'rejected', reason: 'runtimeUnavailable' }))
  try {
    expect(await h.caller.toolRuntimeRegistry.acquire(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(
      h.fiber.getEffects().filter(effect => effect.label === 'tool-runtime-registry.observer'),
    ).toHaveLength(0)
  } finally {
    await h.close()
  }
})

test('a throwing original provider leaves no temporary caller effect', async () => {
  const original = new Error('original acquisition failed')
  const h = await fixture(async () => {
    throw original
  })
  try {
    await expect(h.caller.toolRuntimeRegistry.acquire(access, ref)).rejects.toBe(original)
    expect(
      h.fiber.getEffects().filter(effect => effect.label === 'tool-runtime-registry.observer'),
    ).toHaveLength(0)
  } finally {
    await h.close()
  }
})
