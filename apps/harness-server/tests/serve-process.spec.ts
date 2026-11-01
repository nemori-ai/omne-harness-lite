// @module-tag slow
// 慢：每个用例启动 dist/bin.js 子进程，并装载 49 行替身树。
// `serve` 子命令的进程级验收（DP1-C1、C2、C3、C19）：起 `dist/bin.js serve`，`--stop-on-stdin-close` 发起计划停止，
// 断言退出码与 stdout JSON 记录。先运行 `pnpm run build`。
import { execFile, spawn } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { rowIds } from '../src/s0/rows.ts'

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

function runBin(args: readonly string[]): Promise<Outcome> {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [bin, ...args],
      { env: { ...process.env, NO_COLOR: '1' }, timeout: 60_000 },
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

const common = (stateRoot: string) => [
  '--distribution',
  distributionPath,
  '--readiness-timeout-ms',
  '5000',
  '--shutdown-deadline-ms',
  '2000',
  '--state-root',
  stateRoot,
]

describe('serve process', () => {
  it('loads the release tree of doubles, waits, stops when stdin closes, exit 0', async () => {
    const out = await serveUntilStartup(['serve', ...common(scratch), '--stop-on-stdin-close'])
    expect(out.code).toBe(0)
    const of = (kind: string) => out.records.filter(r => r.kind === kind)
    expect(of('tree').map(r => r['id'])).toEqual(rowIds)
    expect(of('entry-object').length).toBeGreaterThan(0)
    expect(of('startup-result')[0]).toMatchObject({
      profile: 'real',
      scope: 'serving',
      accepting: true,
      outcome: 'ready',
      implementations: { real: 0, 'contract-double': 0, 's0-double': 49 },
    })
    expect(of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
    expect(out.stderr).toContain('serve: stop requested: stdin closed')
  })

  it.each([
    ['missing --state-root', ['serve', ...common(scratch).slice(0, 6)]],
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
