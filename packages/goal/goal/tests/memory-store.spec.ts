import { describe, it } from 'vitest'
import { createMemoryGoalStore, storeConformance } from '@omne-harness/goal/testing'

describe('the memory store holds what every goal store holds', () => {
  it.each(storeConformance.map(entry => [entry.name, entry] as const))(
    '%s',
    async (_name, entry) => {
      await entry.run(async () => createMemoryGoalStore())
    },
  )
})
