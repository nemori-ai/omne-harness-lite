import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { Block } from './cell.ts'
import { runMatrix } from './runner.ts'

const BLOCK_TIMEOUT_MS = 1_800_000

export function matrixBlock(block: Block): void {
  it(
    `the interruption-and-return matrix, block ${block}: every protocol cell ends as its expectation says`,
    { timeout: BLOCK_TIMEOUT_MS },
    async () => {
      const summary = await runMatrix({
        blocks: [block],
        out: join(tmpdir(), `matrix-${block}-${String(process.pid)}.json`),
      })
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
}
