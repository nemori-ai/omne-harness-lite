// @module-tag slow
import { describe, expect, it } from 'vitest'
import { failedChecks, failedSteps, runIdentityFlow } from './flow.ts'

describe('identity end to end over real processes', () => {
  it('every step answers the expected outcome and exit code, and every check holds', async () => {
    const record = await runIdentityFlow()
    expect(record.aborted).toBeUndefined()
    expect(new Set(record.steps.map(entry => entry.step))).toEqual(
      new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
    )
    expect(record.runs).toHaveLength(2)
    expect(
      failedSteps(record).map(
        entry =>
          `[step ${String(entry.step)}] ${entry.label}: ${String(entry.outcome)}/${String(entry.exitCode)}`,
      ),
    ).toEqual([])
    expect(failedChecks(record).map(entry => `${entry.name}: ${entry.actual}`)).toEqual([])
  }, 300_000)
})
