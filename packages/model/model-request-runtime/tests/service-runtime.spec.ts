import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createCallContainerStore } from '../src/service-container.ts'
import { createModelRuntime } from '../src/service-runtime.ts'
import type { CallContainerStore, RuntimeConstruction } from '../src/service-types.ts'
import type { PlannedSemantics } from '../src/types.ts'

const parsed = parseOpaqueIdentifier('runtime-session', 'SessionRef')
if (!('ok' in parsed)) throw new Error('session fixture invalid')
const session = parsed.ok
const messageId = (() => {
  const value = parseOpaqueIdentifier('unused-message', 'MessageId')
  if (!('ok' in value)) throw new Error('message fixture invalid')
  return value.ok
})()

function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => {
    finish = resolve
  })
  return {
    promise,
    finish(value: T) {
      if (finish === undefined) throw new Error('deferred was not created')
      finish(value)
    },
  }
}

function construction(
  input: {
    readonly store?: CallContainerStore<PlannedSemantics, never>
    readonly bind?: RuntimeConstruction<PlannedSemantics, never>['sessions']['bind']
    readonly diagnostics?: string[]
  } = {},
): RuntimeConstruction<PlannedSemantics, never> {
  return {
    sessions: { bind: input.bind ?? (async () => ({ failure: 'unavailable' })) },
    calls: input.store ?? createCallContainerStore(),
    transport: { acquire: () => ({ unavailable: true }) },
    settlementContention: {
      name: 'runtime-close-test',
      limits: { submissions: 1, elapsedMs: 1, retainedBytes: 1, concurrent: 1 },
      decide: () => ({ stop: true }),
    },
    settlementScheduler: {
      nowMonotonicMs: () => 0,
      wait: () => {
        throw new Error('healthy close must not schedule')
      },
    },
    policy: {
      now: () => '2026-09-28T00:00:00Z',
      schedule: () => {
        throw new Error('healthy close must not schedule')
      },
      firstContentTimeoutMs: 1,
      idleContentTimeoutMs: 1,
      statusCauseTable: {},
      credentialRedaction: {
        credential_fragment_min_length: 8,
        credential_header_names: [],
        credential_patterns: [],
      },
      diagnostic(event) {
        input.diagnostics?.push(event.kind)
      },
    },
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    identities: {
      call: () => 'unused-call',
      response: () => 'unused-response',
      message: () => messageId,
    },
    history: {
      call: () => ({ unavailable: true, reason: 'history' }),
      failure: () => ({ unavailable: true }),
      run: () => ({ unavailable: true }),
    },
    reservationWaitPolicy: { maxWaitersPerCall: 1, timeoutMs: 1 },
    recovery: { enter: async () => ({ unavailable: true }) },
    diagnostic() {},
  }
}

describe('D102 unified model runtime owner', () => {
  it('composes all thirteen actual methods and closes their shared healthy owners', async () => {
    const runtime = createModelRuntime(construction())
    expect(Object.keys(runtime.service)).toHaveLength(13)
    expect(await runtime.service.effectiveModel({ session })).toEqual({ unavailable: true })
    const first = runtime.close()
    expect(runtime.close()).toBe(first)
    expect(await first).toEqual({ released: true })
    expect(await runtime.close()).toEqual({ released: true })
    expect(await runtime.service.effectiveModel({ session })).toEqual({ unavailable: true })
    expect(await runtime.service.openCall({} as never)).toEqual({ runtimeStopped: true })
    expect(await runtime.service.dispatch({} as never)).toEqual({ runtimeStopped: true })
    expect(await runtime.service.dispatchAgain({} as never)).toEqual({ runtimeStopped: true })
  })

  it('waits for an already registered operation before reporting released', async () => {
    const bound = deferred<{ readonly failure: 'unavailable' }>()
    const runtime = createModelRuntime(construction({ bind: () => bound.promise }))
    const inFlight = runtime.service.effectiveModel({ session })
    let closeFinished = false
    const closing = runtime.close().then(result => {
      closeFinished = true
      return result
    })
    await Promise.resolve()
    expect(closeFinished).toBe(false)
    bound.finish({ failure: 'unavailable' })
    expect(await inFlight).toEqual({ unavailable: true })
    expect(await closing).toEqual({ released: true })
  })

  it('retains an owner after a close exception, then retries without giving the store to another runtime', async () => {
    const actual = createCallContainerStore<PlannedSemantics, never>()
    let attempts = 0
    const store: CallContainerStore<PlannedSemantics, never> = {
      ...actual,
      close() {
        attempts++
        if (attempts === 1) return Promise.reject(new Error('close failed'))
        return actual.close()
      },
    }
    const diagnostics: string[] = []
    const config = construction({ store, diagnostics })
    const runtime = createModelRuntime(config)
    expect(() => createModelRuntime(config)).toThrow('call store already owned')
    expect(await runtime.close()).toEqual({ unavailable: true })
    expect(diagnostics).toEqual(['model_runtime.close_component_failed'])
    expect(await runtime.close()).toEqual({ released: true })
  })
})
