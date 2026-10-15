import { describe, expect, it } from 'vitest'
import {
  createDiagnosticPort,
  type AdmitInput,
  type DiagnosticSink,
} from '@omne-harness/diagnostic'

const correlation = {
  tenant: 'org/account',
  work: 'op-1',
  attempt: '1',
  instance: 'i-1',
  generation: 'g-1',
}

function portWith(
  partial: { maxQueue?: number; maxExportBytes?: number; maxInFlight?: number },
  sink: DiagnosticSink | null,
) {
  return createDiagnosticPort({
    bounds: {
      profile: 'probe-profile',
      os: 'Darwin',
      node: 'v26.0.0',
      load: 'review-repro',
      overLimit: 'reject',
      maxQueue: partial.maxQueue ?? 4,
      maxExportBytes: partial.maxExportBytes ?? 4000,
      maxInFlight: partial.maxInFlight ?? 4,
    },
    sink,
    closeDeadlineMs: 200,
  })
}

describe('review counterexamples', () => {
  it('rejects an oversized record when no sink is configured', () => {
    const port = portWith({ maxQueue: 1, maxExportBytes: 80 }, null)
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'x'.repeat(500) }] },
      correlation,
    })
    expect(admitted).toMatchObject({ status: 'rejected', reason: 'bytes_full' })
  })

  it('rejects a caller cause that is not attached', () => {
    const port = portWith({}, { export: async () => undefined })
    const input = {
      chain: {
        causes: [
          { role: 'origin', summary: 'a' },
          { role: 'note', summary: 'b' },
        ],
      },
      correlation,
    } as AdmitInput
    expect(() => port.admit(input)).toThrow(/attached/)
  })

  it('counts correlation text toward the export byte limit', () => {
    const port = portWith({ maxExportBytes: 80 }, { export: async () => undefined })
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'ok' }] },
      correlation: { ...correlation, work: 'w'.repeat(10_000) },
    })
    expect(admitted).toEqual({ status: 'rejected', reason: 'bytes_full' })
  })

  it('keeps the stored tenant when the sink rewrites the exported record', async () => {
    const port = portWith(
      {},
      {
        export: async record => {
          const mutable = record as {
            correlation: { tenant: string }
            chain: { causes: { role: string; summary: string }[] }
          }
          mutable.correlation.tenant = 'intruder'
          mutable.chain.causes.push({ role: 'export', summary: 'forged' })
        },
      },
    )
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'ok' }] },
      correlation,
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    if (admitted.status !== 'accepted') throw new Error('expected accepted')
    expect(port.read({ tenant: 'org/account', id: admitted.id }).status).toBe('visible')
    expect(port.read({ tenant: 'intruder', id: admitted.id })).toEqual({ status: 'denied' })
  })

  it('keeps the queue limit captured at construction', () => {
    const raw = {
      profile: 'probe-profile',
      os: 'Darwin',
      node: 'v26.0.0',
      load: 'review-repro',
      overLimit: 'reject' as const,
      maxQueue: 2,
      maxExportBytes: 4000,
      maxInFlight: 4,
    }
    const port = createDiagnosticPort({
      bounds: raw,
      sink: { export: async () => undefined },
      closeDeadlineMs: 20,
    })
    raw.maxQueue = 1
    expect(
      port.admit({ chain: { causes: [{ role: 'origin', summary: 'a' }] }, correlation }).status,
    ).toBe('accepted')
    expect(
      port.admit({ chain: { causes: [{ role: 'origin', summary: 'b' }] }, correlation }).status,
    ).toBe('accepted')
  })

  it('starts every accepted export up to maxInFlight', async () => {
    const started: string[] = []
    let release = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const port = portWith(
      { maxInFlight: 4 },
      {
        export: async (record, signal) => {
          started.push(record.id)
          await gate
          if (signal.aborted) throw new Error('closed')
        },
      },
    )
    const first = port.admit({ chain: { causes: [{ role: 'origin', summary: 'a' }] }, correlation })
    const second = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'b' }] },
      correlation,
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(started).toHaveLength(2)
    release()
    await port.close()
    expect(first.status).toBe('accepted')
    expect(second.status).toBe('accepted')
  })

  it('keeps exporting accepted records after close until the deadline', async () => {
    const started: string[] = []
    let release = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const port = portWith(
      { maxInFlight: 4 },
      {
        export: async (record, signal) => {
          started.push(record.id)
          await gate
          if (signal.aborted) throw new Error('closed')
        },
      },
    )
    port.admit({ chain: { causes: [{ role: 'origin', summary: 'a' }] }, correlation })
    port.admit({ chain: { causes: [{ role: 'origin', summary: 'b' }] }, correlation })
    const closing = port.close()
    await new Promise(resolve => setImmediate(resolve))
    expect(started).toHaveLength(2)
    release()
    const report = await closing
    expect(report.flush.kind).toBe('counted')
  })
})
