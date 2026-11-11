import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSummaryCli } from '../src/summary-cli.ts'

const T0 = '2026-11-05T00:00:00.000Z'
const TENANT = {
  organization: 'org_0123456789abcdefghjkmnpqrs',
  account: 'acc_0123456789abcdefghjkmnpqrs',
}

function segmentEnd(name: string, durationMs: number, scope: unknown = { kind: 'system' }): string {
  return JSON.stringify({
    kind: 'telemetry',
    signal: 'segment-end',
    time: T0,
    generation: 'g1',
    owner: 'access',
    name,
    version: 1,
    scope,
    component: 'server-entry',
    instance: { owner: 'apps/harness-server', ref: 'run-1' },
    trace: `t-${name}-${String(durationMs)}`,
    span: 's',
    outcome: 'ok',
    durationMs,
  })
}

const INPUT = [
  segmentEnd('fast', 1),
  segmentEnd('slow', 900),
  segmentEnd('middle', 50),
  JSON.stringify({ kind: 'row-state', row: 'telemetry', state: 'ACTIVE' }),
  'not json',
].join('\n')

type Outcome = { code: number; stdout: string; stderr: string }

async function run(argv: readonly string[], stdin = ''): Promise<Outcome> {
  let stdout = ''
  let stderr = ''
  const code = await runSummaryCli(argv, {
    stdin: Readable.from([stdin]),
    stdout: text => {
      stdout += text
    },
    stderr: text => {
      stderr += text
    },
  })
  return { code, stdout, stderr }
}

let dir = ''

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'telemetry-summary-cli-')))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('omne-telemetry-summary', () => {
  it('reads a file and prints the machine-readable report with --json', async () => {
    const path = join(dir, 'telemetry.log')
    await writeFile(path, `${INPUT}\n`)

    const out = await run(['--json', path])

    expect(out.code).toBe(0)
    expect(out.stderr).toBe('')
    const report: unknown = JSON.parse(out.stdout)
    expect(report).toMatchObject({
      segments: [{ name: 'slow' }, { name: 'middle' }, { name: 'fast' }],
      skipped: { invalid: 1, otherKinds: 1 },
      unfinished: 0,
      window: { from: T0, to: T0 },
    })
  })

  it('reads standard input when no file is given, and prints a table in descending p95 order', async () => {
    const out = await run([], INPUT)

    expect(out.code).toBe(0)
    const rows = out.stdout.split('\n')
    const order = ['slow', 'middle', 'fast'].map(name =>
      rows.findIndex(row => row.includes(`access  ${name}`)),
    )
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(out.stdout).toContain('p95')
    expect(out.stdout).toMatch(/invalid\s+1/)
  })

  it('passes the tenant and the time window to the summary', async () => {
    const input = [
      segmentEnd('tenant', 5, { kind: 'tenant', tenant: TENANT }),
      segmentEnd('system', 6),
    ].join('\n')

    const out = await run(
      [
        '--json',
        '--tenant',
        JSON.stringify(TENANT),
        '--from',
        '2026-11-05T00:00:00.000Z',
        '--to',
        '2026-11-05T00:00:01.000Z',
      ],
      input,
    )

    expect(out.code).toBe(0)
    expect(JSON.parse(out.stdout)).toMatchObject({ segments: [{ name: 'tenant' }] })
  })

  it.each([
    ['an unknown option', ['--bogus']],
    ['two files', ['a.log', 'b.log']],
    ['tenant text that does not parse', ['--tenant', 'org_x']],
    ['a time that does not parse', ['--from', 'yesterday']],
    ['a missing option value', ['--to']],
  ])('exits 2 and writes the usage to stderr for %s', async (_case, argv) => {
    const out = await run(argv)

    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('usage: omne-telemetry-summary')
  })

  it('exits 1 and names the path when the file does not open', async () => {
    const path = join(dir, 'missing.log')

    const out = await run([path])

    expect(out.code).toBe(1)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain(path)
  })
})
