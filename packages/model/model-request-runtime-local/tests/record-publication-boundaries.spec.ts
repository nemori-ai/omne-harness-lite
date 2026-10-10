import { expect, it } from 'vitest'
import type { ModelCallPublicationInput } from '@omne-harness-lite/model-request-runtime'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { acknowledgementHost } from './acknowledgement-host-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'

it('requires Session record publication before opening a new call or storing its content', async () => {
  const world = await acknowledgementHost()
  const calls = createCallContainerStore<TestPlan, object>()
  let publications = 0
  let callId: string | undefined
  const construction = {
    ...world.construction,
    ...referencePorts(world.host, calls),
    calls,
    async recordPublication(input: ModelCallPublicationInput) {
      publications++
      if (input.content.kind !== 'created') throw new Error('creation publication expected')
      callId = input.content.value.ref.callId
      return { unavailable: true as const }
    },
  }
  const runtime = createModelRuntime(construction)
  try {
    const before = await world.entries()
    const result = await runtime.service.openCall(world.request('publication-required'))
    expect(result).toEqual({ unavailable: true })
    expect(publications).toBe(1)
    if (callId === undefined) throw new Error('creation identity absent')
    expect(await world.contentRows(callId)).toBe(0)
    expect(world.wire.sends()).toBe(0)
    expect(await world.entries()).toEqual(before)
  } finally {
    expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
})
