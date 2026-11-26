// @module-tag slow
import { spawn, type ChildProcess } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  entryOfVersion,
  installVersion,
  readVersions,
  switchVersion,
} from '../src/local/install-root.ts'
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

/** An install root with nothing in it, and a way to put a version there: a package whose `bin` is the given module. */
function installRoot(): { root: string; install: (label: string, start: string) => string } {
  const root = join(scratch, `install-${String(count++)}`)
  mkdirSync(root)
  return {
    root,
    install(label, start) {
      const source = join(scratch, `source-${String(count++)}`)
      mkdirSync(source)
      const manifest = { version: label, bin: { 'harness-server': './start.mjs' } }
      writeFileSync(join(source, 'package.json'), JSON.stringify(manifest))
      writeFileSync(join(source, 'start.mjs'), start)
      return installVersion(root, source).version
    },
  }
}
const STARTS = `import ${JSON.stringify(pathToFileURL(bin).href)}\n`
const CANNOT_START = `process.stderr.write('this version cannot start\\n')\nprocess.exit(1)\n`
const VERSIONED = ['--fall-limit', '3', '--stable-ms', '200', '--backoff-base-ms', '50']

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

  it('a version that cannot start is switched to: after the limit the supervisor goes back to the last one that settled, serve is back, and it says which', async () => {
    const { serveArgs } = await stateRootWithOperator()
    const { root, install } = installRoot()
    const noted = join(scratch, `argv-${String(count++)}.json`)
    // Notes how it was started, then starts the real build: a static import would run before the note.
    const noting = `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(noted)}, JSON.stringify(process.argv.slice(2)))
await import(${JSON.stringify(pathToFileURL(bin).href)})
`
    const good = install('1.0.0', noting)
    const bad = install('2.0.0', CANNOT_START)
    switchVersion(root, good)
    const run = superviseWith(['--install-root', root, ...VERSIONED, ...serveArgs])
    const first = await run.started(1)
    await run.accepting(1)
    // The serve it starts is told where the pointer is, so that it checks it is the version named.
    const argv = JSON.parse(readFileSync(noted, 'utf8')) as string[]
    expect(argv.slice(-3)).toEqual(['--install-root', root, '--stop-on-stdin-close'])
    await expect
      .poll(() => readVersions(root).pointer, { timeout: 10_000 })
      .toEqual({ current: good, previous: good, settled: true })

    switchVersion(root, bad)
    // A planned stop of serve: the supervisor starts what the pointer names by then.
    process.kill(first, 'SIGTERM')
    const back = await run.started(5)
    await run.accepting(2)
    expect(run.stderr()).toContain(
      `supervise: version ${bad} left with 1, 3 times in a row before it settled; going back to version ${good}`,
    )
    expect(run.stderr().match(/this version cannot start/g)).toHaveLength(3)
    expect(run.stdout()).toContain(
      `${JSON.stringify({ kind: 'version-fallback', from: bad, to: good })}\n`,
    )
    expect(readVersions(root).pointer).toEqual({ current: good, previous: good, settled: true })
    expect(run.stderr()).toContain(`started serve, process ${String(back)}, version ${good}`)

    run.child.kill('SIGTERM')
    expect(await run.exit).toBe(0)
  })

  it('no earlier version to go back to: it stops and says so, and the pointer is as it was', async () => {
    const { serveArgs } = await stateRootWithOperator()
    const { root, install } = installRoot()
    const bad = install('2.0.0', CANNOT_START)
    switchVersion(root, bad)
    const run = superviseWith(['--install-root', root, ...VERSIONED, ...serveArgs])
    expect(await run.exit).toBe(1)
    expect(run.stderr().match(/supervise: started serve/g)).toHaveLength(3)
    expect(run.stderr()).toContain(
      `supervise: version ${bad} left with 1, 3 times in a row before it settled; there is no earlier version to go back to; it is not started again`,
    )
    expect(readVersions(root).pointer).toEqual({ current: bad, previous: null, settled: false })
  })

  it('an install root where nothing is switched to: usage, 2, serve is not started', async () => {
    const { root } = installRoot()
    const run = superviseWith(['--install-root', root])
    expect(await run.exit).toBe(2)
    expect(run.stderr()).toContain(`supervise: no version is switched to under ${root}`)
    expect(run.stderr()).not.toContain('started serve')
  })

  it('serve of a version the pointer does not name leaves with 2 before it takes the lock or reads the state', async () => {
    const { stateRoot, serveArgs } = await stateRootWithOperator()
    const { root, install } = installRoot()
    const named = install('1.0.0', STARTS)
    const other = install('1.0.1', `${STARTS}// another build\n`)
    switchVersion(root, named)
    const before = readdirSync(stateRoot, { recursive: true })
    const started = spawn(
      process.execPath,
      [entryOfVersion(root, other), 'serve', ...serveArgs, '--install-root', root],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    live.push(started)
    let err = ''
    started.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk))
    expect(await new Promise(resolve => started.on('exit', resolve))).toBe(2)
    expect(err).toContain(
      `serve: version-not-current: the pointer under ${root} names ${named}; this build is ${other}`,
    )
    expect(readdirSync(stateRoot, { recursive: true })).toEqual(before)
  })
})
