// The `telemetry` row in a `serve` tree, in one process: the entry diagnostic facade on the
// capturing double (A2), the three states of the Cordis log bridge (A3, A5, A6, A7), a record
// writer that throws (A8), the shutdown step and its report (A9), the disabled implementation
// (A10), the factory numbers of the operator layer (A12) and the configuration boundary (A13). The
// real `server-entry` row is in `serve.spec.ts`.
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { systemScope } from '@omne-harness/legal-identity'
import { defineEvent } from '@omne-harness/telemetry-contract'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { stubPlugin } from '../../../src/cordis.ts'
import { defineRow } from '../../../src/row.ts'
import {
  entryDiagnosticDefinition,
  entryDiagnostics,
} from '../../../src/rows/server-entry/telemetry.ts'
import { telemetryRowConfig } from '../../../src/rows/telemetry/config.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'

/** Test budgets. They let the row construct; no measurement backs them. */
const BUDGETS = {
  maxRecordBytes: 65_536,
  maxQueueItems: 1024,
  maxQueueBytes: 1_048_576,
  maxOpenSegments: 16,
  maxLogTextLength: 4096,
  summaryIntervalMs: 1000,
}
const node = (outlet: unknown = { kind: 'stdout' }) => ({
  implementation: 'node',
  outlet,
  budgets: BUDGETS,
})

type Row = { id: string; plugin: string; config?: unknown }
const tree = (rows: readonly Row[]) => ({ rows: rows.map(row => ({ config: {}, ...row })) })
const TELEMETRY = (config: unknown = node()): Row => ({
  id: 'telemetry',
  plugin: 'telemetry',
  config,
})
const PROBE: Row = { id: 'logging-probe', plugin: 'probe' }

const scratches: string[] = []
function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'telemetry-row-')))
  scratches.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A row that logs one message of each level while its body runs. */
function loggingRow(id = 'logging-probe'): Plugin.Object {
  return defineRow({
    row: id,
    implementation: 'real',
    manifest: { provides: [], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: id,
      apply(ctx: Context) {
        const logger = ctx.logger(id)
        logger.error('probe error %s', 'e1')
        logger.info('probe info')
        logger.warn('probe warn %d', 7)
        logger.debug('probe debug')
      },
    },
  })
}

/** The `log` records of one logger name, in stdout order. */
const logsOf = (records: readonly S0Record[], component: string) =>
  records.filter(
    record =>
      record.kind === 'telemetry' &&
      record['signal'] === 'log' &&
      record['component'] === component,
  )
const levelsOf = (records: readonly S0Record[]) => records.map(record => record['level'])
const reportOf = (run: ServeRun) => run.of('shutdown-result')[0]?.['telemetry']

describe('A2: the entry diagnostic facade', () => {
  it('declares one event whose path and operation are optional', () => {
    expect(entryDiagnosticDefinition).toMatchObject({
      signal: 'event',
      owner: 'server-entry',
      name: 'omne.entry.diagnostic',
      version: 1,
      level: 'warn',
    })
    expect(Object.keys(entryDiagnosticDefinition.schema)).toEqual(['code', 'path', 'operation'])
    expect(entryDiagnosticDefinition.schema.code).not.toHaveProperty('optional')
    expect(entryDiagnosticDefinition.schema.path).toMatchObject({ kind: 'ref', optional: true })
    expect(entryDiagnosticDefinition.schema.operation).toMatchObject({
      kind: 'ref',
      optional: true,
    })
  })

  it('writes only the members the diagnostic had, through the one definition, and leaves out a reference the contract refuses', () => {
    const capture = createCapturingTelemetry()
    const sink = entryDiagnostics(capture.port)

    sink({ code: 'identity.fault', operation: 'recognizeLogin' })
    sink({ code: 'request.fault', path: '/sessions' })
    sink({ code: 'encode.fault' })
    sink({ code: 'session.read-fault', path: '/sessions/1', operation: 'read' })
    sink({ code: 'request.fault', path: '', operation: 'Bearer x' })
    sink({ code: 'request.fault', path: 'p'.repeat(257), operation: 'create' })

    const events = capture.records().map(record => (record.kind === 'event' ? record : undefined))
    expect(events.map(record => record?.definition)).toEqual(
      Array.from({ length: 6 }, () => entryDiagnosticDefinition),
    )
    expect(events.map(record => record?.fields)).toEqual([
      { code: 'identity.fault', operation: 'recognizeLogin' },
      { code: 'request.fault', path: '/sessions' },
      { code: 'encode.fault' },
      { code: 'session.read-fault', path: '/sessions/1', operation: 'read' },
      { code: 'request.fault' },
      { code: 'request.fault', operation: 'create' },
    ])
    for (const record of events) expect(record?.fields).not.toHaveProperty('path', undefined)
    expect(capture.dropped()).toBe(0)
    expect(events[0]?.binding).toMatchObject({
      scope: { kind: 'system' },
      component: 'server-entry',
      instance: { owner: '@omne-harness/harness-server' },
    })
  })
})

describe('A3: the Cordis log bridge in the ready state', () => {
  it('a row warn, error and info become log records through the runtime; debug does not', async () => {
    const run = await serveOnce({
      distribution: tree([TELEMETRY(), PROBE]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    const logs = logsOf(run.records, 'logging-probe')
    expect(
      logs.map(record => [record['level'], (record['fields'] as { text: string }).text]),
    ).toEqual([
      ['error', 'probe error e1'],
      ['info', 'probe info'],
      ['warn', 'probe warn 7'],
    ])
    // The runtime, not the bridge, formed them: they carry the run's generation and instance.
    for (const record of logs) {
      expect(record).toMatchObject({
        kind: 'telemetry',
        signal: 'log',
        owner: 'cordis',
        name: 'omne.cordis.log',
        version: 1,
        scope: { kind: 'system' },
        generation: expect.any(String),
        instance: { owner: '@omne-harness/harness-server', ref: expect.any(String) },
      })
    }
  })
})

describe('A5: the bootstrap state when the telemetry row fails', () => {
  it('a file outlet that cannot open fails the row; the other rows and their logs still reach stdout; the report says not-registered', async () => {
    const path = join(scratch(), 'missing-directory', 'telemetry.jsonl')
    const run = await serveOnce({
      distribution: tree([TELEMETRY(node({ kind: 'file', path })), PROBE]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(3)
    expect(run.state('telemetry')).toMatchObject({ state: 'FAILED' })
    expect(run.state('logging-probe')).toMatchObject({ state: 'ACTIVE' })
    const logs = logsOf(run.records, 'logging-probe')
    expect(levelsOf(logs)).toEqual(['error', 'info', 'warn'])
    // Written by the bridge itself: no generation, no instance.
    for (const record of logs) {
      expect(record).not.toHaveProperty('generation')
      expect(record).not.toHaveProperty('instance')
    }
    expect(reportOf(run)).toMatchObject({ kind: 'not-registered', writeFailures: 0 })
    expect(run.records.at(-1)?.kind).toBe('shutdown-result')
  })
})

describe('A6: the state after the telemetry close', () => {
  /** A row whose disposer logs a warn: it runs while the root is retired, after the telemetry close. */
  function disposerWarnRow(): Plugin.Object {
    return defineRow({
      row: 'disposer-probe',
      implementation: 'real',
      manifest: { provides: [], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'disposer-probe',
        apply(ctx: Context) {
          ctx.effect(
            () => () => {
              ctx.logger('disposer-probe').warn('late warn %s', 'after-close')
            },
            'disposer-probe.warn',
          )
        },
      },
    })
  }

  it('a warn from a disposer during root retirement reaches stdout as a log record, before shutdown-result', async () => {
    const run = await serveOnce({
      distribution: tree([TELEMETRY(), { id: 'disposer-probe', plugin: 'disposer' }]),
      plugins: { stubPlugin, disposer: disposerWarnRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    const logs = logsOf(run.records, 'disposer-probe')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', fields: { text: 'late warn after-close' } })
    expect(logs[0]).not.toHaveProperty('generation')
    const index = run.records.indexOf(logs[0]!)
    expect(index).toBeGreaterThan(run.records.findIndex(r => r.kind === 'startup-result'))
    expect(run.records.at(-1)?.kind).toBe('shutdown-result')
  })
})

describe('M1: the stderr outlet', () => {
  it('writes each record as one JSON line on stderr without the serve prefix; the summary and stop lines keep it', async () => {
    const run = await serveOnce({
      distribution: tree([TELEMETRY(node({ kind: 'stderr' })), PROBE]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.tree('telemetry')).toMatchObject({ telemetry: { outlet: 'stderr' } })
    const records = run.stderr
      .filter(line => !line.startsWith('serve: '))
      .map(line => JSON.parse(line) as S0Record)
    expect(levelsOf(logsOf(records, 'logging-probe'))).toEqual(['error', 'info', 'warn'])
    for (const record of records) expect(record).toMatchObject({ kind: 'telemetry' })
    // The runtime wrote them to stderr: stdout has no log record of the probe.
    expect(logsOf(run.records, 'logging-probe')).toEqual([])
    expect(reportOf(run)).toMatchObject({ kind: 'closed', admitted: 3, transport: 'closed' })
  })
})

describe('M4: the close step with the deadline spent', () => {
  function disposerWarnRow(): Plugin.Object {
    return defineRow({
      row: 'disposer-probe',
      implementation: 'real',
      manifest: { provides: [], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'disposer-probe',
        apply(ctx: Context) {
          ctx.effect(
            () => () => {
              ctx.logger('disposer-probe').warn('late warn %s', 'after-deadline')
            },
            'disposer-probe.warn',
          )
        },
      },
    })
  }

  it('a warn from a disposer still reaches stdout when the telemetry close ran past the deadline', async () => {
    const path = join(scratch(), 'telemetry.jsonl')
    const run = await serveOnce({
      distribution: tree([
        TELEMETRY(node({ kind: 'file', path })),
        { id: 'disposer-probe', plugin: 'disposer' },
      ]),
      plugins: { stubPlugin, disposer: disposerWarnRow() },
      entryObjects: [],
      shutdownDeadlineMs: 0,
    })
    expect(run.result.exitCode).toBe(0)
    // The scenario: the coordinator gave up on the close before the file outlet confirmed.
    expect(reportOf(run)).toEqual({ kind: 'unavailable', diagnostic: 'deadline' })
    const logs = logsOf(run.records, 'disposer-probe')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', fields: { text: 'late warn after-deadline' } })
    expect(run.records.at(-1)?.kind).toBe('shutdown-result')
  })
})

describe('A7: the bootstrap buffer', () => {
  it('replays into a file outlet with bootstrap: true, and stdout keeps each bootstrap record once', async () => {
    const path = join(scratch(), 'telemetry.jsonl')
    // The probe loads before the telemetry row, so its messages wait in the bootstrap buffer.
    const run = await serveOnce({
      distribution: tree([PROBE, TELEMETRY(node({ kind: 'file', path }))]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    const onStdout = logsOf(run.records, 'logging-probe')
    expect(levelsOf(onStdout)).toEqual(['error', 'info', 'warn'])
    for (const record of onStdout) expect(record).not.toHaveProperty('bootstrap')
    const inFile = readFileSync(path, 'utf8')
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as S0Record)
    const replayed = logsOf(inFile, 'logging-probe')
    expect(replayed.map(record => [record['level'], record['bootstrap']])).toEqual([
      ['error', true],
      ['info', true],
      ['warn', true],
    ])
    expect(replayed[0]).toMatchObject({ generation: expect.any(String) })
    expect(reportOf(run)).toMatchObject({ kind: 'closed', admitted: 3, transport: 'closed' })
  })

  it('does not replay into the stdout outlet: each bootstrap record appears once', async () => {
    const run = await serveOnce({
      distribution: tree([PROBE, TELEMETRY()]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    const logs = logsOf(run.records, 'logging-probe')
    expect(levelsOf(logs)).toEqual(['error', 'info', 'warn'])
    for (const record of logs) expect(record).not.toHaveProperty('bootstrap')
  })
})

describe('A8: a record writer that throws', () => {
  it('does not throw into the row that logged, and the report counts the lost records', async () => {
    const records: S0Record[] = []
    const stderr: string[] = []
    const result = await runServe({
      distribution: tree([TELEMETRY(), PROBE]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
      readinessTimeoutMs: 5000,
      shutdownDeadlineMs: 2000,
      stateRoot: scratch(),
      stop: AbortSignal.abort('test: stop'),
      write: record => {
        if (record.kind === 'telemetry') throw new Error('stdout closed')
        records.push(record)
      },
      stderr: line => stderr.push(line),
    })
    expect(result.exitCode).toBe(0)
    expect(records.find(r => r.kind === 'row-state' && r['id'] === 'logging-probe')).toMatchObject({
      state: 'ACTIVE',
    })
    const report = records.find(r => r.kind === 'shutdown-result')?.['telemetry'] as {
      kind: string
      dropped: number
      flush: string
    }
    expect(report).toMatchObject({ kind: 'closed', flush: 'failed' })
    expect(report.dropped).toBeGreaterThanOrEqual(3)
    // The failures never surface as a thrown error or a log record: at most the provider's summary
    // line for a person, on stderr with the serve prefix, and the stop request.
    expect(stderr.every(line => line.startsWith('serve: '))).toBe(true)
  })
})

describe('A9: the planned stop', () => {
  it('closes the runtime to the local sink and the report carries the CloseReport and the bridge counts', async () => {
    const run = await serveOnce({
      distribution: tree([TELEMETRY(), PROBE]),
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    expect(reportOf(run)).toEqual({
      kind: 'closed',
      generation: expect.any(String),
      admission: 'closed',
      admitted: 3,
      dropped: 0,
      droppedBy: {},
      pending: 0,
      flush: 'completed-to-boundary',
      boundary: 'local-sink',
      transport: 'closed',
      bootstrapOverflow: 0,
      afterClose: 0,
      formatFailures: 0,
      writeFailures: 0,
    })
    const steps = run.of('shutdown-step').map(record => record['action'])
    expect(steps.indexOf('telemetry-close')).toBeGreaterThan(-1)
    expect(steps.indexOf('telemetry-close')).toBeLessThan(steps.indexOf('report-fixed'))
    expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
  })
})

const probeEvent = defineEvent({
  owner: 'test',
  name: 'omne.test.probe',
  version: 1,
  level: 'info',
  schema: { n: { kind: 'number', min: 0, max: 100 } },
})

/** A consumer row that injects `telemetry` and emits `count` events while its body runs. */
function emittingRow(count: number): Plugin.Object {
  return defineRow({
    row: 'emitting-probe',
    implementation: 'real',
    manifest: { provides: [], injects: [telemetryKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'emitting-probe',
      inject: [telemetryKey],
      apply(ctx: Context) {
        const emitter = ctx.telemetry.bind({
          scope: systemScope(),
          component: 'emitting-probe',
          instance: { owner: 'test', ref: 'probe-1' },
        })
        for (let n = 0; n < count; n += 1) emitter.event(probeEvent, { n })
      },
    },
  })
}

describe('A10: the disabled implementation', () => {
  it('is a present provider: the consumer is ACTIVE, the tree says disabled, the report counts the drops', async () => {
    const run = await serveOnce({
      distribution: tree([
        TELEMETRY({ implementation: 'disabled', outlet: { kind: 'stdout' }, budgets: BUDGETS }),
        { id: 'emitting-probe', plugin: 'emitting' },
        PROBE,
      ]),
      plugins: { stubPlugin, emitting: emittingRow(4), probe: loggingRow() },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.state('emitting-probe')).toMatchObject({ state: 'ACTIVE' })
    expect(run.tree('telemetry')).toMatchObject({
      implementation: 'real',
      telemetry: { implementation: 'disabled', outlet: 'stdout' },
    })
    expect(run.records.filter(r => r.kind === 'telemetry' && r['signal'] === 'event')).toEqual([])
    expect(reportOf(run)).toMatchObject({
      kind: 'closed',
      generation: 'disabled',
      droppedBy: { disabled: 4 },
      boundary: 'none',
    })
    // Cordis logs keep the direct path: a disabled telemetry does not make WARN messages vanish.
    expect(levelsOf(logsOf(run.records, 'logging-probe'))).toEqual(['error', 'info', 'warn'])
  })

  it('the node implementation admits the same events and writes them', async () => {
    const run = await serveOnce({
      distribution: tree([TELEMETRY(), { id: 'emitting-probe', plugin: 'emitting' }]),
      plugins: { stubPlugin, emitting: emittingRow(2) },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.tree('telemetry')).toMatchObject({
      telemetry: { implementation: 'node', outlet: 'stdout' },
    })
    const events = run.records.filter(r => r.kind === 'telemetry' && r['signal'] === 'event')
    expect(events.map(r => r['fields'])).toEqual([{ n: 0 }, { n: 1 }])
    expect(reportOf(run)).toMatchObject({ kind: 'closed', admitted: 2, dropped: 0 })
  })
})

describe('A12: the factory numbers come from the operator layer', () => {
  const release = tree([TELEMETRY({ implementation: 'node', outlet: { kind: 'stdout' } })])

  it('refuses a release row without budgets before loading, with invalid-config', async () => {
    const run = await serveOnce({
      distribution: release,
      plugins: { stubPlugin },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(2)
    expect(run.stderr.join('\n')).toContain('invalid-config')
    expect(run.of('row-state')).toEqual([])
    expect(run.of('startup-result')).toEqual([])
  })

  it('loads when the operator layer replaces the row with the budgets', async () => {
    const run = await serveOnce({
      distribution: release,
      operator: { ops: [{ kind: 'replace', id: 'telemetry', config: node() }] },
      plugins: { stubPlugin },
      entryObjects: [],
    })
    expect(run.result.exitCode).toBe(0)
    expect(run.state('telemetry')).toMatchObject({ state: 'ACTIVE' })
  })

  it('refuses an operator insert of the factory row, and the export on another row id', async () => {
    const inserted = await serveOnce({
      distribution: tree([PROBE]),
      operator: {
        ops: [{ kind: 'insert', after: 'logging-probe', row: TELEMETRY() }],
      },
      plugins: { stubPlugin, probe: loggingRow() },
      entryObjects: [],
    })
    expect(inserted.result.exitCode).toBe(2)
    expect(inserted.stderr.join('\n')).toContain('factory row cannot be inserted')
    const misbound = await serveOnce({
      distribution: tree([{ id: 'other', plugin: 'telemetry', config: node() }]),
      plugins: { stubPlugin },
      entryObjects: [],
    })
    expect(misbound.result.exitCode).toBe(2)
    expect(misbound.stderr.join('\n')).toContain('factory export requires row telemetry')
  })
})

describe('A13: the row configuration', () => {
  const valid = node()

  it('accepts the three outlets and nothing else', () => {
    expect(telemetryRowConfig.safeParse(valid).success).toBe(true)
    expect(telemetryRowConfig.safeParse(node({ kind: 'stderr' })).success).toBe(true)
    const file = process.platform === 'win32' ? 'C:\\telemetry\\out.jsonl' : '/telemetry/out.jsonl'
    expect(telemetryRowConfig.safeParse(node({ kind: 'file', path: file })).success).toBe(true)
    expect(
      telemetryRowConfig.safeParse(node({ kind: 'file', path: 'relative.jsonl' })).success,
    ).toBe(false)
    expect(Object.keys(telemetryRowConfig.shape)).toEqual(['implementation', 'outlet', 'budgets'])
  })

  it('has no remote destination field and rejects unknown keys at every level', () => {
    const rejected: unknown[] = [
      { ...valid, endpoint: 'https://collector.example' },
      { ...valid, otlp: { url: 'https://collector.example' } },
      { ...valid, outlet: { kind: 'stdout', url: 'https://collector.example' } },
      { ...valid, outlet: { kind: 'http', url: 'https://collector.example' } },
      { ...valid, outlet: { kind: 'otlp', endpoint: 'https://collector.example' } },
      { ...valid, budgets: { ...BUDGETS, flushIntervalMs: 1 } },
      { ...valid, implementation: 'otel' },
    ]
    for (const config of rejected)
      expect(telemetryRowConfig.safeParse(config).success, JSON.stringify(config)).toBe(false)
  })

  it('requires every budget as a positive safe integer', () => {
    for (const key of Object.keys(BUDGETS)) {
      const { [key]: _removed, ...without } = BUDGETS as Record<string, number>
      expect(telemetryRowConfig.safeParse({ ...valid, budgets: without }).success, key).toBe(false)
      for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, '10'])
        expect(
          telemetryRowConfig.safeParse({ ...valid, budgets: { ...BUDGETS, [key]: bad } }).success,
          `${key}=${String(bad)}`,
        ).toBe(false)
    }
  })
})
