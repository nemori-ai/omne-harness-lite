// @module-tag slow
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Writable } from 'node:stream'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  actingScopeCodec,
  systemScope,
  tenantCodec,
  tenantScope,
  type ActingScope,
} from '@omne-harness/legal-identity'
import { createAgentTelemetry } from '@omne-harness/agent'
import { decodeAgentExecutionId } from '@omne-harness/agent-contract'
import { createSessionTelemetry } from '@omne-harness/session'
import type { ResidentKey } from '@omne-harness/session-contract'
import { testingTenant } from '@omne-harness/session-contract/testing'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { defineEvent, isSegment, type TelemetryPort } from '@omne-harness/telemetry-contract'
import { telemetryKey } from '@omne-harness/telemetry-cordis-contract/cordis'
import {
  createTelemetryRuntime,
  summarizeTelemetry,
  type TelemetryRecord,
} from '@omne-harness/telemetry-node'
import * as cordis from '../../../src/cordis.ts'
import {
  lineWriter,
  recordLineWriter,
  runServe,
  type S0Record,
  type ServeResult,
} from '../../../src/run.ts'
import { agentHostRow } from '../../../src/rows/agent-host/index.ts'
import { defineRow } from '../../../src/row.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import { createTelemetryBinding, processInstance } from '../../../src/rows/telemetry/index.ts'
import type { RowId } from '../../../src/types.ts'
import { startModelGateway, type GatewayScript } from '../../fixtures/model-gateway.ts'
import { hostConfig, hostDoubles, principalObject } from '../agent-host/doubles.ts'
import { TELEMETRY_ROW_CONFIG, connectable, until } from '../server-entry/support.ts'
import { declared, loadTree, makeBase, storageRows } from '../session-fixtures/tree.ts'
import { disabledTelemetryRow } from './support.ts'
import {
  bodyOf,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedTenant,
} from '../../r9/support.ts'

const CREDENTIAL = 'alice-pw-MEASURE-7c1d'
const SESSION_OWNER = '@omne-harness/session'

const release = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
) as { rows: Array<{ id: string }> }

const live: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of live.splice(0).reverse()) await close()
})

type Run = Readonly<{
  result: ServeResult
  records: readonly S0Record[]
  telemetry(): S0Record[]
}>

type Tools = Readonly<{
  cli: (args: readonly string[], credential?: string) => ReturnType<typeof runOmne>
  home: string
  records: readonly S0Record[]
}>

const telemetryOf = (records: readonly S0Record[]) =>
  records.filter(record => record.kind === 'telemetry')
const named = (records: readonly S0Record[], name: string, signal: string) =>
  telemetryOf(records).filter(record => record['name'] === name && record['signal'] === signal)

type ReleaseOptions = Readonly<{
  answer?: GatewayScript
  budgets?: Readonly<Record<string, number>>
  runEntries?: boolean
}>

function releaseOperator(
  layerOptions: Parameters<typeof operatorLayer>[0],
  options: ReleaseOptions,
): unknown {
  const layer = operatorLayer(layerOptions) as { ops: Array<{ id: string; config: object }> }
  return {
    ops: layer.ops.map(op => {
      if (op.id === 'telemetry' && options.budgets !== undefined) {
        const config = op.config as { budgets: Readonly<Record<string, number>> }
        return { ...op, config: { ...config, budgets: { ...config.budgets, ...options.budgets } } }
      }
      if (op.id === 'server-entry' && options.runEntries === true)
        return {
          ...op,
          config: {
            ...op.config,
            historyKinds: ['message.user', 'message.assistant', 'run.started', 'run.terminal'],
          },
        }
      return op
    }),
  }
}

async function withRelease<T>(
  omit: readonly string[],
  scenario: (tools: Tools) => Promise<T>,
  options: ReleaseOptions = {},
): Promise<{ value: T; run: Run }> {
  const dir = newScratch('telemetry-measure-')
  const port = await freePort()
  const home = join(dir.base, 'home-alice')
  const controller = new AbortController()
  const records: S0Record[] = []
  const gateway = await startModelGateway(options.answer)
  gateway.trustInProcess()
  const finished: Promise<Run> = runServe({
    distribution: { ...release, rows: release.rows.filter(row => !omit.includes(row.id)) },
    operator: releaseOperator(
      { storageRoot: dir.storageRoot, port, modelRoute: gateway.url },
      options,
    ),
    plugins: { ...cordis },
    stateRoot: dir.stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: 15_000,
    shutdownDeadlineMs: 5000,
    write: record => records.push(record),
    stderr: () => {},
  }).then(result => ({ result, records, telemetry: () => telemetryOf(records) }))
  let ended = false
  void finished.then(
    () => (ended = true),
    () => (ended = true),
  )
  try {
    await until(
      async () => {
        if (ended) throw new Error('the tree ended before the entry listened')
        return connectable('127.0.0.1', port)
      },
      `port ${String(port)} to listen`,
      20_000,
    )
    const value = await scenario({
      home,
      records,
      cli: (args, credential) =>
        runOmne({
          args: [...args],
          home,
          server: `http://127.0.0.1:${String(port)}`,
          cwd: dir.base,
          ...(credential === undefined ? {} : { credential }),
        }),
    })
    controller.abort('test: stop')
    return { value, run: await finished }
  } finally {
    controller.abort('test: stop')
    await finished.catch(() => undefined)
    await gateway.close()
    dir.remove()
  }
}

async function oneRun(tools: Tools): Promise<{ session: string; tenantText: string }> {
  for (const step of [
    await tools.cli(['register', '--login-identifier', 'alice'], CREDENTIAL),
    await tools.cli(['login', '--login-identifier', 'alice'], CREDENTIAL),
  ])
    expect(step.status).toBe(0)
  const created = await tools.cli(['create-session', '--definition', 'assistant'])
  expect(created.status).toBe(0)
  const session = String(bodyOf(created)['session'])
  const sent = await tools.cli(['send-input', '--session', session, '--text', 'measure me'])
  expect(sent.status).toBe(0)
  return { session, tenantText: savedTenant(tools.home) }
}

function scopeOf(tenantText: string) {
  const tenant = tenantCodec.parse(tenantText)
  if (!tenant.ok) throw new Error('the saved tenant does not parse')
  const encoded = actingScopeCodec.encode(tenantScope(tenant.value))
  if (!encoded.ok) throw new Error('the tenant scope does not encode')
  return { tenant: tenant.value, scope: JSON.parse(encoded.value) as unknown }
}

describe('W1, W2: one Run of the release tree', () => {
  it(
    'writes the Session operation segments and the Agent pass segment of the tenant, and the summary gives each a count and p50/p95',
    { timeout: 120_000 },
    async () => {
      const { value, run } = await withRelease([], async tools => {
        const started = await oneRun(tools)
        await until(
          () =>
            named(tools.records, 'omne.agent.pass.run', 'segment-end').length > 0 &&
            named(tools.records, 'omne.session.accept', 'segment-end').length > 0,
          'the Agent pass and the Session accept to end',
          60_000,
        )
        return started
      })
      expect(run.records.find(record => record.kind === 'startup-result')).toMatchObject({
        accepting: true,
        outcome: 'ready',
      })
      expect(run.records.find(record => record.kind === 'shutdown-result')).toMatchObject({
        telemetry: { kind: 'closed' },
      })
      const { tenant, scope } = scopeOf(value.tenantText)

      const sessionEnds = run
        .telemetry()
        .filter(
          record =>
            record['signal'] === 'segment-end' &&
            typeof record['name'] === 'string' &&
            record['name'].startsWith('omne.session.'),
        )
      expect(sessionEnds.length).toBeGreaterThan(0)
      expect(sessionEnds.map(record => record['name'])).toContain('omne.session.accept')
      for (const record of sessionEnds)
        expect(record).toMatchObject({ owner: 'session', component: 'session', scope })
      for (const name of ['omne.session.create', 'omne.session.accept'])
        for (const record of named(run.records, name, 'segment-end'))
          expect(record).toMatchObject({ work: { owner: SESSION_OWNER, ref: value.session } })
      const agentEnds = named(run.records, 'omne.agent.pass.run', 'segment-end')
      expect(agentEnds.length).toBeGreaterThan(0)
      for (const record of agentEnds) {
        expect(record).toMatchObject({ owner: 'agent', component: 'agent', scope })
      }

      const summary = summarizeTelemetry(
        run.telemetry().map(record => JSON.stringify(record)),
        { tenant },
      )
      const bySegment = new Map(summary.segments.map(segment => [segment.name, segment]))
      for (const name of ['omne.session.accept', 'omne.agent.pass.run']) {
        const segment = bySegment.get(name)
        expect(segment, name).toBeDefined()
        expect(segment!.count).toBeGreaterThan(0)
        expect(segment!.durationMs.p50).toBeGreaterThanOrEqual(0)
        expect(segment!.durationMs.p95).toBeGreaterThanOrEqual(segment!.durationMs.p50)
      }
      expect(bySegment.get('omne.session.accept')?.owner).toBe('session')
      expect(bySegment.get('omne.agent.pass.run')?.owner).toBe('agent')
    },
  )
})

describe('W3: the Session diagnostic reaches the outlet', () => {
  it(
    'without `session-ad14` the invoke finds no Agent drive port, and the diagnostic record names the step and the reason without the detail',
    { timeout: 120_000 },
    async () => {
      const { value, run } = await withRelease(['session-ad14'], async tools => {
        const started = await oneRun(tools)
        await until(
          () => named(tools.records, 'omne.session.diagnostic', 'event').length > 0,
          'the Session diagnostic',
          60_000,
        )
        return started
      })
      const { scope } = scopeOf(value.tenantText)
      const diagnostics = named(run.records, 'omne.session.diagnostic', 'event')
      expect(diagnostics.length).toBeGreaterThan(0)
      for (const record of diagnostics) {
        expect(record).toMatchObject({
          owner: 'session',
          level: 'warn',
          scope,
          work: { owner: SESSION_OWNER, ref: value.session },
          fields: { owner: 'C2', step: 'invoke', reason: 'agent-absent' },
        })
        expect(Object.keys(record['fields'] as object).sort()).toEqual(['owner', 'reason', 'step'])
        expect(JSON.stringify(record)).not.toContain('drive port is absent')
      }
    },
  )
})

describe('W4, W5: the `telemetry` row is required, and disabled is present', () => {
  it(
    '`session-provider` without `telemetry` stays PENDING and names the key',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await loadTree({
        base,
        rows: [...storageRows(base).specs, declared(sessionProviderRealRow, { admission: 'none' })],
        readinessTimeoutMs: 2000,
      })
      live.push(() => tree.dispose())
      expect(tree.state('session-provider')).toMatchObject({
        state: 'PENDING',
        missing: ['telemetry'],
      })
    },
  )

  it(
    '`agent-host` without `telemetry` stays PENDING and names the key',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await loadTree({
        base,
        rows: [hostDoubles(null).spec, declared(agentHostRow, hostConfig)],
        entryObjects: [principalObject()],
        readinessTimeoutMs: 2000,
      })
      live.push(() => tree.dispose())
      expect(tree.state('agent-host')).toMatchObject({ state: 'PENDING', missing: ['telemetry'] })
    },
  )

  it('both rows are ACTIVE over the disabled implementation', { timeout: 60_000 }, async () => {
    const base = makeBase()
    live.push(() => base.release())
    const session = await loadTree({
      base,
      rows: [
        disabledTelemetryRow(),
        ...storageRows(base).specs,
        declared(sessionProviderRealRow, { admission: 'none' }),
      ],
    })
    live.push(() => session.dispose())
    expect(session.state('telemetry')).toMatchObject({ state: 'ACTIVE' })
    expect(session.state('session-provider')).toMatchObject({ state: 'ACTIVE', missing: [] })

    const other = makeBase()
    live.push(() => other.release())
    const agent = await loadTree({
      base: other,
      rows: [disabledTelemetryRow(), hostDoubles(null).spec, declared(agentHostRow, hostConfig)],
      entryObjects: [principalObject()],
    })
    live.push(() => agent.dispose())
    expect(agent.state('agent-host')).toMatchObject({ state: 'ACTIVE', missing: [] })
  })
})

const PORT_PROBE = 'telemetry-port-probe' as RowId

function portProbeRow(seen: (port: TelemetryPort) => void): Plugin.Object {
  return defineRow({
    row: PORT_PROBE,
    implementation: 'real',
    manifest: { provides: [], injects: [telemetryKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: PORT_PROBE,
      inject: [telemetryKey],
      apply(ctx: Context) {
        seen(ctx.telemetry)
      },
    },
  })
}

function recordScope(scope: ActingScope): unknown {
  const encoded = actingScopeCodec.encode(scope)
  if (!encoded.ok) throw new Error('the scope does not encode')
  return JSON.parse(encoded.value) as unknown
}

describe('W6: the directory reads of the scanner, and a record without a tenant', () => {
  it(
    'over the real row, `pending` writes segments of its tenant and `references`, `releasedScopes` segments of the system; the close report has no invalid drop',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const written: TelemetryRecord[] = []
      const telemetry = createTelemetryBinding({
        write: record => written.push(record),
        stderr: () => {},
      })
      const tree = await loadTree({
        base,
        rows: [
          declared(telemetry.plugin, TELEMETRY_ROW_CONFIG),
          ...storageRows(base).specs,
          declared(sessionProviderRealRow, { admission: 'none' }),
        ],
      })
      live.push(() => tree.dispose())
      expect(tree.state('session-provider')).toMatchObject({ state: 'ACTIVE', missing: [] })

      const maintainer: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
        caller: 'maintainer',
      }).session
      if (maintainer === undefined) throw new Error('the tree provides no session')
      const organization = 'org_app8c0pr0v1der000000000000'
      const tenant = testingTenant(organization, 'acc_app8c0pr0v1der000000000000')
      const pending = await maintainer.reconciliation.pending({
        principal: 'maintenance',
        tenant,
        after: null,
        limit: 10,
      })
      expect('failure' in pending ? pending.failure.kind : 'ok').not.toBe('denied')
      await maintainer.reconciliation.references({
        principal: 'maintenance',
        scope: 'system',
        key: 'resident-1' as ResidentKey,
        after: null,
        limit: 10,
      })
      await maintainer.reconciliation.releasedScopes({
        principal: 'maintenance',
        scope: 'system',
        after: null,
        limit: 10,
      })

      const report = await telemetry.close(1000)
      await tree.shutdown()
      if (report.kind !== 'closed') throw new Error(`telemetry close: ${report.kind}`)
      expect(report.droppedBy).not.toHaveProperty('invalid')
      expect(report.dropped).toBe(0)

      const segments = written.filter(record => record.signal !== 'log')
      expect(segments.map(record => `${record.signal}:${String(record['name'])}`)).toEqual([
        'segment-start:omne.session.pending',
        'segment-end:omne.session.pending',
        'segment-start:omne.session.references',
        'segment-end:omne.session.references',
        'segment-start:omne.session.releasedScopes',
        'segment-end:omne.session.releasedScopes',
      ])
      const tenantScoped = recordScope(tenantScope(tenant))
      const systemScoped = recordScope(systemScope())
      for (const record of segments) {
        expect(record).toMatchObject({ owner: 'session', component: 'session' })
        expect(record).not.toHaveProperty('work')
        const name = String(record['name'])
        if (name === 'omne.session.pending') expect(record['scope']).toEqual(tenantScoped)
        else {
          expect(record['scope']).toEqual(systemScoped)
          expect(JSON.stringify(record)).not.toContain(organization)
        }
      }
    },
  )

  it(
    'a Session segment that names no tenant goes to `discard` over the real port, and the close report counts it under droppedBy.invalid',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const written: TelemetryRecord[] = []
      const telemetry = createTelemetryBinding({
        write: record => written.push(record),
        stderr: () => {},
      })
      let port: TelemetryPort | undefined
      const tree = await loadTree({
        base,
        rows: [
          declared(telemetry.plugin, TELEMETRY_ROW_CONFIG),
          declared(portProbeRow(seen => (port = seen))),
        ],
      })
      live.push(() => tree.dispose())
      if (port === undefined) throw new Error('the probe row did not run')

      const { measure } = createSessionTelemetry(port, { instance: processInstance })
      measure({
        kind: 'segment',
        segment: 'session',
        phase: 'start',
        span: 1,
        operation: 'pending',
        session: null,
      })
      measure({
        kind: 'segment',
        segment: 'session',
        phase: 'end',
        span: 1,
        operation: 'pending',
        session: null,
        outcome: 'ok',
      })

      await tree.shutdown()
      const report = await telemetry.close(1000)
      if (report.kind !== 'closed') throw new Error(`telemetry close: ${report.kind}`)
      expect(report.droppedBy).toEqual({ invalid: 1 })
      expect(report.dropped).toBe(1)
      expect(written.filter(record => record.signal !== 'log')).toEqual([])
    },
  )
})

function byteSink(): Readonly<{ stream: Writable; bytes(): Buffer }> {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk)
      callback()
    },
  })
  return { stream, bytes: () => Buffer.concat(chunks) }
}

const g3Event = defineEvent({
  owner: 'test',
  name: 'omne.test.g3',
  version: 1,
  level: 'warn',
  schema: { code: { kind: 'enum', values: ['ok', 'fault'] } },
})

describe('G3: a record with an error object or a secret-like text, through the real record writer', () => {
  it(
    'is refused as dropped(invalid), counted in shutdown-result, and its text is not in the bytes written',
    { timeout: 60_000 },
    async () => {
      const SECRET = 'sk-live-G3-0d4f9a7c1e2b'
      const stdout = byteSink()
      const stderr = byteSink()
      const answers: unknown[] = []
      const dir = newScratch('telemetry-g3-')
      live.push(() => dir.remove())
      const result = await runServe({
        distribution: {
          rows: [
            { id: 'telemetry', plugin: 'telemetry', config: TELEMETRY_ROW_CONFIG },
            { id: PORT_PROBE, plugin: 'portProbe', config: {} },
          ],
        },
        plugins: {
          stubPlugin: cordis.stubPlugin,
          portProbe: portProbeRow(port => {
            const emitter = port.bind({
              scope: systemScope(),
              component: 'g3-probe',
              instance: processInstance,
            })
            answers.push(
              emitter.event(g3Event, { code: new Error(SECRET) as never }),
              emitter.event(g3Event, { code: `Bearer ${SECRET}` as never }),
              emitter.event(g3Event, { code: 'fault' }),
            )
          }),
        },
        entryObjects: [],
        stateRoot: dir.stateRoot,
        stop: AbortSignal.abort('test: stop'),
        readinessTimeoutMs: 5000,
        shutdownDeadlineMs: 2000,
        write: recordLineWriter(stdout.stream),
        stderr: lineWriter(stderr.stream),
      })
      expect(result.exitCode).toBe(0)
      expect(answers).toEqual([
        { kind: 'dropped', reason: 'invalid' },
        { kind: 'dropped', reason: 'invalid' },
        { kind: 'admitted' },
      ])

      const bytes = stdout.bytes()
      expect(bytes.includes(Buffer.from(SECRET, 'utf8'))).toBe(false)
      expect(stderr.bytes().includes(Buffer.from(SECRET, 'utf8'))).toBe(false)
      expect(bytes.at(-1)).toBe(0x0a)
      const lines = bytes.toString('utf8').split('\n').slice(0, -1)
      const records = lines.map(line => JSON.parse(line) as S0Record)
      expect(named(records, 'omne.test.g3', 'event').map(record => record['fields'])).toEqual([
        { code: 'fault' },
      ])
      expect(records.at(-1)).toMatchObject({
        kind: 'shutdown-result',
        telemetry: { kind: 'closed', admitted: 1, dropped: 2, droppedBy: { invalid: 2 } },
      })
    },
  )
})

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const textAnswer: GatewayScript = ({ body }) => ({
  status: 200,
  contentType: 'text/event-stream',
  body: sse([
    {
      model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
      provider: 'OpenAI',
      choices: [{ delta: { content: 'done' } }],
    },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]),
})

function unended(records: readonly S0Record[]): S0Record[] {
  const key = (record: S0Record) => `${String(record['trace'])}/${String(record['span'])}`
  const ends = new Set(
    telemetryOf(records)
      .filter(record => record['signal'] === 'segment-end')
      .map(key),
  )
  return telemetryOf(records).filter(
    record => record['signal'] === 'segment-start' && !ends.has(key(record)),
  )
}

const G7_SEGMENT_LIFETIME_MS = 5000

function terminalOf(history: string): { run: string; outcome: string } | undefined {
  try {
    const parsed = JSON.parse(history) as {
      body?: { entries?: Array<{ kind: string; payload: { terminal?: unknown } }> }
    }
    const entry = parsed.body?.entries?.find(candidate => candidate.kind === 'run.terminal')
    return entry?.payload.terminal as { run: string; outcome: string } | undefined
  } catch {
    return undefined
  }
}

describe('G7: the segment pairs of a real Run are released when the Run ends', () => {
  it(
    'every segment start of the run has its end, and the close report counts no segment open at close',
    { timeout: 120_000 },
    async () => {
      const { value, run } = await withRelease(
        [],
        async tools => {
          const started = await oneRun(tools)
          let terminal: { run: string; outcome: string } | undefined
          await until(
            async () => {
              const read = await tools.cli(['read-history', '--session', started.session, '--json'])
              terminal = read.status === 0 ? terminalOf(read.stdout) : undefined
              return terminal !== undefined
            },
            'the Run to reach its terminal entry (run.terminal in the history)',
            60_000,
          )
          await until(
            () => unended(tools.records).length === 0,
            'every segment start of the run to have its end',
            3 * G7_SEGMENT_LIFETIME_MS,
          )
          return { ...started, terminal }
        },
        {
          answer: textAnswer,
          budgets: { maxSegmentLifetimeMs: G7_SEGMENT_LIFETIME_MS },
          runEntries: true,
        },
      )
      expect(value.terminal).toMatchObject({ outcome: 'completed' })
      const runId = value.terminal?.run ?? ''
      expect(runId).toMatch(/^run_/)

      const starts = telemetryOf(run.records).filter(r => r['signal'] === 'segment-start')
      const passes = starts.filter(
        record =>
          record['owner'] === 'agent' && JSON.stringify(record['attempt'] ?? null).includes(runId),
      )
      expect(passes.map(record => record['name'])).toContain('omne.agent.pass.run')
      expect(starts.map(record => record['name'])).toEqual(
        expect.arrayContaining(['omne.session.accept', 'omne.session.startRun']),
      )

      const report = run.records.find(record => record.kind === 'shutdown-result')?.['telemetry']
      expect(report).toMatchObject({ kind: 'closed', pending: 0, flush: 'completed-to-boundary' })
      const droppedBy = (report as { droppedBy: Readonly<Record<string, number>> }).droppedBy
      expect(droppedBy).not.toHaveProperty('expired')
      expect(droppedBy).not.toHaveProperty('capacity')
      expect(unended(run.records)).toEqual([])
      const ends = telemetryOf(run.records).filter(r => r['signal'] === 'segment-end')
      expect(ends).toHaveLength(starts.length)
      expect((report as { admitted: number }).admitted).toBe(
        telemetryOf(run.records).filter(record => 'generation' in record).length,
      )
    },
  )
})

describe('shared provider releases facade pairs', () => {
  it('only forwards the active end after repeated expiry, and forwards none after close', async () => {
    let time = 0
    const written: TelemetryRecord[] = []
    const runtime = createTelemetryRuntime({
      generation: 'pair-release',
      randomBytes,
      instance: processInstance,
      budgets: { ...TELEMETRY_ROW_CONFIG.budgets, maxOpenSegments: 1, maxSegmentLifetimeMs: 1 },
      clock: { now: () => new Date(time), monotonicMs: () => time },
      outlet: { kind: 'writer', write: record => written.push(record) },
      summary: () => {},
    })
    let forwarded = 0
    const port: TelemetryPort = {
      ...runtime.port,
      bind(binding) {
        const emitter = runtime.port.bind(binding)
        return {
          ...emitter,
          startSegment(definition, options) {
            const segment = emitter.startSegment(definition, options)
            return isSegment(segment)
              ? {
                  ...segment,
                  end(outcome) {
                    forwarded += 1
                    return segment.end(outcome)
                  },
                }
              : segment
          },
        }
      },
    }
    const agent = createAgentTelemetry(port, { instance: processInstance })
    const session = createSessionTelemetry(port, { instance: processInstance })
    const tenant = testingTenant('org_app8c0pr0v1der000000000000', 'acc_app8c0pr0v1der000000000000')
    const execution = decodeAgentExecutionId('release-execution')
    if ('failure' in execution) throw new Error('expected an execution identity')
    const executionId = execution.ok
    function measure(span: number, phase: 'start' | 'end') {
      const timing = phase === 'start' ? ({ phase } as const) : ({ phase, outcome: 'ok' } as const)
      const common = { kind: 'segment', span, tenant, ...timing } as const
      if (span % 2 === 0)
        session.measure({ ...common, segment: 'session', session: null, operation: 'pending' })
      else agent.measure({ ...common, segment: 'agent', pass: 'run', execution: executionId })
    }
    try {
      for (let span = 1; span <= 20; span += 1) {
        measure(span, 'start')
        if (span < 20) time += 2
      }
      for (let span = 1; span <= 20; span += 1) measure(span, 'end')
      expect(forwarded).toBe(1)
      measure(21, 'start')
      const closing = runtime.close(1000)
      for (let span = 1; span <= 21; span += 1) measure(span, 'end')
      expect(forwarded).toBe(1)
      expect(await closing).toMatchObject({ droppedBy: { expired: 19 }, pending: 0 })
      expect(written.filter(record => record.signal === 'segment-end')).toHaveLength(1)
    } finally {
      await runtime.close(1000)
    }
  })
})
