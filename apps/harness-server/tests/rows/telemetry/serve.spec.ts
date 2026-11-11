// The `telemetry` row next to the real `server-entry` row and in the real release: an entry
// diagnostic as a telemetry record (A2), the entry PENDING without the row (A11), and the `serve`
// process whose stdout is one complete JSON record per line with `shutdown-result` last (A1, A4, A9).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { entryDiagnostics } from '../../../src/rows/server-entry/telemetry.ts'
import {
  distributionPath,
  freePort,
  operatorLayer,
  serverBin,
  writeOperator,
} from '../../r9/support.ts'
import {
  SESSION_PATH,
  createSessionBody,
  login,
  post,
  startTree,
  waitListening,
} from '../server-entry/support.ts'

type Rec = { kind: string } & Record<string, unknown>

/** Test budgets for the release tree. The release row carries none (A12). */
const BUDGETS = {
  maxRecordBytes: 65_536,
  maxQueueItems: 1024,
  maxQueueBytes: 1_048_576,
  maxOpenSegments: 16,
  maxLogTextLength: 4096,
  summaryIntervalMs: 1000,
}

/**
 * The test operator layer of `tests/r9/support.ts` plus the `telemetry` replace: a `replace` swaps
 * the whole row, so it restates the release implementation and outlet and adds the budgets.
 */
function withTelemetry(layer: unknown): unknown {
  const { ops } = layer as { ops: unknown[] }
  return {
    ops: [
      ...ops,
      {
        kind: 'replace',
        id: 'telemetry',
        config: { implementation: 'node', outlet: { kind: 'stdout' }, budgets: BUDGETS },
      },
    ],
  }
}

const scratches: string[] = []
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('A2: the server-entry diagnostic through telemetry', () => {
  it('a recognizeLogin fault is one omne.entry.diagnostic record in system scope, without tenant, body, credential or error text', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port }, identityFaults: true })
    await waitListening(tree, port)
    const who = await login(port, 'alice', 'pw-SECRET-1')
    const reply = await post(port, SESSION_PATH, createSessionBody(who, 'create-1'))
    expect(reply.status).toBe(503)
    const run = await tree.stop()
    expect(run.result.exitCode).toBe(0)
    const events = run.records.filter(
      record => record.kind === 'telemetry' && record['name'] === 'omne.entry.diagnostic',
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'telemetry',
      signal: 'event',
      owner: 'server-entry',
      name: 'omne.entry.diagnostic',
      version: 1,
      level: 'warn',
      scope: { kind: 'system' },
      component: 'server-entry',
      instance: { owner: '@omne-harness/harness-server', ref: expect.any(String) },
      fields: { code: 'identity.fault', operation: 'recognizeLogin' },
    })
    expect(Object.keys(events[0]!['fields'] as object)).toEqual(['code', 'operation'])
    expect(events[0]).not.toHaveProperty('work')
    const printed = JSON.stringify(events[0])
    expect(printed).not.toContain('tenant')
    expect(printed).not.toContain(who.tenantText)
    expect(printed).not.toContain(who.loginProof)
    expect(printed).not.toContain('SECRET')
    expect(printed).not.toContain('create-1')
    // The thrown error's text stays out of stdout entirely (a fault code, not a message).
    expect(JSON.stringify(run.records)).not.toContain('IDENTITY-FAULT-TEXT')
  })
})

describe('M2: the path of an entry diagnostic', () => {
  it('keeps only the path of the request URL: a query or fragment the client sent never reaches the record', () => {
    // `request.fault` carries `req.url` as the member received it. The entry 404s a query before
    // anything can throw, so the facade is where a client's text is cut, whatever the member hands in.
    const capture = createCapturingTelemetry()
    const sink = entryDiagnostics(capture.port)

    sink({ code: 'request.fault', path: '/session-public/1?token=sk-test-123' })
    sink({ code: 'request.fault', path: '/governance-public/1#sk-test-456' })
    sink({
      code: 'request.fault',
      path: 'http://attacker.example/session-public/1?token=sk-test-789',
    })
    sink({ code: 'request.fault', path: 'http://[not-a-host' })

    const fields = capture.records().map(record => (record.kind === 'event' ? record.fields : null))
    expect(fields).toEqual([
      { code: 'request.fault', path: '/session-public/1' },
      { code: 'request.fault', path: '/governance-public/1' },
      { code: 'request.fault', path: '/session-public/1' },
      { code: 'request.fault' },
    ])
    expect(JSON.stringify(capture.records())).not.toContain('sk-test-')
    expect(capture.dropped()).toBe(0)
  })
})

describe('A11: the telemetry row is required', () => {
  it('without the row, server-entry stays PENDING and the assembly names telemetry', async () => {
    const tree = startTree({
      config: { listenPort: await freePort() },
      withoutTelemetry: true,
      readinessTimeoutMs: 300,
    })
    const run = await tree.finished
    expect(run.result.exitCode).toBe(4)
    expect(run.state('server-entry')).toMatchObject({ state: 'PENDING', missing: ['telemetry'] })
    expect(run.startup).toMatchObject({ accepting: false, outcome: 'pending' })
  })
})

describe('the serve process with the release', () => {
  it('A1: the release names the telemetry row with the node implementation on stdout and no numbers', () => {
    const release = JSON.parse(readFileSync(distributionPath, 'utf8')) as { rows: Rec[] }
    const row = release.rows.find(r => r['id'] === 'telemetry')
    expect(row).toEqual({
      id: 'telemetry',
      plugin: 'telemetry',
      config: { implementation: 'node', outlet: { kind: 'stdout' } },
    })
    // The entry needs its provider before it loads.
    const ids = release.rows.map(r => r['id'])
    expect(ids.indexOf('telemetry')).toBeLessThan(ids.indexOf('server-entry'))
  })

  it(
    'A1, A4, A9: every stdout line is one JSON record, telemetry is in the tree, shutdown-result is last and readable',
    { tags: ['slow'] },
    async () => {
      // Slow: starts `dist/bin.js serve` on the whole release tree (real SQLite storage).
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'telemetry-serve-')))
      scratches.push(base)
      const stateRoot = join(base, 'state')
      mkdirSync(stateRoot)
      const operatorPath = join(base, 'operator.json')
      const port = await freePort()
      writeOperator(
        operatorPath,
        withTelemetry(
          operatorLayer({
            storageRoot: join(stateRoot, 'storage'),
            port,
            shutdownDeadlineMs: 2000,
          }),
        ),
      )
      const child = spawn(
        process.execPath,
        [
          serverBin,
          'serve',
          '--distribution',
          distributionPath,
          '--operator',
          operatorPath,
          '--readiness-timeout-ms',
          '15000',
          '--shutdown-deadline-ms',
          '2000',
          '--state-root',
          stateRoot,
          '--stop-on-stdin-close',
        ],
        { env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'] },
      )
      let stdout = ''
      let stderr = ''
      let stopped = false
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk
        if (!stopped && stdout.includes('"kind":"startup-result"')) {
          stopped = true
          // No request is sent: the release rows write a few WARN and INFO messages while they
          // load, and those `log` records are what this run checks the line protocol on.
          child.stdin.end()
        }
      })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk
      })
      const code = await new Promise<number | null>(resolve => child.on('close', resolve))
      expect(code, stderr).toBe(0)

      // A4: every line is one complete JSON object; the output ends with a newline.
      expect(stdout.endsWith('\n')).toBe(true)
      const lines = stdout.slice(0, -1).split('\n')
      const records = lines.map(line => JSON.parse(line) as Rec)
      expect(records.every(record => typeof record.kind === 'string')).toBe(true)
      expect(records.at(-1)?.kind).toBe('shutdown-result')
      expect(records.filter(record => record.kind === 'shutdown-result')).toHaveLength(1)

      // A1: the telemetry row is in the tree, real, node on stdout; startup is ready.
      expect(records.find(r => r.kind === 'tree' && r['id'] === 'telemetry')).toMatchObject({
        plugin: 'telemetry',
        implementation: 'real',
        telemetry: { implementation: 'node', outlet: 'stdout' },
      })
      expect(records.find(r => r.kind === 'row-state' && r['id'] === 'telemetry')).toMatchObject({
        state: 'ACTIVE',
      })
      expect(records.find(r => r.kind === 'startup-result')).toMatchObject({
        accepting: true,
        outcome: 'ready',
      })

      // A9: the close report of the runtime is readable from the process output.
      expect(records.at(-1)?.['telemetry']).toMatchObject({
        kind: 'closed',
        flush: 'completed-to-boundary',
        boundary: 'local-sink',
        transport: 'closed',
        pending: 0,
      })
      expect(stderr).toContain('serve: stop requested: stdin closed')
    },
  )
})
