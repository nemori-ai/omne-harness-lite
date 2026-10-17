import { readFileSync } from 'node:fs'
import { Writable } from 'node:stream'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { createDiagnosticPort } from '@omne-harness/diagnostic'

const correlation = {
  tenant: 'org/account',
  work: 'op-1',
  attempt: '1',
  instance: 'i-1',
  generation: 'g-1',
}

const bounds = {
  profile: 'pino-integration',
  os: 'Darwin',
  node: 'v26.0.0',
  load: 'one-record',
  overLimit: 'reject' as const,
  maxQueue: 4,
  maxExportBytes: 4000,
  maxInFlight: 1,
}

function collectingDestination(lines: string[]) {
  return new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
}

function failingDestination() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error('pino destination failed'))
    },
  })
}

describe('pino sink', () => {
  it('does not import pino from the diagnostic implementation', () => {
    const portSource = readFileSync(new URL('../src/port.ts', import.meta.url), 'utf8')
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies: Record<string, string>
    }
    expect(portSource.includes('pino')).toBe(false)
    expect(manifest.dependencies).toEqual({})
  })

  it('writes one admitted record through pino', async () => {
    const lines: string[] = []
    const logger = pino({ level: 'info' }, collectingDestination(lines))
    const committed = { kind: 'Committed' as const }
    const port = createDiagnosticPort({
      bounds,
      closeDeadlineMs: 50,
      sink: {
        export: async record => {
          logger.info({ id: record.id, bytes: record.bytes }, 'diagnostic export')
          await new Promise<void>((resolve, reject) => {
            logger.flush(err => (err ? reject(err) : resolve()))
          })
        },
      },
    })
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'committed' }] },
      correlation,
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(committed.kind).toBe('Committed')
    if (admitted.status !== 'accepted') throw new Error('expected accepted')
    expect(lines.join('')).toContain(admitted.id)
    expect(lines.join('')).toContain('diagnostic export')
    const visible = port.read({ tenant: 'org/account', id: admitted.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.exportStatus).toBe('exported')
  })

  it('keeps the business result when the pino destination fails', async () => {
    const committed = { kind: 'Committed' as const }
    const port = createDiagnosticPort({
      bounds,
      closeDeadlineMs: 50,
      sink: {
        export: record =>
          new Promise((resolve, reject) => {
            const destination = failingDestination()
            const logger = pino({ level: 'info' }, destination)
            let failed = false
            destination.on('error', error => {
              failed = true
              reject(error)
            })
            logger.error({ id: record.id }, 'diagnostic export')
            setTimeout(() => {
              if (failed) return
              logger.flush(error => {
                if (failed) return
                if (error) reject(error)
                else resolve()
              })
            }, 10)
          }),
      },
    })
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'committed' }] },
      correlation,
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(committed).toEqual({ kind: 'Committed' })
    if (admitted.status !== 'accepted') throw new Error('expected accepted')
    const visible = port.read({ tenant: 'org/account', id: admitted.id })
    expect(visible.status).toBe('visible')
    if (visible.status !== 'visible') throw new Error('expected visible')
    expect(visible.exportStatus).toBe('export_failed')
    expect(visible.chain.causes.map(cause => cause.role)).toEqual(['origin', 'export'])
  })

  it('refuses an over-budget record before pino writes it', async () => {
    const lines: string[] = []
    const logger = pino({ level: 'info' }, collectingDestination(lines))
    const port = createDiagnosticPort({
      bounds: { ...bounds, maxExportBytes: 80 },
      closeDeadlineMs: 20,
      sink: {
        export: async record => {
          logger.info({ id: record.id }, 'diagnostic export')
          await new Promise<void>((resolve, reject) => {
            logger.flush(err => (err ? reject(err) : resolve()))
          })
        },
      },
    })
    const admitted = port.admit({
      chain: { causes: [{ role: 'origin', summary: 'ok' }] },
      correlation: { ...correlation, work: 'w'.repeat(10_000) },
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(admitted).toEqual({ status: 'rejected', reason: 'bytes_full' })
    expect(lines).toEqual([])
  })

  it('ends diagnostic close while a pino write is still waiting', async () => {
    const lines: string[] = []
    const logger = pino({ level: 'info' }, collectingDestination(lines))
    const port = createDiagnosticPort({
      bounds,
      closeDeadlineMs: 30,
      sink: {
        export: (record, signal) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              logger.info({ id: record.id }, 'diagnostic export')
              logger.flush(err => (err ? reject(err) : resolve()))
            }, 200)
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new Error('closed'))
            })
          }),
      },
    })
    port.admit({
      chain: { causes: [{ role: 'origin', summary: 'committed' }] },
      correlation,
    })
    const business = { status: 'closed' as const }
    const report = await port.close()
    expect(business.status).toBe('closed')
    expect(report.flush).toEqual({ kind: 'deadline' })
    expect(report.transport).toEqual({ kind: 'deadline' })
    expect(report.unfinished).toHaveLength(1)
    expect(lines).toEqual([])
  })
})
