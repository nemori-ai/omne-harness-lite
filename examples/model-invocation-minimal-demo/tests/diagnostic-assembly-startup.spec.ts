import { describe, expect, it, vi } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  DemoDiagnosticStartupFailure,
  openDemoDiagnosticAssembly,
  type DemoDiagnosticConfig,
} from '../src/diagnostic-assembly.ts'

const controlled = vi.hoisted(() => ({
  journal: vi.fn(),
  collector: vi.fn(),
}))
vi.mock('../src/diagnostic-journal.ts', () => ({ createDiagnosticJournal: controlled.journal }))
vi.mock('@omne-harness-lite/model-request-runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('@omne-harness-lite/model-request-runtime')>()),
  createDiagnosticCollector: controlled.collector,
}))

const incomplete = {
  incomplete: {
    pendingWrites: 0,
    pendingSinks: 0,
    pendingQueries: 0,
    pendingQueryIo: 0,
    openQueryHandles: 1,
    pendingQueryCloses: 1,
    queryCloseFailures: 0,
    flushFailed: false,
    resourcesOpen: true,
  },
  coverage: 'degraded',
} as const
const complete = { complete: true, coverage: 'complete' } as const

function config(): DemoDiagnosticConfig {
  return {
    local: { rootDir: '/private/local', collectorId: 'local' },
    tenant: {
      rootDir: '/private/tenant',
      collectorId: 'tenant',
      tenant: unwrap(parseTenantId({ organization: 'org', account: 'account' })),
    },
    transportRetainedInstancesMax: 2,
    transportRetirement: {
      waitMilliseconds: 10,
      force: false,
      schedule: () => () => {},
    },
    collector: {
      maxRecordBytes: 1024,
      maxFieldBytes: 256,
      queueMaxRecords: 2,
      queueMaxBytes: 2048,
      segmentMaxBytes: 1024,
      retainedMaxBytes: 2048,
      retainedMaxSegments: 2,
      retentionMs: 1000,
      queryMaxRecords: 2,
      queryMaxBytes: 1024,
      queryScanMaxBytes: 1024,
      queryConcurrency: 1,
      queryMaxDurationMs: 10,
      exportMaxRecords: 2,
      exportMaxBytes: 1024,
      closeWaitMs: 10,
      stderrMaxReports: 1,
      wallClock: () => new Date('2026-09-28T20:30:00Z'),
      monotonicClock: () => 10,
      schedule: () => ({ cancel() {} }),
    },
  }
}

describe('diagnostic assembly partial startup ownership', () => {
  it('retains both failed journal owners and retries both without false complete', async () => {
    const tenantClose = vi
      .fn()
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(complete)
      .mockResolvedValueOnce(complete)
    const localClose = vi
      .fn()
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(complete)
    controlled.journal.mockReset()
    controlled.collector.mockReset()
    controlled.journal.mockResolvedValueOnce({ close: localClose })
    controlled.journal.mockResolvedValueOnce({ close: tenantClose })
    controlled.collector.mockReturnValueOnce({ close: localClose })
    controlled.collector.mockImplementationOnce(() => {
      throw new Error('controlled second collector construction failure')
    })

    let failure: unknown
    try {
      await openDemoDiagnosticAssembly(config())
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(DemoDiagnosticStartupFailure)
    if (!(failure instanceof DemoDiagnosticStartupFailure)) throw new Error('owner was lost')
    expect(failure.remainingOwners()).toBe(2)
    expect(localClose).toHaveBeenCalledTimes(1)
    expect(tenantClose).toHaveBeenCalledTimes(1)
    expect(await failure.retryCleanup()).toMatchObject({ complete: false })
    expect(localClose).toHaveBeenCalledTimes(2)
    expect(tenantClose).toHaveBeenCalledTimes(2)
    expect(await failure.retryCleanup()).toMatchObject({ complete: true })
    expect(localClose).toHaveBeenCalledTimes(3)
    expect(tenantClose).toHaveBeenCalledTimes(3)
  })
})
