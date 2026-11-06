// @module-tag slow
// 慢：每个用例启动 dist/bin.js 子进程，并装载发行树、真实 SQLite 存储与宿主文件根。
// `serve` 子命令的进程级验收（DP1-C1、C2、C3、C19）：起 `dist/bin.js serve`，`--stop-on-stdin-close` 发起计划停止，
// 断言退出码与 stdout JSON 记录。先运行 `pnpm run build`。
import { execFile, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { rowIds } from '../src/s0/rows.ts'
import { freePort, operatorLayer, writeOperator } from './r9/support.ts'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const bin = join(memberDir, 'dist', 'bin.js')
const distributionPath = join(memberDir, 'config', 'serve.distribution.json')
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'serve-process-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

type Rec = { kind: string } & Record<string, unknown>
type Outcome = { code: number | null; stdout: string; stderr: string; records: Rec[] }

const parse = (stdout: string): Rec[] =>
  stdout
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as Rec)

function runBin(args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<Outcome> {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [bin, ...args],
      { env: { ...process.env, NO_COLOR: '1', ...env }, timeout: 60_000 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : null
        resolve({ code, stdout, stderr, records: parse(stdout) })
      },
    )
  })
}

/** 起 `serve`，看到 `startup-result` 后关闭 stdin，等进程退出。 */
function serveUntilStartup(args: readonly string[]): Promise<Outcome> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [bin, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let stopped = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!stopped && stdout.includes('"kind":"startup-result"')) {
        stopped = true
        child.stdin.end()
      }
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('close', code => resolve({ code, stdout, stderr, records: parse(stdout) }))
  })
}

/**
 * The operator file that the release tree needs: the storage root, the directory file and the port of
 * the entry. Each call makes a fresh state root, so two runs never share a database or a port.
 */
async function releaseRun(): Promise<{ stateRoot: string; args: string[] }> {
  const stateRoot = join(scratch, `state-${String(runCount++)}`)
  mkdirSync(stateRoot)
  const operatorPath = join(stateRoot, '..', `operator-${String(runCount)}.json`)
  writeOperator(
    operatorPath,
    operatorLayer({
      storageRoot: join(stateRoot, 'storage'),
      port: await freePort(),
      shutdownDeadlineMs: 2000,
    }),
  )
  return { stateRoot, args: ['--operator', operatorPath] }
}
let runCount = 0

const common = (stateRoot: string) => [
  '--distribution',
  distributionPath,
  '--readiness-timeout-ms',
  '15000',
  '--shutdown-deadline-ms',
  '2000',
  '--state-root',
  stateRoot,
]

describe('serve process', () => {
  it('loads the release tree, waits, stops when stdin closes, exit 0', async () => {
    const release = await releaseRun()
    const out = await serveUntilStartup([
      'serve',
      ...common(release.stateRoot),
      ...release.args,
      '--stop-on-stdin-close',
    ])
    expect(out.code).toBe(0)
    const of = (kind: string) => out.records.filter(r => r.kind === kind)
    expect(of('tree').map(r => r['id'])).toEqual(rowIds)
    expect(of('entry-object').length).toBeGreaterThan(0)
    expect(of('startup-result')[0]).toMatchObject({
      profile: 'real',
      scope: 'serving',
      accepting: true,
      outcome: 'ready',
      implementations: { real: 47, 'contract-double': 0, 's0-double': 2 },
    })
    expect(of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
    expect(out.stderr).toContain('serve: stop requested: stdin closed')
  })

  it('without --stop-on-stdin-close, keeps waiting for a stop request after startup', async () => {
    const release = await releaseRun()
    const child = spawn(
      process.execPath,
      [bin, 'serve', ...common(release.stateRoot), ...release.args],
      {
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    child.stdout.setEncoding('utf8')
    const exited = new Promise<number | null>(resolve => child.on('exit', code => resolve(code)))
    await new Promise<void>(resolve =>
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        if (stdout.includes('"kind":"startup-result"')) resolve()
      }),
    )
    const early = await Promise.race([
      exited,
      new Promise(resolve => setTimeout(() => resolve('alive'), 1500)),
    ])
    // Snapshot before the cleanup kill: on Linux SIGTERM is a graceful stop and rightly writes
    // a shutdown-result, which is not part of the "stdin closed does not stop it" window.
    const beforeKill = stdout
    try {
      expect(early).toBe('alive')
      expect(beforeKill).not.toContain('"kind":"shutdown-result"')
    } finally {
      child.kill()
      await exited
    }
  })

  it('missing --state-root on a host without setup: exit 2, the setup hint, nothing on stdout', async () => {
    // An empty server home stands for a host where `setup` never ran (and keeps a real setup out).
    const home = join(scratch, 'no-setup-home')
    const out = await runBin(['serve', ...common(scratch).slice(0, 6)], {
      OMNE_SERVER_HOME: home,
    })
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr).toBe(
      `serve: not set up: no state directory at ${join(home, 'state')}\nRun \`harness-server setup\` first.\n`,
    )
  })

  it.each([
    ['relative --state-root', ['serve', ...common('state')]],
    ['--state-root that is not a directory', ['serve', ...common(join(scratch, 'none'))]],
  ])('%s: exit 2, nothing on stdout', async (_name, args) => {
    const out = await runBin(args)
    expect(out.code).toBe(2)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('usage: serve')
  })

  it('an s0 invocation with serve-only options is still the s0 parse error', async () => {
    const out = await runBin(['s0', ...common(scratch)])
    expect(out.code).toBe(2)
    expect(out.stderr).toContain('s0: ')
    expect(out.stderr).toContain('usage: s0 ')
    expect(out.stderr).not.toContain('usage: serve')
  })
})
