import { afterEach, describe, it } from 'vitest'
import { sessionTransactionsConformance } from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { facadeFixture } from './fixtures/facade.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

describe('session-contract transaction conformance through the faces, on the memory pair', () => {
  const cases = sessionTransactionsConformance<string>()
  for (const test of cases)
    it(`${test.clause}: ${test.name}`, async () => {
      const h = await harness({ backend: memoryBackend })
      open.push(h)
      await test.run(facadeFixture(h))
    })
})
