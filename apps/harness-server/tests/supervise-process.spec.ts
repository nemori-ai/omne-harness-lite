// @module-tag slow
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { LAB_MARKER } from '../src/state-instance.ts'
import { STATE_STAMP_FILE } from '../src/state-stamp.ts'
import { freePort, operatorLayer, writeOperator } from './r9/support.ts'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const bin = join(memberDir, 'dist', 'bin.js')
const distributionPath = join(memberDir, 'config', 'serve.distribution.json')
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'supervise-process-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let count = 0
async function stateRootWithOperator(): Promise<{ stateRoot: string; serveArgs: string[] }> {
  const stateRoot = join(scratch, `state-${String(count++)}`)
  mkdirSync(stateRoot)
  const operatorPath = join(scratch, `operator-${String(count)}.json`)
  writeOperator(
    operatorPath,
    operatorLayer({
      storageRoot: join(stateRoot, 'storage'),
      port: await freePort(),
      shutdownDeadlineMs: 2000,
    }),
  )
  const serveArgs = [
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
  ]
  return { stateRoot, serveArgs }
}

type Supervised = {
  child: ChildProcess
  stderr: () => string
  stdout: () => string
  /** Resolves with the n-th serve process the supervisor reports it started. */
  started: (n: number) => Promise<number>
  accepting: (n: number) => Promise<void>
  exit: Promise<number | null>
}
const live: ChildProcess[] = []
afterEach(() => {
  for (const child of live.splice(0)) if (child.exitCode === null) child.kill('SIGKILL')
})

function superviseWith(args: readonly string[]): Supervised {
  const child = spawn(process.execPath, [bin, 'supervise', ...args], {
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  live.push(child)
  let out = ''
  let err = ''
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (out += chunk))
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (err += chunk))
  const exit = new Promise<number | null>(resolve => child.on('exit', resolve))
  const until = async <T>(read: () => T | undefined, what: string): Promise<T> => {
    for (let turn = 0; turn < 600; turn += 1) {
      const got = read()
      if (got !== undefined) return got
      if (child.exitCode !== null) break
      await new Promise(done => setTimeout(done, 50))
    }
    throw new Error(`${what} did not come; stderr: ${err.slice(-600)}`)
  }
  const pids = (): number[] =>
    [...err.matchAll(/supervise: started serve, process (\d+)/g)].map(match => Number(match[1]))
  return {
    child,
    stderr: () => err,
    stdout: () => out,
    exit,
    started: n => until(() => pids()[n - 1], `serve process ${String(n)}`),
    accepting: n =>
      until(
        () =>
          (out.match(/"kind":"startup-result"[^\n]*"accepting":true/g) ?? []).length >= n
            ? true
            : undefined,
        `startup ${String(n)}`,
      ).then(() => undefined),
  }
}

describe('harness-server supervise', () => {
  it('keeps serve up: a killed serve is started again; a stop of the supervisor stops serve and ends with 0', async () => {
    const { serveArgs } = await stateRootWithOperator()
    const run = superviseWith(['--stable-ms', '200', '--backoff-base-ms', '100', ...serveArgs])
    const first = await run.started(1)
    await run.accepting(1)
    process.kill(first, 'SIGKILL')
    const second = await run.started(2)
    expect(second).not.toBe(first)
    await run.accepting(2)
    expect(run.stderr()).toMatch(
      /supervise: serve left \(killed by SIGKILL\); starting it again in 100 ms/,
    )
    run.child.kill('SIGTERM')
    expect(await run.exit).toBe(0)
    expect(run.stderr()).toContain('supervise: stop requested: SIGTERM')
    expect(() => process.kill(second, 0)).toThrow()
    // The records of both serve processes went through: two shutdown results would need the first to have closed.
    expect((run.stdout().match(/"kind":"shutdown-result"/g) ?? []).length).toBe(1)
  })

  it('does not start serve again after it left with 2, and ends with 2', async () => {
    const { stateRoot, serveArgs } = await stateRootWithOperator()
    writeFileSync(
      join(stateRoot, STATE_STAMP_FILE),
      JSON.stringify({ writtenBy: 'harness-server@9.9.9', formats: { 'state-directory': 2 } }),
    )
    const run = superviseWith(['--backoff-base-ms', '100', ...serveArgs])
    expect(await run.exit).toBe(2)
    expect(run.stderr()).toContain('state-root-newer: written by harness-server@9.9.9')
    expect(run.stderr()).toContain(
      'supervise: serve left with 2: a configuration error; it is not started again',
    )
    expect(run.stderr().match(/supervise: started serve/g)).toHaveLength(1)
  })

  it('gives up when serve falls again and again before it settles, and ends with the last code', async () => {
    const { stateRoot, serveArgs } = await stateRootWithOperator()
    // A release instance does not start on a directory of a lab instance: exit 3, at once.
    writeFileSync(join(stateRoot, LAB_MARKER), '{"instance":"lab","version":1}\n')
    const run = superviseWith(['--fall-limit', '3', '--backoff-base-ms', '50', ...serveArgs])
    expect(await run.exit).toBe(3)
    expect(run.stderr().match(/supervise: started serve/g)).toHaveLength(3)
    expect(run.stderr()).toContain(
      'supervise: serve left with 3, 3 times in a row before it settled; it is not started again',
    )
  })

  it('a wrong option of its own: usage, 2, serve is not started', async () => {
    const run = superviseWith(['--fall-limit', '0'])
    expect(await run.exit).toBe(2)
    expect(run.stderr()).toContain('supervise: --fall-limit must be a positive integer')
    expect(run.stderr()).not.toContain('started serve')
  })
})
