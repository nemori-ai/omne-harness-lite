import { expect, it } from 'vitest'
import { sessionModelRequestPreparation } from '@omne-harness-lite/session-runtime-local'
import { createServiceControl } from '@omne-harness-lite/session-runtime-local'
import { acknowledgementHost } from '../../../session/session-runtime-local/tests/model-runtime/acknowledgement-host-fixture.ts'

for (const command of ['interrupt', 'releaseCall'] as const) {
  it(`${command} uses Session call history and preserves a failed read without writing`, async () => {
    const world = await acknowledgementHost()
    let reads = 0
    const control = createServiceControl({
      ...world.construction,
      requestPreparation: {
        ...world.construction.requestPreparation,
        async readCall() {
          reads++
          return { unavailable: true as const, reason: 'history' as const }
        },
      },
    })
    try {
      const before = await world.entries()
      const input = {
        session: world.host.session,
        callId: 'missing-call',
        initiator: 'user' as const,
      }
      expect(await control[command](input)).toEqual({ unavailable: true })
      expect(reads).toBe(1)
      expect(await world.entries()).toEqual(before)
    } finally {
      expect(await control.close()).toEqual({ released: true })
      expect(await world.runtime.close()).toEqual({ released: true })
      await world.host.close()
    }
  })
}

it('compares retained readers against one actual Session prefix and rejects disagreement', async () => {
  const world = await acknowledgementHost()
  try {
    const opened = await world.service.openCall(world.request('retained-readers'))
    if (!('ref' in opened)) throw new Error('original call absent')
    const bound = await world.construction.sessions.bind(world.host.session)
    if ('failure' in bound) throw new Error('Session binding absent')
    const acquired = bound.binding.selection.owner.acquire(
      world.construction.settlementContention.limits.concurrent,
    )
    if (!('registration' in acquired)) throw new Error('read registration absent')
    const binding = bound.binding.log
    let reads = 0
    const observed = {
      ...binding,
      async readPrefix() {
        reads++
        if (binding.readPrefix === undefined) throw new Error('original prefix source absent')
        return await binding.readPrefix()
      },
    }
    try {
      let samePrefix: unknown
      const request = {
        binding: observed,
        registration: acquired.registration,
        callId: 'absent-call',
        interpret: world.construction.history.call.bind(world.construction.history),
      }
      const consistent = await sessionModelRequestPreparation.readCall({
        ...request,
        interpret(prefix, callId) {
          samePrefix = prefix
          return request.interpret(prefix, callId)
        },
        additionalReaders: [
          {
            callId: 'absent-call',
            interpret(prefix, callId) {
              expect(prefix).toBe(samePrefix)
              return request.interpret(prefix, callId)
            },
          },
        ],
      })
      expect(consistent).toEqual({ absent: true })
      expect(reads).toBe(1)
      expect(
        await sessionModelRequestPreparation.readCall({
          ...request,
          additionalReaders: [{ callId: opened.ref.callId, interpret: request.interpret }],
        }),
      ).toEqual({ unavailable: true, reason: 'history' })
      expect(reads).toBe(2)
      expect(
        await sessionModelRequestPreparation.readCall({
          ...request,
          additionalReaders: [
            {
              callId: 'absent-call',
              interpret() {
                throw new Error('original reader failed')
              },
            },
          ],
        }),
      ).toEqual({ unavailable: true, reason: 'history' })
      expect(reads).toBe(3)
    } finally {
      acquired.registration.release()
    }
  } finally {
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
})
