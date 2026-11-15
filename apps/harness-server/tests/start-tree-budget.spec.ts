import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startTree } from '../src/loader.ts'
import * as readiness from '../src/readiness.ts'
import { createTrust } from '../src/trust.ts'
import type { RowId, RowManifest, TreeRow } from '../src/types.ts'

vi.mock('../src/readiness.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/readiness.ts')>()
  return { ...actual, awaitReadiness: vi.fn(actual.awaitReadiness) }
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function waitGiven(readinessTimeoutMs: number, loadingMs: number) {
  let now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const manifest: RowManifest = { provides: [], injects: [], phase: null, sameProviderGroup: null }
  const row: TreeRow = { id: 'slow' as RowId, plugin: 'slow', config: {}, source: 'distribution' }
  const waits = vi.mocked(readiness.awaitReadiness)
  waits.mockClear()
  const root = new Context()
  const result = await startTree({
    root,
    trust: createTrust([], new Map()),
    rows: [
      {
        row,
        manifest,
        plugin: {
          apply() {
            now += loadingMs
          },
        },
      },
    ],
    entryObjects: [],
    readinessTimeoutMs,
    barrier: () => {},
  })
  expect(result.kind).toBe('started')
  expect(waits).toHaveBeenCalledTimes(1)
  return waits.mock.calls[0]![0].timeoutMs
}

describe('the readiness wait after loading', () => {
  it('gets the part of the deadline that loading did not use', async () => {
    expect(await waitGiven(500, 300)).toBe(200)
  })

  it('gets the whole deadline when loading took no time', async () => {
    expect(await waitGiven(500, 0)).toBe(500)
  })

  it('gets zero, not a negative wait, when loading used more than the deadline', async () => {
    expect(await waitGiven(500, 800)).toBe(0)
  })
})
