import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  distributionPath,
  freePort,
  operatorLayer,
  serverBin,
  writeOperator,
} from '../../r9/support.ts'
import { startTree } from '../server-entry/support.ts'

type Rec = { kind: string } & Record<string, unknown>

const BUDGETS = {
  maxRecordBytes: 65_536,
  maxQueueItems: 1024,
  maxQueueBytes: 1_048_576,
  maxOpenSegments: 16,
  maxLogTextLength: 4096,
  summaryIntervalMs: 1000,
}

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

describe('A11: the telemetry row is required', () => {
  it('without the row, server-entry stays PENDING and the assembly names telemetry', async () => {
    const tree = startTree({
      config: { listenPort: await freePort() },
      withoutTelemetry: true,
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
    const ids = release.rows.map(r => r['id'])
    expect(ids.indexOf('telemetry')).toBeLessThan(ids.indexOf('server-entry'))
  })

  it(
    'A1, A4, A9: every stdout line is one JSON record, telemetry is in the tree, shutdown-result is last and readable',
    { tags: ['slow'] },
    async () => {
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
          child.stdin.end()
        }
      })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk
      })
      const code = await new Promise<number | null>(resolve => child.on('close', resolve))
      expect(code, stderr).toBe(0)

      expect(stdout.endsWith('\n')).toBe(true)
      const lines = stdout.slice(0, -1).split('\n')
      const records = lines.map(line => JSON.parse(line) as Rec)
      expect(records.every(record => typeof record.kind === 'string')).toBe(true)
      expect(records.at(-1)?.kind).toBe('shutdown-result')
      expect(records.filter(record => record.kind === 'shutdown-result')).toHaveLength(1)

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
