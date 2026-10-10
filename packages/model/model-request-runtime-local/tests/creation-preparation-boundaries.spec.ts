import { expect, it } from 'vitest'
import { sessionModelRequestPreparation } from '@omne-harness-lite/session-runtime-local'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'

it('requires Session creation preparation before planning, storing content or opening a call', async () => {
  const world = await acknowledgementHost()
  const calls = createCallContainerStore<TestPlan, object>()
  let prepared = 0
  const runtime = createModelRuntime({
    ...world.construction,
    ...referencePorts(world.host, calls),
    calls,
    requestPreparation: {
      ...sessionModelRequestPreparation,
      async prepareCreation() {
        prepared++
        return { unavailable: true as const }
      },
    },
  })
  try {
    const before = await world.entries()
    expect(await runtime.service.openCall(world.request('creation-preparation-denied'))).toEqual({
      unavailable: true,
    })
    expect(prepared).toBe(1)
    expect(world.wire.plans()).toBe(0)
    expect(world.wire.sends()).toBe(0)
    expect(await world.entries()).toEqual(before)
  } finally {
    expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
})

it('rejects a prepared creation for another call before acquiring or planning a model', async () => {
  const world = await acknowledgementHost()
  const calls = createCallContainerStore<TestPlan, object>()
  const runtime = createModelRuntime({
    ...world.construction,
    ...referencePorts(world.host, calls),
    calls,
    requestPreparation: {
      ...sessionModelRequestPreparation,
      async prepareCreation(input) {
        const result = await sessionModelRequestPreparation.prepareCreation(input)
        if (!('prepared' in result)) return result
        return {
          prepared: {
            ...result.prepared,
            content: {
              ...result.prepared.content,
              ref: { ...result.prepared.content.ref, callId: 'another-call' },
            },
          },
        }
      },
    },
  })
  try {
    const before = await world.entries()
    expect(await runtime.service.openCall(world.request('creation-preparation-mismatch'))).toEqual({
      unavailable: true,
    })
    expect(world.wire.plans()).toBe(0)
    expect(world.wire.sends()).toBe(0)
    expect(await world.entries()).toEqual(before)
  } finally {
    expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
})
