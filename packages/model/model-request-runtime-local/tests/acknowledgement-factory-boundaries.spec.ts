// @module-tag slow
import { expect, it } from 'vitest'
import { createSessionModelAcknowledgement } from '@omne-harness-lite/session-runtime-local'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createCallContainerStore } from '../src/service-container.ts'
import { acknowledgementHost, acknowledgements } from './acknowledgement-host-fixture.ts'
import { referencePorts } from './reference-ports-fixture.ts'
import type { TestPlan } from './anchored-invocation-fixture.ts'

it('uses the injected Session ACK owner before fixing or clearing original model content', async () => {
  const world = await acknowledgementHost()
  const calls = createCallContainerStore<TestPlan, object>()
  let requested = 0
  const runtime = createModelRuntime({
    ...world.construction,
    ...referencePorts(world.host, calls),
    calls,
    acknowledgementFactory(input) {
      const original = createSessionModelAcknowledgement(input)
      return {
        ...original,
        async acknowledgeCall() {
          requested++
          return { unavailable: true as const }
        },
      }
    },
  })
  world.grant('owner', ['read', 'wait', 'settle', 'cancel', 'ack'])
  try {
    const opened = await runtime.service.openCall(world.request('session-ack-owner'))
    if (!('ref' in opened)) throw new Error('expected original call')
    const ref = opened.ref
    const dispatched = await runtime.service.dispatch(ref)
    if (!('replyPending' in dispatched)) throw new Error('expected retained reply')
    const before = await world.contentRows(ref.callId)
    const result = await runtime.service.acknowledgeCall({
      ref,
      expectedResult: { kind: 'response', response: dispatched.replyPending.id },
    })
    expect(result).toEqual({ unavailable: true })
    expect(requested).toBe(1)
    expect(before).toBeGreaterThan(0)
    expect(await world.contentRows(ref.callId)).toBe(before)
    expect(acknowledgements(await world.entries(), ref.callId)).toHaveLength(0)
  } finally {
    expect(await runtime.close()).toEqual({ released: true })
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
})
