import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
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
    } as unknown as AdmitInput
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
          const mutable = record as unknown as {
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
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = () => resolve()
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
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = () => resolve()
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

  it('keeps the business result when export throws synchronously', async () => {
    const port = portWith({ maxQueue: 4, maxInFlight: 1 }, {
      export() {
        throw new Error('sync export failure')
      },
    })
    const business = { kind: 'Committed' as const }
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'committed' }] },
      correlation,
    })
    const second = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'next' }] },
      correlation,
    })
    expect(business.kind).toBe('Committed')
    expect(admitted.status).toBe('accepted')
    expect(second.status).toBe('accepted')
    if (admitted.status !== 'accepted') throw new Error('expected accepted')
    const visible = port.read({ tenant: 'org/account', id: admitted.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.exportStatus).toBe('export_failed')
    expect(visible.chain.causes.map(cause => cause.role)).toEqual(['origin', 'export'])
    expect(visible.chain.causes[1]).toMatchObject({ role: 'export', summary: 'sync export failure' })
    const report = await port.close()
    expect(report.unfinished).toEqual([])
    expect(report.exportFailed).toContain(admitted.id)
    expect(report.flush.kind).toBe('counted')
  })

  it('releases the oldest finished record when a later admission needs the queue', async () => {
    for (const mode of ['success', 'failure'] as const) {
      const port = portWith({ maxQueue: 1, maxExportBytes: 1000, maxInFlight: 1 }, {
        export: async () => {
          if (mode === 'failure') throw new Error('export failed')
        },
      })
      const ids: string[] = []
      for (let index = 0; index < 3; index += 1) {
        const admitted = port.admit({
          chain: { causes: [{ role: 'origin', summary: 'ok' }] },
          correlation,
        })
        expect(admitted.status).toBe('accepted')
        if (admitted.status !== 'accepted') throw new Error('expected accepted')
        ids.push(admitted.id)
        await new Promise(resolve => setImmediate(resolve))
      }
      expect(port.read({ tenant: 'org/account', id: ids[0] ?? '' }).status).toBe('absent')
      expect(port.read({ tenant: 'org/account', id: ids[1] ?? '' }).status).toBe('absent')
      const latest = port.read({ tenant: 'org/account', id: ids[2] ?? '' })
      expect(latest.status).toBe('visible')
      if (latest.status !== 'visible') throw new Error('expected visible')
      expect(latest.exportStatus).toBe(mode === 'success' ? 'exported' : 'export_failed')
      await port.close()
    }
  })

  it('does not release a gap or an in-flight record to make room', async () => {
    const gap = portWith({ maxQueue: 1, maxExportBytes: 1000 }, null)
    const firstGap = gap.admit({
      chain: { causes: [{ role: 'origin', summary: 'ok' }] },
      correlation,
    })
    expect(firstGap.status).toBe('gap')
    expect(
      gap.admit({ chain: { causes: [{ role: 'origin', summary: 'next' }] }, correlation }),
    ).toEqual({ status: 'rejected', reason: 'queue_full' })
    if (firstGap.status !== 'gap') throw new Error('expected gap')
    expect(gap.read({ tenant: 'org/account', id: firstGap.id }).status).toBe('visible')

    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = () => resolve()
    })
    const port = portWith({ maxQueue: 1, maxInFlight: 1 }, {
      export: async (_record, signal) => {
        await gate
        if (signal.aborted) throw new Error('closed')
      },
    })
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'ok' }] },
      correlation,
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(
      port.admit({ chain: { causes: [{ role: 'origin', summary: 'next' }] }, correlation }),
    ).toEqual({ status: 'rejected', reason: 'queue_full' })
    if (admitted.status !== 'accepted') throw new Error('expected accepted')
    expect(port.read({ tenant: 'org/account', id: admitted.id }).status).toBe('visible')
    release()
    await port.close()
  })

  it('keeps an export failure when the sink rejects with a non-Error', async () => {
    const port = portWith({}, {
      export: async () => {
        throw 'down'
      },
    })
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'committed' }] },
      correlation,
    })
    await new Promise(resolve => setImmediate(resolve))
    if (admitted.status !== 'accepted') throw new Error('expected accepted')
    const visible = port.read({ tenant: 'org/account', id: admitted.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.exportStatus).toBe('export_failed')
    expect(visible.chain.causes[1]).toMatchObject({ role: 'export', summary: 'export failed' })
    await port.close()
  })

  it('accepts a record that fills the export byte limit exactly', () => {
    const input = {
      chain: { causes: [{ role: 'origin' as const, summary: 'ok' }] },
      correlation,
    }
    const bytes = Buffer.byteLength(JSON.stringify({ chain: input.chain, correlation }), 'utf8')
    const exact = portWith({ maxExportBytes: bytes }, { export: async () => undefined })
    expect(exact.admit(input).status).toBe('accepted')
    const over = portWith({ maxExportBytes: bytes - 1 }, { export: async () => undefined })
    expect(over.admit(input)).toEqual({ status: 'rejected', reason: 'bytes_full' })
  })

  it('rejects fractional limits and a deadline the timer cannot represent', () => {
    expect(() => portWith({ maxQueue: 0.5 }, { export: async () => undefined })).toThrow(
      /positive integer/,
    )
    expect(() => portWith({ maxInFlight: 0.5 }, { export: async () => undefined })).toThrow(
      /positive integer/,
    )
    expect(() => portWith({ maxExportBytes: 0.5 }, { export: async () => undefined })).toThrow(
      /positive integer/,
    )
    expect(() =>
      createDiagnosticPort({
        bounds: {
          profile: 'probe-profile',
          os: 'Darwin',
          node: 'v26.0.0',
          load: 'review-repro',
          overLimit: 'reject',
          maxQueue: 1,
          maxExportBytes: 1000,
          maxInFlight: 1,
        },
        sink: { export: async () => undefined },
        closeDeadlineMs: 2_147_483_648,
      }),
    ).toThrow(/2147483647/)
  })

  it('returns the close deadline report without another active handle', () => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url))
    const script = `
      const { createDiagnosticPort } = await import(${JSON.stringify(entry)})
      const port = createDiagnosticPort({
        bounds: {
          profile: 'review',
          os: 'test',
          node: 'test',
          load: 'synthetic',
          overLimit: 'reject',
          maxQueue: 1,
          maxExportBytes: 1000,
          maxInFlight: 1,
        },
        closeDeadlineMs: 25,
        sink: { export: () => new Promise(() => {}) },
      })
      port.admit({
        chain: { causes: [{ role: 'origin', summary: 'committed' }] },
        correlation: { tenant: 'tenant-a' },
      })
      console.log(JSON.stringify(await port.close()))
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 2000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"kind":"deadline"')
  })
})
