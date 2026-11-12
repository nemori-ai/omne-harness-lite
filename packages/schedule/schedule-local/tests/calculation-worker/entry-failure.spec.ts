// @module-tag slow
// An isolated installed package copy exercises an unavailable compiled worker entry in a real process.
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const execute = promisify(execFile)
const member = fileURLToPath(new URL('../../', import.meta.url))
const scratch = fileURLToPath(
  new URL('../../../../../tmp/schedule-a2-worker/tests/', import.meta.url),
)

it(
  'starts the compiled worker when the public factory is imported with source conditions',
  { timeout: 15000 },
  async () => {
    const { stdout } = await execute(
      process.execPath,
      [
        '--conditions=source',
        '--input-type=module',
        '-e',
        `
    import assert from 'node:assert/strict'
    import { createScheduleCalculationWorker } from '@omne-harness/schedule-local'
    const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 0 })
    try {
      const result = await worker.calculator.enumerate({
        recurrence: { kind: 'once', localAt: '2026-11-04T09:00:00' },
        after: null, inclusive: true, take: 1, budget: { maxCandidates: 1, maxYears: 1 },
      }, { timeoutMs: 5000 })
      assert.equal(result.kind, 'completed')
      assert.deepEqual(result.value.candidates, [{ kind: 'civil', local: '2026-11-04T09:00:00' }])
      console.log('compiled worker completed')
    } finally {
      await worker.dispose()
    }
  `,
      ],
      { cwd: member, timeout: 10000 },
    )
    expect(stdout.trim()).toBe('compiled worker completed')
  },
)

it(
  'contains a compiled entry startup failure without unhandled errors',
  { timeout: 15000 },
  async () => {
    await mkdir(scratch, { recursive: true })
    const directory = await realpath(await mkdtemp(join(scratch, 'entry-failure-')))
    try {
      await cp(join(member, 'dist'), join(directory, 'dist'), { recursive: true })
      await cp(join(member, 'package.json'), join(directory, 'package.json'))
      await symlink(join(member, 'node_modules'), join(directory, 'node_modules'), 'dir')
      await rm(join(directory, 'dist/calculation-worker/entry.js'))
      const { stdout } = await execute(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
      import assert from 'node:assert/strict'
      import { createScheduleCalculationWorker } from '@omne-harness/schedule-local'
      const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 1 })
      try {
        const input = { recurrence: { kind: 'once', localAt: '2026-11-04T09:00:00' },
          after: null, inclusive: true, take: 1, budget: { maxCandidates: 1, maxYears: 1 } }
        const result = await worker.calculator.enumerate(input, { timeoutMs: 5000 })
        assert.deepEqual(result, { kind: 'unavailable', reason: 'workerFailure' })
        console.log(JSON.stringify(result))
      } finally {
        await worker.dispose()
      }
    `,
        ],
        { cwd: directory, timeout: 10000 },
      )
      expect(JSON.parse(stdout)).toEqual({ kind: 'unavailable', reason: 'workerFailure' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
