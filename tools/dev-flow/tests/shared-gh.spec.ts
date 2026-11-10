import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  GH_READ_RETRY_DELAYS_MS,
  ghCommand,
  ghProcess,
  GhReadError,
  REST_HEADERS,
  runGhCommand,
} from '../src/shared/gh.ts'
import { ghEnv, writeGh } from './fixtures/gh.ts'

const NO_PARENT = {
  message: 'No parent issue found',
  documentation_url: 'https://docs.github.com/rest/issues/sub-issues#get-parent-issue',
  status: '404',
}

describe('gh read process outcomes', () => {
  // Slow: each case starts a fake gh child process.
  function withFakeGh<T>(script: string, run: () => T): T {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dev-flow-gh-read-')))
    try {
      writeGh(dir, `#!/usr/bin/env node\n${script}\n`)
      for (const [name, value] of Object.entries(ghEnv(dir))) vi.stubEnv(name, value)
      return run()
    } finally {
      vi.unstubAllEnvs()
      rmSync(dir, { recursive: true, force: true })
    }
  }
  // Classification only: the same process runner as `runGhCommand`, without the backoff sleep, so a
  // transient failure that is retried does not wait 3.5 seconds here.
  const read = ghCommand(ghProcess, () => undefined)
  function failure(script: string, timeoutMs = 10_000): unknown {
    return withFakeGh(script, () => {
      try {
        read(['api', 'repos/owner/repo/issues/1/parent'], timeoutMs)
      } catch (error) {
        return error
      }
      throw new Error('gh read unexpectedly succeeded')
    })
  }
  it('parses stdout of a successful read', { tags: ['slow'] }, () => {
    expect(
      withFakeGh(`process.stdout.write(JSON.stringify({ html_url: 'parent' }))`, () =>
        runGhCommand(['api', 'x'], 10_000),
      ),
    ).toEqual({ html_url: 'parent' })
  })
  it('carries the JSON response of a non-zero exit without exposing it', { tags: ['slow'] }, () => {
    const error = failure(
      `process.stdout.write(JSON.stringify(${JSON.stringify(NO_PARENT)})); process.stderr.write('gh: No parent issue found (HTTP 404)'); process.exit(1)`,
    )
    expect(error).toBeInstanceOf(GhReadError)
    expect((error as GhReadError).body).toEqual(NO_PARENT)
    expect((error as GhReadError).message).not.toContain('No parent issue found')
  })
  it.each([
    ['non-JSON stdout', `process.stdout.write('gh: not json'); process.exit(1)`, 10_000],
    ['empty stdout', `process.stderr.write('network down'); process.exit(1)`, 10_000],
    [
      'a timeout after JSON output',
      `process.stdout.write(JSON.stringify(${JSON.stringify(NO_PARENT)})); setTimeout(() => {}, 30_000)`,
      300,
    ],
  ])('keeps %s a plain failure', { tags: ['slow'] }, (_, script, timeoutMs) => {
    const error = failure(script, timeoutMs)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(GhReadError)
  })
  it(
    'runGhCommand retries a GET whose gh process failed without an HTTP status, with the real backoff',
    { tags: ['slow'] },
    () => {
      // The stand-in counts its launches in a file beside itself and only answers on the third.
      const result = withFakeGh(
        `import { readFileSync, writeFileSync } from 'node:fs'
const counter = process.argv[1] + '.count'
let n = 0
try { n = Number(readFileSync(counter, 'utf8')) } catch {}
n += 1
writeFileSync(counter, String(n))
if (n < 3) { process.stderr.write('net/http: TLS handshake timeout'); process.exit(1) }
process.stdout.write(JSON.stringify({ launches: n }))`,
        () => runGhCommand(['api', '--method', 'GET', ...REST_HEADERS, 'repos/owner/repo'], 10_000),
      )
      expect(result).toEqual({ launches: 3 })
    },
  )
})

describe('bounded retry of idempotent reads', () => {
  const GET = ['api', '--method', 'GET', ...REST_HEADERS, 'repos/owner/repo/issues/1']
  type Step = { stdout: string } | { error: unknown }
  /** A process stand-in that plays `steps` in order and records every launch and every sleep. */
  function harness(steps: Step[]) {
    const launches: string[][] = [],
      sleeps: number[] = []
    const command = ghCommand(
      (argv, timeoutMs) => {
        expect(timeoutMs).toBeGreaterThan(0)
        launches.push([...argv])
        const step = steps.shift()
        if (step === undefined) throw new Error('more launches than steps')
        if ('error' in step) throw step.error
        return step.stdout
      },
      ms => sleeps.push(ms),
    )
    return { launches, sleeps, command }
  }
  const exit = (stdout: string, stderr: string, status = 1): Error =>
    Object.assign(new Error('Command failed: gh'), { status, signal: null, stdout, stderr })
  const timeout = (): Error =>
    Object.assign(new Error('spawnSync gh ETIMEDOUT'), {
      code: 'ETIMEDOUT',
      status: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
    })
  const spawnFailure = (): Error =>
    Object.assign(new Error('spawnSync gh ENOENT'), {
      code: 'ENOENT',
      status: null,
      signal: null,
      stdout: null,
      stderr: null,
    })
  const api = (status: string, message = 'answer'): Error =>
    exit(JSON.stringify({ message, status }), `gh: ${message} (HTTP ${status})`)
  const ok = { stdout: '{"number":1}' }

  it.each([
    ['a non-zero exit with empty stdout', exit('', 'net/http: TLS handshake timeout')],
    ['a non-zero exit with non-JSON stdout', exit('gh: not json', 'read: connection reset')],
    ['a process timeout', timeout()],
    ['an HTTP 502 answer', api('502', 'Bad Gateway')],
    ['an HTTP 503 answer', api('503', 'Service Unavailable')],
  ])('retries %s and returns the next successful read', (_, error) => {
    const h = harness([{ error }, ok])
    expect(h.command(GET, 10_000)).toEqual({ number: 1 })
    expect(h.launches).toHaveLength(2)
    expect(h.sleeps).toEqual([GH_READ_RETRY_DELAYS_MS[0]])
  })

  it.each([
    ['an HTTP 404 answer', api('404', 'Not Found'), '404'],
    ['an HTTP 403 answer', api('403', 'Forbidden'), '403'],
    ['an HTTP 422 answer', api('422', 'Unprocessable'), '422'],
    ['an HTTP 429 answer, whose retry-after gh api does not expose', api('429', 'rate'), '429'],
  ])('does not retry %s and carries the response as before', (_, error, status) => {
    const h = harness([{ error }, ok])
    let thrown: unknown
    try {
      h.command(GET, 10_000)
    } catch (caught) {
      thrown = caught
    }
    expect(thrown).toBeInstanceOf(GhReadError)
    expect((thrown as GhReadError).body).toMatchObject({ status })
    expect(h.launches).toHaveLength(1)
    expect(h.sleeps).toEqual([])
  })

  it('does not retry a process that could not start', () => {
    const error = spawnFailure()
    const h = harness([{ error }, ok])
    expect(() => h.command(GET, 10_000)).toThrow(error)
    expect(h.launches).toHaveLength(1)
    expect(h.sleeps).toEqual([])
  })

  it('does not retry a successful read whose stdout is not JSON', () => {
    const h = harness([{ stdout: 'not json' }, ok])
    expect(() => h.command(GET, 10_000)).toThrow(SyntaxError)
    expect(h.launches).toHaveLength(1)
  })

  it('stops after three retries with the backoff 0.5s, 1s, 2s and throws the last failure', () => {
    const errors = [
      exit('', 'reset'),
      timeout(),
      api('500', 'Internal'),
      exit('', 'TLS handshake timeout'),
    ]
    const h = harness([...errors.map(error => ({ error })), ok])
    expect(() => h.command(GET, 10_000)).toThrow(errors[3])
    expect(h.launches).toHaveLength(4)
    expect(h.sleeps).toEqual([500, 1000, 2000])
    expect(GH_READ_RETRY_DELAYS_MS).toEqual([500, 1000, 2000])
  })

  it('throws the 5xx answer as a GhReadError when it persists through every retry', () => {
    const h = harness([
      { error: api('502') },
      { error: api('502') },
      { error: api('502') },
      { error: api('502') },
      ok,
    ])
    expect(() => h.command(GET, 10_000)).toThrow(GhReadError)
    expect(h.launches).toHaveLength(4)
  })

  it.each([
    ['a POST', ['api', '--method', 'POST', 'repos/owner/repo/issues/1/comments', '-f', 'body=x']],
    ['a PATCH', ['api', '--method', 'PATCH', 'repos/owner/repo/issues/1', '-f', 'state=closed']],
    ['a GraphQL query', ['api', 'graphql', '-f', 'query=query{viewer{login}}']],
    ['a path with fields and no method', ['api', 'repos/owner/repo/issues', '-f', 'title=x']],
    ['gh outside api', ['pr', 'list', '--json', 'number']],
  ])('never retries %s', (_, argv) => {
    const error = exit('', 'TLS handshake timeout')
    const h = harness([{ error }, ok])
    expect(() => h.command(argv, 10_000)).toThrow(error)
    expect(h.launches).toHaveLength(1)
    expect(h.sleeps).toEqual([])
  })

  it('treats an api path without --method and without fields as a GET', () => {
    const h = harness([{ error: exit('', 'reset') }, ok])
    expect(h.command(['api', 'repos/owner/repo/issues/1'], 10_000)).toEqual({ number: 1 })
    expect(h.launches).toHaveLength(2)
  })
})
