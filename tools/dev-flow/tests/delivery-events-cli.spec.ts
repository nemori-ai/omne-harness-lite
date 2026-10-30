// @module-tag slow
// Slow: every case runs wait-cli as a child process with a `gh` stand-in on PATH.
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
const cli = fileURLToPath(new URL('../src/delivery/wait-cli.ts', import.meta.url))

const HEAD_A = 'a'.repeat(40),
  HEAD_B = 'b'.repeat(40)

/**
 * A `gh` that answers `issue view` with the given state, `pr list` with `pulls` when given, and the comment
 * `api` with `comments` pages. It fails every other call.
 */
function setup(state: string, pulls?: unknown[], comments: unknown[] = [[]]) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'wait-cli-')))
  homes.push(home)
  const bin = join(home, 'bin')
  mkdirSync(bin)
  writeGh(
    bin,
    `#!/usr/bin/env node
if (process.argv[2] === 'issue' && process.argv[3] === 'view') {
  process.stdout.write(JSON.stringify({ state: ${JSON.stringify(state)} }))
} else if (process.argv[2] === 'pr' && process.argv[3] === 'list' && ${pulls !== undefined}) {
  process.stdout.write(JSON.stringify(${JSON.stringify(pulls ?? [])}))
} else if (process.argv[2] === 'api') {
  process.stdout.write(JSON.stringify(${JSON.stringify(comments)}))
} else process.exit(94)
`,
  )
  return { home, env: { ...process.env, ...ghEnv(bin) } }
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

  it('hands back a pull request at a new head and skips it at an ignored head', () => {
    const { home, env } = setup('OPEN', [{ number: 2, isDraft: false, headRefOid: HEAD_B }])
    const base = ['pr-ready', '--base', 'main', '--file', join(home, 'events.jsonl')]
    const tail = ['--repo', 'owner/repo']
    const fresh = run([...base, '--ignore', `2@${HEAD_A}`, ...tail], env)
    expect(fresh.status).toBe(0)
    expect(JSON.parse(fresh.stdout)).toMatchObject({ number: 2, head: HEAD_B, source: 'reconcile' })
    const skipped = run(
      [...base, '--ignore', `9@${HEAD_A}`, '--ignore', `2@${HEAD_B}`, ...tail, '--timeout', '0.3'],
      env,
    )
    expect(skipped.status).toBe(3)
  })

  it('answers any with the member that holds and exits 3 when none does', () => {
    const closed = setup('CLOSED')
    const hit = run(
      [
        'any',
        '--issue-closed',
        '5',
        '--comment',
        '5:line-return',
        '--file',
        join(closed.home, 'events.jsonl'),
        '--repo',
        'owner/repo',
      ],
      closed.env,
    )
    expect(hit.status).toBe(0)
    expect(JSON.parse(hit.stdout)).toMatchObject({
      number: 5,
      source: 'reconcile',
      matched: 'issue-closed',
    })
    const comment = setup(
      'OPEN',
      [],
      [[{ body: '<!-- line-return -->\nx', created_at: '2026-10-26T12:00:00Z', html_url: 'u1' }]],
    )
    const returned = run(
      [
        'any',
        '--issue-closed',
        '5',
        '--comment',
        '5:line-return',
        '--file',
        join(comment.home, 'events.jsonl'),
        '--repo',
        'owner/repo',
      ],
      comment.env,
    )
    expect(returned.status).toBe(0)
    expect(JSON.parse(returned.stdout)).toMatchObject({ matched: 'comment', html_url: 'u1' })
    const open = setup('OPEN')
    const none = run(
      [
        'any',
        '--issue-closed',
        '5',
        '--comment',
        '5:line-return',
        '--file',
        join(open.home, 'events.jsonl'),
        '--repo',
        'owner/repo',
        '--timeout',
        '0.3',
      ],
      open.env,
    )
    expect(none.status).toBe(3)
  })

  it('exits 2 with the usage for bad any and ignore arguments', () => {
    const { env } = setup('OPEN')
    for (const args of [
      ['any', '--repo', 'owner/repo'],
      ['any', '--comment', 'line-return', '--repo', 'owner/repo'],
      ['any', '--comment', '5:', '--repo', 'owner/repo'],
      ['any', '--issue', '5', '--repo', 'owner/repo'],
      ['pr-ready', '--base', 'main', '--ignore', '2', '--repo', 'owner/repo'],
      ['issue-closed', '--issue', '5', '--ignore', `2@${HEAD_A}`, '--repo', 'owner/repo'],
    ]) {
      const result = run(args, env)
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'wait-error' })
    }
  })

  it('exits 2 for a short head sha and says that the full sha is needed', () => {
    const { home, env } = setup('OPEN', [])
    const result = run(
      [
        'pr-ready',
        '--file',
        join(home, 'events.jsonl'),
        '--base',
        'main',
        '--ignore',
        '2@abcdef1',
        '--repo',
        'owner/repo',
        '--timeout',
        '1',
      ],
      env,
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'wait-error',
      message: expect.stringContaining('full commit sha'),
    })
  })

  it('exits 2 with the error code when the event file cannot be read', () => {
    const { home, env } = setup('OPEN')
    const file = join(home, 'events.jsonl')
    symlinkSync(file, file)
    const result = run(
      ['issue-closed', '--issue', '5', '--file', file, '--repo', 'owner/repo'],
      env,
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'wait-error', code: 'ELOOP' })
  })
})

describe('events-receiver-cli clean', () => {
  const receiverCli = fileURLToPath(
    new URL('../src/delivery/events-receiver-cli.ts', import.meta.url),
  )
  function hookEnv() {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'receiver-cli-')))
    homes.push(home)
    const bin = join(home, 'bin')
    mkdirSync(bin)
    writeGh(
      bin,
      `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(join(home, 'gh-calls'))}, JSON.stringify(process.argv) + '\\n')
process.exit(94)
`,
    )
    return { ...process.env, ...ghEnv(bin) }
  }
  const runReceiver = (args: string[], env: NodeJS.ProcessEnv) => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', receiverCli, ...args],
      {
        encoding: 'utf8',
        env,
      },
    )
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  }

  it('refuses cleanup without ownership configuration and makes no GitHub calls', () => {
    const env = hookEnv()
    const result = runReceiver(['clean', '--repo', 'owner/repo'], env)
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'receiver-error' })
    expect(existsSync(join(homes.at(-1) ?? '', 'gh-calls'))).toBe(false)
  })

  it('exits 2 with the usage for unknown commands and flags', () => {
    const env = hookEnv()
    for (const args of [['serve-all'], ['clean', '--port', '1', '--repo', 'owner/repo'], []]) {
      const result = runReceiver(args, env)
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stderr)).toMatchObject({ kind: 'receiver-error' })
    }
  })

  it('exits 2 with the error code when the event file directory cannot be made', () => {
    const env = hookEnv()
    const blocker = join(homes.at(-1) ?? '', 'blocker')
    writeFileSync(blocker, '')
    const result = runReceiver(
      [
        'serve',
        '--mode',
        'legacy',
        '--port',
        '1',
        '--file',
        join(blocker, 'events.jsonl'),
        '--repo',
        'owner/repo',
      ],
      env,
    )
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'receiver-error',
      code: expect.stringMatching(/^E[A-Z]+$/),
    })
  })
})

describe('events-receiver-cli serve', () => {
  const receiverCli = fileURLToPath(
    new URL('../src/delivery/events-receiver-cli.ts', import.meta.url),
  )
  const freePort = () =>
    new Promise<number>((resolve, reject) => {
      const probe = createServer()
      probe.once('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        const port = typeof address === 'object' && address !== null ? address.port : 0
        probe.close(() => resolve(port))
      })
    })

  // Windows has no SIGHUP to deliver: Node's kill ignores the signal name there and terminates the
  // process at once, so the receiver never runs its stop path.
  it.skipIf(process.platform === 'win32')(
    'stops the legacy child on SIGHUP and preserves hooks whose ownership is unproven',
    async () => {
      const home = realpathSync(mkdtempSync(join(tmpdir(), 'receiver-serve-')))
      homes.push(home)
      const bin = join(home, 'bin'),
        state = join(home, 'hooks.json'),
        deletions = join(home, 'deleted.log'),
        file = join(home, 'events', 'events.jsonl')
      mkdirSync(bin)
      writeFileSync(state, '[1]')
      writeGh(
        bin,
        `#!/usr/bin/env node
const fs = require('node:fs')
const state = ${JSON.stringify(state)}
const read = () => JSON.parse(fs.readFileSync(state, 'utf8'))
const args = process.argv.slice(2)
if (args[0] === 'webhook') {
  fs.writeFileSync(state, JSON.stringify([...read(), 7]))
  process.on('SIGTERM', () => process.exit(0))
  setInterval(() => undefined, 1000)
} else if (args.includes('DELETE')) {
  const id = Number(args.at(-1).split('/').at(-1))
  fs.appendFileSync(${JSON.stringify(deletions)}, id + '\\n')
  fs.writeFileSync(state, JSON.stringify(read().filter(hook => hook !== id)))
} else {
  const url = 'https://webhook-forwarder.github.com/hook'
  process.stdout.write(JSON.stringify([read().map(id => ({ id, name: 'cli', config: { url } }))]))
}
`,
      )
      const port = await freePort()
      const child = spawn(
        process.execPath,
        [
          '--experimental-strip-types',
          receiverCli,
          'serve',
          '--mode',
          'legacy',
          '--port',
          String(port),
          '--file',
          file,
          '--repo',
          'owner/repo',
        ],
        { env: { ...process.env, ...ghEnv(bin) }, stdio: 'ignore' },
      )
      const exited = new Promise<number | null>(resolve =>
        child.once('exit', code => resolve(code)),
      )
      try {
        await vi.waitFor(
          () => {
            expect(existsSync(join(home, 'events', 'receiver.pid'))).toBe(true)
            expect(readFileSync(state, 'utf8')).toBe('[1,7]')
          },
          { timeout: 10_000, interval: 50 },
        )
        child.kill('SIGHUP')
        expect(await exited).toBe(2)
        expect(existsSync(deletions)).toBe(false)
        expect(readFileSync(state, 'utf8')).toBe('[1,7]')
        expect(existsSync(join(home, 'events', 'receiver.pid'))).toBe(false)
        expect(
          JSON.parse(readFileSync(join(home, 'events', 'receiver-state.json'), 'utf8')),
        ).toMatchObject({
          state: 'recovery-needed',
          hookId: null,
        })
      } finally {
        child.kill('SIGKILL')
      }
    },
    20_000,
  )
})
