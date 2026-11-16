// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { Block } from './cell.ts'
import { runMatrix } from './runner.ts'

const BLOCKS: readonly Block[] = ['K', 'H', 'Q', 'G', 'R', 'D', 'X']
const BLOCK_TIMEOUT_MS = 1_800_000

describe('the interruption-and-return matrix', () => {
  for (const block of BLOCKS)
    it(
      `block ${block}: every protocol cell ends as its expectation says`,
      { timeout: BLOCK_TIMEOUT_MS },
      async () => {
        const summary = await runMatrix({ blocks: [block] })
        expect(
          summary.mismatches.map(row => ({
            id: row.id,
            expected: row.expected,
            actual: row.actual,
            mismatch: row.mismatch,
          })),
        ).toEqual([])
      },
    )
})
