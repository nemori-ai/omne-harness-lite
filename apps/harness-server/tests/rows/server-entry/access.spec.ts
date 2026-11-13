// The new address of the `server-entry` row (#1249 C9): the row alone serves the entry's own
// `access/v1`, the release adds `identity/v1` (the `identity-access` row); the availability needs
// no login, so the identity port of the row is never asked; access diagnostics leave as
// `omne.access.diagnostic` in system scope.
import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { AccessIdentity } from '@omne-harness/access-cordis-contract'
import { createCapturingTelemetry } from '@omne-harness/telemetry-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { defineProtocol } from '@omne-harness/public-contract'
import { accessDiagnostics, entryAccess } from '../../../src/rows/server-entry/access.ts'
import {
  distributionPath,
  freePort,
  operatorLayer,
  serverBin,
  writeOperator,
} from '../../r9/support.ts'
import { startTree, waitListening } from './support.ts'

type Rec = { kind: string } & Record<string, unknown>

const AVAILABILITY = '/api/access/v1/availability'

/** Opens the availability observation without a login and answers its head and first event. */
function firstEvent(port: number): Promise<{ status: number; type: string; event: string }> {
  return new Promise((resolve, reject) => {
    const body = '{}'
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: AVAILABILITY,
        headers: {
          host: `127.0.0.1:${port}`,
          'content-type': 'application/json',
          'content-length': String(body.length),
          'omne-message-id': 'm-1',
        },
      },
      res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
          const end = text.indexOf('\n\n')
          if (end === -1) return
          resolve({
            status: res.statusCode ?? 0,
            type: String(res.headers['content-type']),
            event: text.slice(0, end),
          })
          req.destroy()
        })
        // An answer that is not an event stream ends without an event.
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            type: String(res.headers['content-type']),
            event: text,
          }),
        )
        res.on('error', () => {})
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

/** An identity port for the cases that never ask it. */
const NO_IDENTITY: AccessIdentity = {
  identifyLogin: async () => ({ outcome: 'basis-unavailable' }),
  actFor: async () => ({ outcome: 'basis-unavailable' }),
  reportAccess: async () => {},
}

const SNAPSHOT = {
  kind: 'frame',
  frame: { kind: 'snapshot', revision: 1, protocols: [{ name: 'access', major: 1 }] },
}

describe('server-entry row: the new address', () => {
  it('serves the availability of access/v1 alone, without a login', async () => {
    const port = await freePort()
    const tree = startTree({ config: { listenPort: port } })
    await waitListening(tree, port)
    const first = await firstEvent(port)
    expect(first.status).toBe(200)
    expect(first.type).toBe('text/event-stream; charset=utf-8')
    expect(JSON.parse(first.event.slice('data: '.length))).toEqual(SNAPSHOT)
    const run = await tree.stop()
    expect(run.result.exitCode).toBe(0)
    const access = run.records.filter(
      record => record.kind === 'telemetry' && record['name'] === 'omne.access.diagnostic',
    )
    expect(access).toEqual([])
  })

  it('writes an access diagnostic as omne.access.diagnostic with only the code and the references', () => {
    const capture = createCapturingTelemetry()
    const sink = accessDiagnostics(capture.port)
    sink({ code: 'access.identity-unavailable', path: '/api/notes/v1/read-note', operation: 'x' })
    sink({ code: 'access.listener-fault' })
    const records = capture.records()
    expect(records.map(record => (record.kind === 'event' ? record.fields : null))).toStrictEqual([
      { code: 'access.identity-unavailable', path: '/api/notes/v1/read-note', operation: 'x' },
      { code: 'access.listener-fault' },
    ])
    expect(records[0]).toMatchObject({
      binding: { scope: { kind: 'system' }, component: 'server-entry' },
      definition: { name: 'omne.access.diagnostic' },
    })
  })
})

describe('server-entry row: the access it gives the entry', () => {
  it('leaves out a reference the event refuses, and keeps the code', () => {
    const capture = createCapturingTelemetry()
    const sink = accessDiagnostics(capture.port)
    sink({ code: 'access.path-rejected', path: `/${'p'.repeat(300)}`, operation: 'o'.repeat(200) })
    sink({ code: 'access.not-mounted', path: `/${'p'.repeat(300)}`, operation: 'read-note' })
    sink({
      code: 'access.not-mounted',
      path: '/api/notes/v1/read-note',
      operation: 'o'.repeat(200),
    })
    expect(
      capture.records().map(record => (record.kind === 'event' ? record.fields : null)),
    ).toStrictEqual([
      { code: 'access.path-rejected' },
      { code: 'access.not-mounted', operation: 'read-note' },
      { code: 'access.not-mounted', path: '/api/notes/v1/read-note' },
    ])
  })

  it('gives the entry the identity port the row built', () => {
    const port: AccessIdentity = {
      identifyLogin: async () => ({ outcome: 'denied' }),
      actFor: async () => ({ outcome: 'denied' }),
      reportAccess: async () => {},
    }
    const { identity } = entryAccess(new Context(), createCapturingTelemetry().port, port)
    expect(identity).toBe(port)
  })

  it('writes access.listener-fault when an availability listener throws', () => {
    const capture = createCapturingTelemetry()
    const { registry } = entryAccess(new Context(), capture.port, NO_IDENTITY)
    registry.subscribe(() => {
      throw new Error('listener')
    })
    const protocol = defineProtocol({ name: 'empty', major: 1, operations: {}, observations: {} })
    registry.mount({ protocol, operations: {}, observations: {} } as never)
    expect(
      capture.records().map(record => (record.kind === 'event' ? record.fields : null)),
    ).toStrictEqual([{ code: 'access.listener-fault' }])
  })
})

const scratches: string[] = []
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The test operator layer plus telemetry on stdout, so the access records can be read. */
function withTelemetry(layer: unknown): unknown {
  const { ops } = layer as { ops: unknown[] }
  return {
    ops: [
      ...ops,
      {
        kind: 'replace',
        id: 'telemetry',
        config: {
          implementation: 'node',
          outlet: { kind: 'stdout' },
          budgets: {
            maxRecordBytes: 65_536,
            maxQueueItems: 1024,
            maxQueueBytes: 1_048_576,
            maxOpenSegments: 16,
            maxLogTextLength: 4096,
            summaryIntervalMs: 1000,
          },
        },
      },
    ],
  }
}

describe('the serve process with the release', () => {
  it(
    'C9: the release answers the availability with a snapshot of access/v1 and identity/v1, and never asks its identity port',
    { tags: ['slow'] },
    async () => {
      // Slow: starts `dist/bin.js serve` on the whole release tree (real SQLite storage).
      const base = realpathSync(mkdtempSync(join(tmpdir(), 'access-serve-')))
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
      const started = new Promise<void>(resolve => {
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
          stdout += chunk
          if (stdout.includes('"kind":"startup-result"')) resolve()
        })
      })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk
      })
      const closed = new Promise<number | null>(resolve => child.on('close', resolve))
      await started
      const first = await firstEvent(port)
      child.stdin.end()
      expect(await closed, stderr).toBe(0)
      expect(first.status).toBe(200)
      const event = JSON.parse(first.event.slice('data: '.length)) as {
        kind: string
        frame: { kind: string; protocols: { name: string; major: number }[] }
      }
      expect(event).toMatchObject({ kind: 'frame', frame: { kind: 'snapshot' } })
      // The release mounts identity/v1 through the `identity-access` row beside access/v1.
      expect(event.frame.protocols.map(key => `${key.name}/v${key.major}`).sort()).toStrictEqual([
        'access/v1',
        'identity/v1',
      ])
      const records = stdout
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Rec)
      const access = records.filter(
        record => record.kind === 'telemetry' && record['name'] === 'omne.access.diagnostic',
      )
      // The availability needs no login, so the identity port is never asked; any refusal or
      // failure of it would leave an `access.identity-*` diagnostic here.
      expect(access).toEqual([])
    },
  )
})
