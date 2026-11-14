// @module-tag slow
import { describe, expect, it } from 'vitest'
import { failed, runR9Flow } from './flow.ts'

describe('R9 release tree as real processes', () => {
  it('serve accepts on the real rows, a login reaches a session, another tenant is denied, a restart keeps the login, no secret is printed', async () => {
    const record = await runR9Flow()
    expect(record.runs).toHaveLength(2)
    expect(record.steps.length).toBe(13)
    expect(new Set(record.checks.map(entry => entry.item))).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(
      failed(record.checks).map(
        entry => `[item ${String(entry.item)}] ${entry.name}: ${entry.detail}`,
      ),
    ).toEqual([])
  })
})
