import { expect, it } from 'vitest'
import { sessionModelSettlement } from '@omne-harness-lite/session-runtime-local'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { harness } from './anchored-invocation-fixture.ts'

it('keeps the original reply pending when the Session settlement owner refuses its final batch', async () => {
  await harness(async h => {
    let refused = true
    let requested = 0
    const handle = createAnchoredModelInvocation({
      ...h.input,
      settlementFactory: {
        ...sessionModelSettlement,
        create(input) {
          const original = sessionModelSettlement.create(input)
          return {
            ...original,
            settle(request) {
              requested++
              return refused
                ? {
                    completion: Promise.resolve({
                      unavailable: true as const,
                      reason: 'dependency' as const,
                    }),
                    stopped: Promise.resolve(),
                    requestStop() {},
                  }
                : original.settle(request)
            },
          }
        },
      },
    })
    try {
      expect(await handle.outcome).toHaveProperty('replyPending')
      const writesBefore = h.writes.length
      expect(await handle.settleReply('persisted')).toEqual({
        unavailable: true,
        reason: 'dependency',
      })
      expect(requested).toBe(1)
      expect(h.writes).toHaveLength(writesBefore)
      refused = false
      expect(await handle.settleReply('persisted')).toHaveProperty('settled')
      expect(requested).toBe(2)
    } finally {
      refused = false
      expect(await handle.close()).toEqual({ released: true })
    }
  })
})
