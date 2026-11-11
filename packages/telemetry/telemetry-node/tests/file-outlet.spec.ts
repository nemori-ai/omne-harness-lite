import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTelemetryRuntime, type TelemetryRuntimeOptions } from '../src/index.ts'
import {
  BUDGETS,
  INSTANCE,
  countingBytes,
  loginFailed,
  manualClock,
  nextTurn,
  systemBinding,
} from './support.ts'

const FIELDS = { code: 'identity.fault', retried: false, attempts: 1, request: 'req-1' } as const

let dir = ''

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'telemetry-node-file-')))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function fileOptions(path: string): TelemetryRuntimeOptions {
  return {
    generation: 'g1',
    instance: INSTANCE,
    clock: manualClock(),
    randomBytes: countingBytes(),
    outlet: { kind: 'file', path },
    budgets: BUDGETS,
    summary: () => undefined,
  }
}

function lines(text: string): unknown[] {
  return text
    .split('\n')
    .filter(line => line !== '')
    .map(line => JSON.parse(line) as unknown)
}

describe('the file outlet (Pino synchronous destination)', () => {
  it('holds one JSON line per admitted record after close, and closes the transport', async () => {
    const path = join(dir, 'telemetry.log')
    const runtime = createTelemetryRuntime(fileOptions(path))
    const emitter = runtime.port.bind(systemBinding())
    emitter.event(loginFailed, FIELDS)
    await nextTurn()
    emitter.event(loginFailed, { ...FIELDS, request: 'req-2' })
    runtime.ingestLog({ time: 't0', level: 'error', component: 'app', text: 'boom' })

    const report = await runtime.close(5000)

    expect(report).toMatchObject({
      admitted: 3,
      dropped: 0,
      pending: 0,
      flush: 'completed-to-boundary',
      boundary: 'local-sink',
      transport: 'closed',
    })
    const written = lines(await readFile(path, 'utf8'))
    expect(written).toHaveLength(3)
    expect(written.map(record => (record as { signal: string }).signal)).toEqual([
      'event',
      'event',
      'log',
    ])
    expect(written[1]).toMatchObject({ fields: { request: 'req-2' }, generation: 'g1' })
  })

  it('appends to an existing file', async () => {
    const path = join(dir, 'telemetry.log')
    for (const request of ['first', 'second']) {
      const runtime = createTelemetryRuntime(fileOptions(path))
      runtime.port.bind(systemBinding()).event(loginFailed, { ...FIELDS, request })
      await runtime.close(5000)
    }

    expect(lines(await readFile(path, 'utf8'))).toHaveLength(2)
  })

  it('fails to create the runtime with a clear error when the file cannot be opened', () => {
    const path = join(dir, 'missing-parent', 'telemetry.log')

    expect(() => createTelemetryRuntime(fileOptions(path))).toThrow(
      /telemetry file outlet: cannot open .*missing-parent/,
    )
  })

  it('never writes secret texts that a caller puts in non-ref fields', async () => {
    const path = join(dir, 'telemetry.log')
    const runtime = createTelemetryRuntime(fileOptions(path))
    const emitter = runtime.port.bind(systemBinding())
    const hostile: unknown[] = [
      { ...FIELDS, code: new Error('sk-live-0123456789') },
      { ...FIELDS, code: 'sk-live-0123456789' },
      { ...FIELDS, retried: 'Bearer x' },
      { ...FIELDS, request: 'Bearer x' },
    ]
    for (const fields of hostile)
      expect(emitter.event(loginFailed, fields as typeof FIELDS).kind).toBe('dropped')
    emitter.event(loginFailed, FIELDS)

    await runtime.close(5000)
    const bytes = await readFile(path)

    expect(bytes.includes('sk-live')).toBe(false)
    expect(bytes.includes('Bearer')).toBe(false)
    expect(lines(bytes.toString('utf8'))).toHaveLength(1)
  })
})
