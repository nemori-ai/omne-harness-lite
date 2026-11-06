// @module-tag slow
// The measurement wiring of the two emitting rows (#1140 C8): `session-provider` hands the Session
// telemetry facade (`measure`, `diagnose`) to its plugin, `agent-host` hands the Agent facade to the
// runtimes it builds, and both inject `telemetry` (D04: required, so a tree without the row does not
// serve). W1 and W2 run the release tree in this process with the real rows, a local Model gateway
// that refuses every call (R2-D258) and the `omne` CLI as a process, as `tests/r9/arrival.spec.ts`
// does; one input starts one Run, and the stdout records then carry the Session operation segments
// and the Agent pass segment of that tenant. W3 removes `session-ad14` from the tree, so the Run's
// invoke finds no Agent drive port and the coordinator reports `agent-absent`. W4 and W5 load each
// row alone: without `telemetry` it stays PENDING, over the disabled implementation it is ACTIVE.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { actingScopeCodec, tenantCodec, tenantScope } from '@omne-harness/legal-identity'
import { summarizeTelemetry } from '@omne-harness/telemetry-node'
import * as cordis from '../../../src/cordis.ts'
import { runServe, type S0Record, type ServeResult } from '../../../src/run.ts'
import { agentHostRow } from '../../../src/rows/agent-host/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import { startModelGateway } from '../../fixtures/model-gateway.ts'
import { hostConfig, hostDoubles, principalObject } from '../agent-host/doubles.ts'
import { connectable, until } from '../server-entry/support.ts'
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

/**
 * Runs the release tree in this process, with the real rows of `./cordis`, and gives `scenario` the
 * CLI. `omit` leaves rows out of the distribution. The Model route is the local gateway: every call
 * is refused, so the Run that an input starts ends the same way each time.
 */
async function withRelease<T>(
  omit: readonly string[],
  scenario: (tools: Tools) => Promise<T>,
): Promise<{ value: T; run: Run }> {
  const dir = newScratch('telemetry-measure-')
  const port = await freePort()
  const home = join(dir.base, 'home-alice')
  const controller = new AbortController()
  const records: S0Record[] = []
  const gateway = await startModelGateway()
  gateway.trustInProcess()
  const finished: Promise<Run> = runServe({
    distribution: { ...release, rows: release.rows.filter(row => !omit.includes(row.id)) },
    operator: operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: gateway.url }),
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

/** Registers and logs in, creates a session and sends one input, which starts one Run. */
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
  // The codec gives the JSON text; a record carries the object.
  return { tenant: tenant.value, scope: JSON.parse(encoded.value) as unknown }
}

describe('W1, W2: one Run of the release tree', () => {
  it(
    'writes the Session operation segments and the Agent pass segment of the tenant, and the summary gives each a count and p50/p95',
    { timeout: 120_000 },
    async () => {
      const { value, run } = await withRelease([], async tools => {
        const started = await oneRun(tools)
        // The Run of this tree does not reach its terminal entry: after the refused Model call the
        // coordinator's `receive` fails and the Run stays active, so a stop finds the execution in
        // its slot and the ordered shutdown is incomplete (R2-D173). This test observes the records;
        // it waits for the Agent pass and the Session accept to end, then stops.
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
      // The runtime closed and drained to the outlet, so the records below are the whole output.
      expect(run.records.find(record => record.kind === 'shutdown-result')).toMatchObject({
        telemetry: { kind: 'closed' },
      })
      const { tenant, scope } = scopeOf(value.tenantText)

      // W1: the Session segments are owner `session`, scoped to the tenant, and name the session as
      // the work; the Agent pass segment is owner `agent`, scoped to the same tenant.
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

      // W2: the stdout records, as lines, summarize per operation with a count and p50/p95.
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
        // The member's detail text is not projected (P3).
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
