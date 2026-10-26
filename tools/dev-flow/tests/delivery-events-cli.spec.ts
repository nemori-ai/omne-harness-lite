// @module-tag slow
// Slow: every case runs wait-cli as a child process with a `gh` stand-in on PATH.
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
const cli = fileURLToPath(new URL('../src/delivery/wait-cli.ts', import.meta.url))

/** A `gh` that answers `issue view` with the given state and fails every other call. */
function setup(state: string) {
  const home = mkdtempSync(join(tmpdir(), 'wait-cli-'))
  homes.push(home)
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
if (process.argv[2] === 'issue' && process.argv[3] === 'view') {
  process.stdout.write(JSON.stringify({ state: ${JSON.stringify(state)} }))
} else process.exit(94)
`,
  )
  chmodSync(join(bin, 'gh'), 0o755)
  return { home, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
}
function run(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    encoding: 'utf8',
    env,
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
const closedLine = (issue: number) =>
  `${JSON.stringify({ delivery: 'd', event: 'issues', action: 'closed', number: issue, state: 'closed', draft: null, base: null, marker: null, html_url: null, receivedAt: '2026-10-26T18:00:00.000Z' })}\n`

describe('wait-cli', () => {
  it('prints the matching line and exits 0', () => {
    const { home, env } = setup('OPEN')
    const file = join(home, 'events.jsonl')
    writeFileSync(file, closedLine(5))
    const result = run(
      ['issue-closed', '--issue', '5', '--file', file, '--repo', 'owner/repo'],
      env,
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      number: 5,
      action: 'closed',
      source: 'event',
    })
  })

  it('exits 0 with source reconcile when the start-up read finds the Issue closed', () => {
    const { home, env } = setup('CLOSED')
    const result = run(
      [
        'issue-closed',
        '--issue',
        '5',
        '--file',
        join(home, 'events.jsonl'),
        '--repo',
        'owner/repo',
      ],
      env,
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ number: 5, source: 'reconcile' })
  })

  it('exits 3 with an explanation at the timeout', () => {
    const { home, env } = setup('OPEN')
    const result = run(
      [
        'issue-closed',
        '--issue',
        '5',
        '--file',
        join(home, 'events.jsonl'),
        '--repo',
        'owner/repo',
        '--timeout',
        '0.3',
      ],
      env,
    )
    expect(result.status).toBe(3)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'wait-timeout' })
  })

  it('exits 2 with the usage for unknown flags and a bad timeout', () => {
    const { env } = setup('OPEN')
    for (const args of [
      ['issue-closed', '--issue', '5', '--base', 'main', '--repo', 'owner/repo'],
      ['issue-closed', '--issue', '5', '--timeout', '0', '--repo', 'owner/repo'],
      ['comment', '--issue', '5', '--repo', 'owner/repo'],
    ]) {
      const result = run(args, env)
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'wait-error' })
    }
  })

  it('exits 2 when the start-up read fails', () => {
    const { home, env } = setup('OPEN')
    const result = run(
      [
        'pr-ready',
        '--base',
        'main',
        '--file',
        join(home, 'events.jsonl'),
        '--repo',
        'owner/repo',
        '--timeout',
        '1',
      ],
      env,
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'wait-error' })
  })
})
