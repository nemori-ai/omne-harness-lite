import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createDiagnosticPort,
  keepBusinessResult,
  type DiagnosticBounds,
  type DiagnosticSink,
} from '@omne-harness/diagnostic'

const correlation = {
  tenant: 'org/account',
  work: 'op-1',
  attempt: '1',
  instance: 'i-1',
  generation: 'g-1',
}

function bounds(partial: Partial<DiagnosticBounds> = {}): DiagnosticBounds {
  return {
    profile: 'probe-profile',
    os: 'Darwin',
    node: 'v26.0.0',
    load: 'synthetic-one-record',
    overLimit: 'reject',
    maxQueue: 2,
    maxExportBytes: 80,
    maxInFlight: 1,
    ...partial,
  }
}

function chain(summary: string, detail?: Record<string, string>) {
  const origin = detail
    ? { role: 'origin' as const, summary, detail }
    : { role: 'origin' as const, summary }
  return { causes: [origin] }
}

function sinkOf(exportRecord: DiagnosticSink['export']): DiagnosticSink {
  return { export: exportRecord }
}

describe('createDiagnosticPort', () => {
  it('refuses to start without a profile', () => {
    expect(() =>
      createDiagnosticPort({
        bounds: bounds({ profile: '' }),
        sink: sinkOf(async () => undefined),
        closeDeadlineMs: 10,
      }),
    ).toThrow(/profile is required/)
  })

  it('keeps an accepted record when a later admit is refused', async () => {
    const port = createDiagnosticPort({
      bounds: bounds(),
      closeDeadlineMs: 20,
      sink: sinkOf(async () => undefined),
    })
    const first = keepBusinessResult({ kind: 'Committed' as const }, port, {
      chain: chain('committed'),
      correlation,
    })
    expect(first.business.kind).toBe('Committed')
    expect(first.diagnostic.status).toBe('accepted')
    await new Promise(resolve => setTimeout(resolve, 10))
    const second = port.admit({ chain: chain('x'.repeat(200)), correlation })
    expect(second).toEqual({ status: 'rejected', reason: 'bytes_full' })
    if (first.diagnostic.status !== 'accepted') throw new Error('expected accepted')
    const visible = port.read({ tenant: 'org/account', id: first.diagnostic.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.chain.causes[0]?.role).toBe('origin')
  })

  it('refuses a new record when the queue is full', async () => {
    let release = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const port = createDiagnosticPort({
      bounds: bounds({ maxQueue: 1, maxExportBytes: 1000, maxInFlight: 1 }),
      closeDeadlineMs: 20,
      sink: sinkOf(async (_record, signal) => {
        await gate
        if (signal.aborted) throw new Error('closed')
      }),
    })
    expect(port.admit({ chain: chain('one'), correlation }).status).toBe('accepted')
    await new Promise(resolve => setImmediate(resolve))
    expect(port.admit({ chain: chain('two'), correlation })).toEqual({
      status: 'rejected',
      reason: 'queue_full',
    })
    release()
    await port.close()
  })

  it('refuses a new record when an export is already in flight', async () => {
    const port = createDiagnosticPort({
      bounds: bounds({ maxQueue: 5, maxExportBytes: 1000, maxInFlight: 1 }),
      closeDeadlineMs: 20,
      sink: sinkOf(
        (_record, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('closed')))
          }),
      ),
    })
    expect(port.admit({ chain: chain('one'), correlation }).status).toBe('accepted')
    await new Promise(resolve => setImmediate(resolve))
    expect(port.admit({ chain: chain('two'), correlation })).toEqual({
      status: 'rejected',
      reason: 'in_flight_full',
    })
    await port.close()
  })

  it('keeps the business result and appends an export cause when the sink throws', async () => {
    const port = createDiagnosticPort({
      bounds: bounds(),
      closeDeadlineMs: 20,
      sink: sinkOf(async () => {
        throw new Error('sink down')
      }),
    })
    const result = keepBusinessResult({ kind: 'Committed' as const }, port, {
      chain: chain('committed', { secret: 'hide-me', code: 'lock' }),
      correlation,
    })
    expect(result.business.kind).toBe('Committed')
    await new Promise(resolve => setTimeout(resolve, 10))
    if (result.diagnostic.status !== 'accepted') throw new Error('expected accepted')
    const visible = port.read({ tenant: 'org/account', id: result.diagnostic.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.exportStatus).toBe('export_failed')
    expect(visible.chain.causes.map(cause => cause.role)).toEqual(['origin', 'export'])
    const origin = visible.chain.causes[0]
    if (origin?.role === 'export') throw new Error('origin was overwritten')
    expect(origin?.detail?.secret).toBeUndefined()
    expect(origin?.detail?.code).toBe('lock')
    expect(port.read({ tenant: 'other-tenant', id: result.diagnostic.id })).toEqual({
      status: 'denied',
    })
  })

  it('keeps a model failure beside an origin and an attached cause', async () => {
    const port = createDiagnosticPort({
      bounds: bounds({ maxExportBytes: 1000 }),
      closeDeadlineMs: 20,
      sink: sinkOf(async () => undefined),
    })
    const failure = { kind: 'unknown' as const, callId: 'call-9' }
    const result = keepBusinessResult(failure, port, {
      chain: {
        causes: [
          { role: 'origin', summary: 'provider threw' },
          { role: 'attached', summary: 'retry not confirmed' },
        ],
      },
      correlation,
    })
    expect(result.business).toBe(failure)
    expect(result.diagnostic).not.toBe(failure)
    expect(result.diagnostic.status).toBe('accepted')
    await new Promise(resolve => setTimeout(resolve, 10))
    if (result.diagnostic.status !== 'accepted') throw new Error('expected accepted')
    const visible = port.read({ tenant: 'org/account', id: result.diagnostic.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.chain.causes.map(cause => cause.role)).toEqual(['origin', 'attached'])
    expect(visible.chain.causes.map(cause => cause.summary)).toEqual([
      'provider threw',
      'retry not confirmed',
    ])
  })

  it('records a visible gap when no sink is supplied', () => {
    const port = createDiagnosticPort({ bounds: bounds(), closeDeadlineMs: 5, sink: null })
    const result = keepBusinessResult({ kind: 'Committed' as const }, port, {
      chain: chain('committed'),
      correlation,
    })
    expect(result.business.kind).toBe('Committed')
    expect(result.diagnostic.status).toBe('gap')
    if (result.diagnostic.status !== 'gap') throw new Error('expected gap')
    const visible = port.read({ tenant: 'org/account', id: result.diagnostic.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.exportStatus).toBe('gap')
  })

  it('returns the business close before diagnostic close finishes', async () => {
    const port = createDiagnosticPort({
      bounds: bounds(),
      closeDeadlineMs: 30,
      sink: sinkOf(
        (_record, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('closed')))
          }),
      ),
    })
    port.admit({ chain: chain('committed'), correlation })
    const business = { status: 'closed' as const }
    const diagnosticClose = port.close()
    expect(business.status).toBe('closed')
    expect(port.close()).toBe(diagnosticClose)
    const report = await diagnosticClose
    expect(report.status).toBe('closed')
    expect(report.unfinished).toHaveLength(1)
    expect(report.flush).toEqual({ kind: 'deadline' })
    expect(report.transport).toEqual({ kind: 'deadline' })
    expect(report.lastRecord.kind).toBe('unhanded')
    await expect(diagnosticClose).resolves.toBe(report)
  })

  it('writes an admitted record into a directory the caller chooses', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagnostic-export-'))
    try {
      const port = createDiagnosticPort({
        bounds: bounds({ maxExportBytes: 1000 }),
        closeDeadlineMs: 50,
        sink: sinkOf(async (record, signal) => {
          const { writeFile } = await import('node:fs/promises')
          await writeFile(join(dir, `${record.id}.json`), JSON.stringify(record), { signal })
        }),
      })
      const committed = { kind: 'Committed' as const }
      const result = keepBusinessResult(committed, port, {
        chain: chain('committed'),
        correlation,
      })
      expect(result.business).toBe(committed)
      await new Promise(resolve => setTimeout(resolve, 30))
      if (result.diagnostic.status !== 'accepted') throw new Error('expected accepted')
      const text = await readFile(join(dir, `${result.diagnostic.id}.json`), 'utf8')
      expect(text).toContain('"summary":"committed"')
      const visible = port.read({ tenant: 'org/account', id: result.diagnostic.id })
      expect(visible.status).toBe('visible')
      if (visible.status !== 'visible') throw new Error('expected visible')
      expect(visible.exportStatus).toBe('exported')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps the business result when the directory write fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagnostic-missing-'))
    try {
      const port = createDiagnosticPort({
        bounds: bounds({ maxExportBytes: 1000 }),
        closeDeadlineMs: 20,
        sink: sinkOf(async (record, signal) => {
          const { writeFile } = await import('node:fs/promises')
          await writeFile(
            join(dir, 'missing-parent', `${record.id}.json`),
            JSON.stringify(record),
            {
              signal,
            },
          )
        }),
      })
      const committed = { kind: 'Committed' as const }
      const result = keepBusinessResult(committed, port, {
        chain: chain('committed'),
        correlation,
      })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(result.business).toBe(committed)
      if (result.diagnostic.status !== 'accepted') throw new Error('expected accepted')
      const visible = port.read({ tenant: 'org/account', id: result.diagnostic.id })
      expect(visible.status).toBe('visible')
      if (visible.status !== 'visible') throw new Error('expected visible')
      expect(visible.exportStatus).toBe('export_failed')
      expect(visible.chain.causes.map(cause => cause.role)).toEqual(['origin', 'export'])
      await expect(
        stat(join(dir, 'missing-parent', `${result.diagnostic.id}.json`)),
      ).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not leave a file when close aborts a delayed write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagnostic-close-'))
    try {
      const port = createDiagnosticPort({
        bounds: bounds({ maxExportBytes: 1000 }),
        closeDeadlineMs: 20,
        sink: sinkOf(
          (record, signal) =>
            new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                void import('node:fs/promises')
                  .then(({ writeFile }) =>
                    writeFile(join(dir, `${record.id}.json`), JSON.stringify(record)),
                  )
                  .then(resolve, reject)
              }, 200)
              signal.addEventListener('abort', () => {
                clearTimeout(timer)
                reject(new Error('closed'))
              })
            }),
        ),
      })
      const admitted = port.admit({ chain: chain('committed'), correlation })
      const business = { status: 'closed' as const }
      const diagnosticClose = port.close()
      expect(business.status).toBe('closed')
      const report = await diagnosticClose
      expect(report.flush).toEqual({ kind: 'deadline' })
      expect(report.transport).toEqual({ kind: 'deadline' })
      expect(report.unfinished).toHaveLength(1)
      if (admitted.status !== 'accepted') throw new Error('expected accepted')
      await expect(stat(join(dir, `${admitted.id}.json`))).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
