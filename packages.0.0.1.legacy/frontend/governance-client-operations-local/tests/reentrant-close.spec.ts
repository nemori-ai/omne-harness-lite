import type {
  GovernanceClientOperations,
  GovernanceUse,
} from '@omne-harness-lite/governance-client-operations'
import type { GovernanceTransport } from '@omne-harness-lite/governance-center-entry-https-json'
import { expect, test } from 'vitest'
import { createGovernanceClient } from '../src/index.ts'
import { fixtures } from './support.ts'

const fixture = fixtures()
const transport: GovernanceTransport = {
  readPublicHealth: async () => ({ kind: 'unavailable', reason: 'connection' }),
  exchangeGovernance: async () => ({
    kind: 'unavailable',
    reason: 'connection',
    sendAttempted: false,
  }),
}
for (const target of ['root', 'use'] as const) {
  test(`${target} close retains a read that synchronously reenters through the public state dependency`, async () => {
    const { state } = await fixture()
    const gate = Promise.withResolvers<void>()
    let client: GovernanceClientOperations
    let use: GovernanceUse | undefined
    let armed = false
    let closed = false
    let closing: Promise<void> | undefined
    client = createGovernanceClient({
      transport,
      state: {
        read() {
          if (!armed) return state.read()
          armed = false
          closing = (target === 'root' ? client : use!).close().then(() => {
            closed = true
          })
          return gate.promise.then(() => state.read())
        },
        compareAndReplace: (...args) => state.compareAndReplace(...args),
      },
    })
    if (target === 'use') {
      const opened = await client.openUse()
      if (opened.kind !== 'use') throw new Error('Missing test use')
      use = opened.use
    }
    armed = true
    const work = target === 'root' ? client.openUse() : use!.run({ action: 'logout' })
    try {
      await new Promise(resolve => setImmediate(resolve))
      expect(closed).toBe(false)
      gate.resolve()
      const result = await work
      if (target === 'root') expect(result).toEqual({ kind: 'blocked', reason: 'reenter-required' })
      else expect(result).not.toHaveProperty('defect')
      await closing
      expect(closed).toBe(true)
    } finally {
      gate.resolve()
      await work
      await client.close()
    }
  })
}
