import { describe, expect, it } from 'vitest'
import { createMemoryStore, runCanvasProperties } from '@omne-harness/canvas/testing'

describe('random sequences of every write keep the properties of the arrangement', () => {
  it.each(Array.from({ length: 40 }, (_, seed) => seed + 1))(
    'over the memory store, seed %i',
    async seed => {
      await expect(
        runCanvasProperties(async () => createMemoryStore(), seed, 80),
      ).resolves.toBeUndefined()
    },
  )
})
