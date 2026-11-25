import { describe, expect, it } from 'vitest'
import { runCanvasProperties } from '@omne-harness/canvas/testing'
import { createInProcessStore } from './in-process.ts'

describe('random sequences of every write keep the properties of the arrangement over SQLite', () => {
  it.each(Array.from({ length: 12 }, (_, seed) => seed + 101))(
    'in the test process, seed %i',
    async seed => {
      await expect(
        runCanvasProperties(async () => createInProcessStore(), seed, 80),
      ).resolves.toBeUndefined()
    },
  )
})
