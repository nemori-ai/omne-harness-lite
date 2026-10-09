// @module-tag slow
import { describe, expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionRuntimeBinding } from '@omne-harness-lite/model-request-runtime'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'
import { deferred } from './anchored-invocation-fixture.ts'
import { ControlledSettlementOwner } from './settlement-fixture.ts'

type World = Awaited<ReturnType<typeof acknowledgementHost>>
type Credential = Awaited<ReturnType<SessionRuntimeBinding['credentials']['value']>>

async function withPreparation(
  configure: (
    binding: SessionRuntimeBinding,
    trace: string[],
    preparing: () => boolean,
  ) => SessionRuntimeBinding,
  work: (context: {
    readonly world: World
    readonly owner: ControlledSettlementOwner
    readonly runtime: ReturnType<typeof createModelRuntime>
    readonly calls: ReturnType<typeof createCallContainerStore<TestPlan, object>>
    readonly binding: SessionRuntimeBinding
    readonly ref: { readonly session: World['host']['session']; readonly callId: string }
    readonly trace: string[]
    readonly capturePlans: number
  }) => Promise<void>,
): Promise<void> {
  const owner = new ControlledSettlementOwner()
  const world = await acknowledgementHost({ owner })
  let runtime: ReturnType<typeof createModelRuntime> | undefined
  try {
    const result = await world.construction.sessions.bind(world.host.session)
    if (!('binding' in result)) throw new Error('original binding unavailable')
    const trace: string[] = []
    let preparing = false
    const binding = configure(result.binding, trace, () => preparing)
    const calls = createCallContainerStore<TestPlan, object>()
    runtime = createModelRuntime({
      ...world.construction,
      ...referencePorts(world.host, calls),
      calls,
      sessions: {
        async bind() {
          return { binding }
        },
      },
    })
    const opened = await runtime.service.openCall(world.request('p6_dispatch_preparation'))
    if (!('ref' in opened)) throw new Error(`original open failed ${JSON.stringify(opened)}`)
    expect(owner.active).toBe(0)
    trace.length = 0
    preparing = true
    const capturePlans = world.wire.plans()
    await work({ world, owner, runtime, calls, binding, ref: opened.ref, trace, capturePlans })
  } finally {
    if (runtime !== undefined) expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    expect(owner.active).toBe(0)
    await world.host.close()
  }
}

describe('original dispatch preparation over actual resources and SQL', () => {
  it.each([1, 2])('preserves the credential bytes getter fault on read %s', async failingRead => {
    const fault = new Error('original credential byte getter')
    let reads = 0
    await withPreparation(
      (binding, trace) => ({
        ...binding,
        credentials: {
          async value() {
            trace.push('credential')
            return {
              scope: { layer: 'factory' },
              get value(): Uint8Array {
                reads++
                if (reads === failingRead) throw fault
                return new TextEncoder().encode('original-secret')
              },
            }
          },
        },
      }),
      async ({ world, runtime, ref, owner, trace, capturePlans }) => {
        const before = await world.entries()
        expect(await runtime.service.dispatch(ref)).toEqual({ unavailable: true })
        expect(reads).toBe(failingRead)
        expect(trace).toEqual(['credential'])
        expect(await world.entries()).toEqual(before)
        expect(world.wire.plans()).toBe(capturePlans)
        expect(world.wire.sends()).toBe(0)
        expect(owner.active).toBe(0)
      },
    )
  })

  it.each(['wrong_tenant', 'invalid_utf8', 'scope_getter', 'credential_throw'] as const)(
    'does not spend an anchor or send when the current credential has %s',
    async mode => {
      const fault = new Error('original credential boundary')
      await withPreparation(
        (binding, trace, preparing) => {
          const value: Credential =
            mode === 'wrong_tenant'
              ? {
                  scope: {
                    layer: 'tenant',
                    tenant: unwrap(
                      parseTenantId({ organization: 'p6_other', account: 'p6_other' }),
                    ),
                  },
                  value: new TextEncoder().encode('original-secret'),
                }
              : mode === 'scope_getter'
                ? {
                    get scope(): never {
                      throw fault
                    },
                    value: new TextEncoder().encode('original-secret'),
                  }
                : {
                    scope: { layer: 'factory' },
                    value:
                      mode === 'invalid_utf8'
                        ? new Uint8Array([255])
                        : new TextEncoder().encode('original-secret'),
                  }
          const credentials: SessionRuntimeBinding['credentials'] = {
            async value(tenant, origin) {
              if (!preparing()) return await binding.credentials.value(tenant, origin)
              expect(this).toBe(credentials)
              expect(tenant).toBe(binding.log.tenant)
              trace.push(`credential:${origin}`)
              if (mode === 'credential_throw') throw fault
              return value
            },
          }
          return { ...binding, credentials }
        },
        async ({ world, runtime, calls, ref, owner, trace, capturePlans }) => {
          const before = await world.entries()
          expect(await runtime.service.dispatch(ref)).toEqual({ unavailable: true })
          expect(trace).toHaveLength(1)
          expect(await world.entries()).toEqual(before)
          expect(world.wire.plans()).toBe(capturePlans)
          expect(world.wire.sends()).toBe(0)
          expect(owner.active).toBe(0)
          expect(calls.find(ref)?.view().operation).toEqual({ phase: 'ready' })
        },
      )
    },
  )

  it('keeps timing unavailability before credential and tools reads', async () => {
    await withPreparation(
      (binding, trace, preparing) => ({
        ...binding,
        currentEvaluationInputs: {
          async read(...args) {
            if (!preparing()) return await binding.currentEvaluationInputs.read(...args)
            trace.push('timing')
            return { failure: 'unavailable' }
          },
        },
        credentials: {
          async value(...args) {
            if (!preparing()) return await binding.credentials.value(...args)
            trace.push('credential')
            throw new Error('credential read after timing refusal')
          },
        },
        get tools() {
          if (!preparing()) return binding.tools
          trace.push('tools')
          throw new Error('tools read after timing refusal')
        },
      }),
      async ({ world, runtime, ref, owner, trace, capturePlans }) => {
        const before = await world.entries()
        expect(await runtime.service.dispatch(ref)).toEqual({ unavailable: true })
        expect(trace).toEqual(['timing'])
        expect(await world.entries()).toEqual(before)
        expect(world.wire.plans()).toBe(capturePlans)
        expect(world.wire.sends()).toBe(0)
        expect(owner.active).toBe(0)
      },
    )
  })

  it('catches the original tools boundary after obtaining the credential', async () => {
    await withPreparation(
      (binding, trace, preparing) => ({
        ...binding,
        credentials: {
          async value(...args) {
            trace.push('credential')
            return await binding.credentials.value(...args)
          },
        },
        get tools() {
          if (!preparing()) return binding.tools
          trace.push('tools')
          throw new Error('original tools getter')
        },
      }),
      async ({ world, runtime, ref, owner, trace, capturePlans }) => {
        const before = await world.entries()
        expect(await runtime.service.dispatch(ref)).toEqual({ unavailable: true })
        expect(trace).toEqual(['credential', 'tools'])
        expect(await world.entries()).toEqual(before)
        expect(world.wire.plans()).toBe(capturePlans)
        expect(world.wire.sends()).toBe(0)
        expect(owner.active).toBe(0)
      },
    )
  })

  it('carries the captured snapshot, parameters and messages through the owned transport input', async () => {
    await withPreparation(
      binding => binding,
      async ({ world, runtime, calls, ref, owner, capturePlans }) => {
        const view = calls.find(ref)?.view()
        if (view === undefined) throw new Error('original container missing')
        expect(await runtime.service.dispatch(ref)).toHaveProperty('replyPending')
        const planned = world.wire.planned()
        if (planned === undefined) throw new Error('original plan missing')
        expect(planned.input.snapshot).toEqual(view.binding.snapshot)
        expect(planned.input.parameters).toEqual(view.binding.parameters)
        expect(planned.input.messages).toEqual(view.request.messages)
        expect(world.wire.plans()).toBe(capturePlans + 1)
        expect(world.wire.sends()).toBe(1)
        expect(owner.active).toBe(0)
      },
    )
  })

  it('retains the original credential read until actual stop after its value completes', async () => {
    const entered = deferred<void>()
    const valueAllowed = deferred<void>()
    const stopAllowed = deferred<void>()
    let originalOwner: ControlledSettlementOwner | undefined
    await withPreparation(
      (binding, trace) => ({
        ...binding,
        credentials: {
          async value(...args) {
            trace.push('credential')
            if (originalOwner === undefined) throw new Error('original owner not assigned')
            originalOwner.stopBarrier = stopAllowed.promise
            entered.resolve()
            await valueAllowed.promise
            const result = await binding.credentials.value(...args)
            trace.push('value-completed')
            return result
          },
        },
      }),
      async ({ world, runtime, ref, owner, trace, capturePlans }) => {
        originalOwner = owner
        const before = await world.entries()
        let completed = false
        const dispatching = runtime.service.dispatch(ref).then(result => {
          completed = true
          return result
        })
        try {
          await entered.promise
          expect(owner.active).toBe(1)
          valueAllowed.resolve()
          await new Promise<void>(resolve => setImmediate(resolve))
          expect(trace).toEqual(['credential', 'value-completed'])
          expect(completed).toBe(false)
          expect(owner.active).toBe(1)
          expect(await world.entries()).toEqual(before)
          expect(world.wire.plans()).toBe(capturePlans)
          expect(world.wire.sends()).toBe(0)
          stopAllowed.resolve()
          expect(await dispatching).toHaveProperty('replyPending')
          expect(owner.active).toBe(0)
          expect(world.wire.sends()).toBe(1)
        } finally {
          valueAllowed.resolve()
          stopAllowed.resolve()
          owner.stopBarrier = undefined
          await dispatching
        }
      },
    )
  })
})
