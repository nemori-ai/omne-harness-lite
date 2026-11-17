// @module-tag slow
import { randomInt } from 'node:crypto'
import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  realpathSync,
} from 'node:fs'
import { hostname, tmpdir, userInfo } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(new URL('../../../scripts/with-test-slot.sh', import.meta.url)),
)
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const PUBLICATION_HOOK = fileURLToPath(new URL('./fixtures/slot-publication.cjs', import.meta.url))

const WINDOWS = process.platform === 'win32'

const SIDE = `${process.platform}@${hostname()}${
  process.env['WSL_DISTRO_NAME'] ? `/${process.env['WSL_DISTRO_NAME']}` : ''
}`
const OTHER_SIDE = 'other@elsewhere'

function gitBash(): string {
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  return join(resolve(exec), '..', '..', '..', 'bin', 'bash.exe')
}

const SYSTEM_BASH = WINDOWS ? gitBash() : '/bin/bash'

const LAUNCH: readonly [string, ...string[]] = WINDOWS ? [SYSTEM_BASH, SCRIPT] : [SCRIPT]

function launch(args: readonly string[]): [string, string[]] {
  const [file, ...rest] = LAUNCH
  return [file, [...rest, ...args]]
}

function killTree(pid: number): void {
  if (WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {}
}

let dir: string
let groups: ChildProcess[] = []
const fallbackDirectories: string[] = []
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-slot-')))
})
afterEach(() => {
  for (const child of groups)
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null)
      killTree(child.pid)
  groups = []
  for (const path of fallbackDirectories.splice(0)) rmSync(path, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })
})

function slotEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleared: NodeJS.ProcessEnv = { ...process.env }
  delete cleared['OMNE_TEST_SLOT_HELD']
  return {
    ...cleared,
    OMNE_TEST_SLOT_CAPACITY: '1',
    OMNE_TEST_SLOT_DIR: join(dir, 'locks'),
    OMNE_TEST_SLOT_LEDGER: join(dir, 'ledger.jsonl'),
    ...env,
  }
}

function publicationEnv(actor: string, scenario = 'publication'): Record<string, string> {
  return {
    NODE_OPTIONS: `--require "${PUBLICATION_HOOK.replaceAll('\\', '/')}"`,
    SLOT_PUBLICATION_CONTROL: dir,
    SLOT_PUBLICATION_ACTOR: actor,
    SLOT_PUBLICATION_CASE: scenario,
    OMNE_TEST_SLOT_CAPACITY: '1',
  }
}

const PUBLICATION_COMMAND = `const fs = require('node:fs'), path = require('node:path');
const control = process.argv[1], actor = process.argv[2], sentinel = path.join(control, 'sentinel');
let owned = false;
try { fs.closeSync(fs.openSync(sentinel, 'wx')); owned = true }
catch (error) { fs.writeFileSync(path.join(control, actor + '.collision'), error.code) }
fs.writeFileSync(path.join(control, actor + '.started'), '');
if (actor === 'C') {
  const deadline = performance.now() + 10000;
  while (!fs.existsSync(path.join(control, 'C.release'))) {
    if (performance.now() > deadline) throw new Error('command release timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}
if (owned) fs.rmSync(sentinel);
fs.writeFileSync(path.join(control, actor + '.ended'), '');`

describe('登记发布与队列所有权', { timeout: 20_000 }, () => {
  it('队列锁条目与令牌条目尚未写完时不回收：等待者只在持有者结束后运行', async () => {
    const release = (name: string) => writeFileSync(join(dir, `${name}.continue`), '')
    const seen = (name: string) => existsSync(join(dir, name))
    const holder = queue(
      [process.execPath, '-e', PUBLICATION_COMMAND, dir, 'C'],
      publicationEnv('C'),
    )
    await waitFor(() => seen('C-owner-open.ready'), '持有者打开尚未写入的 owner')
    const waiter = queue(
      [process.execPath, '-e', PUBLICATION_COMMAND, dir, 'B'],
      publicationEnv('B'),
    )
    try {
      await waitFor(() => seen('B-owner-read.ready'), '等待者实际读取未发布的 owner')
      await waitFor(
        () => seen('B-queue-created.ready') || seen('B-owner-read-twice.ready'),
        '等待者完成对空 owner 的判定',
      )
      release('C-owner-open')
      await waitFor(() => seen('C-slot-open.ready'), '持有者打开尚未写入的 slot')
      release('B-queue-created')
      await waitFor(
        () => seen('B-slot-removed.ready') || seen('B-owner-after-slot.ready'),
        '等待者回收空 slot 或继续等待队列',
      )
      release('C-slot-open')
      await waitFor(() => seen('C.started'), '持有者的真实命令开始')
      release('B-slot-removed')
      await waiter.until('排队中')
      await waitFor(
        () => seen('B.started') || seen('B-held-slot-read.ready'),
        '持有者运行期间等待者实际尝试领取名额',
      )
      expect(seen('C.ended')).toBe(false)
      expect(
        seen('B.collision') ? readFileSync(join(dir, 'B.collision'), 'utf8') : undefined,
        '私有哨兵不得冲突',
      ).toBeUndefined()
      expect(seen('B.started'), '持有者未释放，等待者不得开始').toBe(false)
      expect(seen('B.collision')).toBe(false)
      writeFileSync(join(dir, 'C.release'), '')
      expect(await holder.exited, holder.stderr()).toBe(0)
      expect(await waiter.exited, waiter.stderr()).toBe(0)
      expect(seen('C.ended')).toBe(true)
      expect(seen('B.ended')).toBe(true)
      expect(seen('B.collision')).toBe(false)
      expect(ledger()).toHaveLength(2)
    } finally {
      for (const name of ['C-owner-open', 'C-slot-open', 'B-queue-created', 'B-slot-removed'])
        release(name)
      writeFileSync(join(dir, 'C.release'), '')
      await Promise.all([holder.exited, waiter.exited])
    }
  })

  it.each(['empty', 'invalid-pid', 'partial'])('不完整的令牌条目 %s 不代表进程已死', state => {
    const raw =
      state === 'empty' ? '' : state === 'invalid-pid' ? 'pid=' : `pid=${deadPid()}\nside=${SIDE}\n`
    const path = join(dir, 'locks', tokenEntryName(1, 1))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, raw)
    const result = slot([process.execPath, '-e', 'console.log("ran")'], {
      OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0',
    })
    expect(result.status, result.stderr).toBe(75)
    expect(result.stdout).toBe('')
    expect(readFileSync(path, 'utf8')).toBe(raw)
  })

  it.each(['empty', 'partial'])('不完整的队列锁条目 %s 不授予队列所有权', async state => {
    const raw = state === 'empty' ? '' : `version=2\npid=${deadPid()}\nside=${SIDE}\n`
    const entry = placeQueueLock(raw)
    const waiter = queue(
      [process.execPath, '-e', 'console.log("ran")'],
      publicationEnv('B', 'owner-observation'),
    )
    await waitFor(() => existsSync(join(dir, 'B-owner-read.ready')), '等待者读取队列锁条目')
    await new Promise(tick => setTimeout(tick, 250))
    const stolen = existsSync(join(dir, 'B-queue-acquisitions'))
    const before = existsSync(entry) ? readFileSync(entry, 'utf8') : undefined
    rmSync(dirname(entry), { recursive: true, force: true })
    expect(await waiter.exited, waiter.stderr()).toBe(0)
    expect(stolen).toBe(false)
    expect(before).toBe(raw)
    expect(waiter.stdout()).toBe('ran\n')
  })

  it.each(['owner-exists', 'owner-replaced'])(
    '队列锁目录里还有别人的条目（%s：建目录之后、或放好自己的条目之后出现）时不进入队列工作，障碍释放后重新取得队列',
    async scenario => {
      const started = join(dir, 'started')
      const waiter = queue(
        [process.execPath, '-e', 'require("node:fs").writeFileSync(process.argv[1], "")', started],
        publicationEnv('B', scenario),
      )
      await waitFor(() => existsSync(join(dir, 'owner-conflict.ready')), '注入真实 owner 冲突')
      await new Promise(tick => setTimeout(tick, 250))
      const ranBeforeRelease = existsSync(started)
      const createdTicket = tickets().length > 0
      rmSync(join(dir, 'locks', 'queue.lock'), { recursive: true, force: true })
      expect(await waiter.exited, waiter.stderr()).toBe(0)
      expect(ranBeforeRelease).toBe(false)
      expect(createdTicket).toBe(false)
      expect(existsSync(started)).toBe(true)
      expect(
        Number(readFileSync(join(dir, 'B-queue-acquisitions'), 'utf8')),
      ).toBeGreaterThanOrEqual(2)
    },
  )

  it('放条目之前队列锁目录丢失时必须重新独占取得队列', async () => {
    const result = slot(
      [
        process.execPath,
        '-e',
        'console.log(require("node:fs").readFileSync(process.argv[1], "utf8"))',
        join(dir, 'B-queue-acquisitions'),
      ],
      publicationEnv('B', 'owner-missing'),
    )
    expect(result.status, result.stderr).toBe(0)
    expect(existsSync(join(dir, 'owner-missing.ready'))).toBe(true)
    expect(Number(result.stdout)).toBeGreaterThanOrEqual(2)
    expect(ledger()).toHaveLength(1)
  })
})

interface LedgerLine {
  readonly event: 'ran' | 'gave-up'
  readonly command: string
  readonly issue: number | null
  readonly attempt: string | null
  readonly cwd: string
  readonly cores: number
  readonly capacity: number
  readonly want: number
  readonly min: number
  readonly tokens: number | null
  readonly aheadOnArrival: number
  readonly waitSeconds: number
  readonly heldSeconds: number | null
  readonly cpuSeconds: number | null
  readonly exitCode: number
  readonly arrivedAt: string
  readonly acquiredAt: string | null
  readonly acquiredMs: number | null
  readonly endedAt: string
  readonly endedMs: number
  readonly loadAtAcquire: readonly number[] | null
  readonly loadAtEnd: readonly number[]
}

function ledger(): LedgerLine[] {
  const path = join(dir, 'ledger.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as LedgerLine)
}

function slot(args: readonly string[], env: Record<string, string> = {}, cwd?: string) {
  return spawnSync(...launch(args), { encoding: 'utf8', env: slotEnv(env), cwd })
}

function gitEnv(cwd: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, GIT_CEILING_DIRECTORIES: dirname(cwd) }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete result[name]
  return result
}

function slotIn(cwd: string, args: readonly string[]) {
  return spawnSync(...launch(args), { encoding: 'utf8', env: gitEnv(cwd, slotEnv({})), cwd })
}

function repository(name: string, context: string): string {
  const root = join(dir, name)
  mkdirSync(root)
  const init = spawnSync('git', ['init', '-q', root], {
    encoding: 'utf8',
    env: gitEnv(root, process.env),
  })
  expect(init.status, init.stderr).toBe(0)
  writeFileSync(join(root, '.git', 'omne-integration-context.json'), context)
  return root
}

interface Queued {
  readonly child: ChildProcess
  readonly stdout: () => string
  readonly stderr: () => string
  readonly exited: Promise<number | null>
  readonly until: (text: string | RegExp) => Promise<void>
}

const UNTIL_LIMIT_MS = 20_000

const CLOCK_SOURCE = `import { existsSync, readFileSync } from 'node:fs'
const start = Number(process.env.SLOT_TEST_CLOCK_START)
const shift = process.env.SLOT_TEST_CLOCK_SHIFT
let reads = 0
Date.now = () => start + reads++ + (existsSync(shift) ? Number(readFileSync(shift, 'utf8')) : 0)
`

const CLOCK_SECOND = 1_700_000_000_000

function slotWithClock(args: readonly string[], startMs: number, env: Record<string, string> = {}) {
  return spawnSync(...launch(args), {
    encoding: 'utf8',
    timeout: 10_000,
    env: slotEnv({ ...clockEnv(startMs), ...env }),
  })
}

function clockEnv(startMs: number): Record<string, string> {
  const clock = join(dir, 'clock.mjs')
  writeFileSync(clock, CLOCK_SOURCE)
  return {
    TZ: 'UTC',
    NODE_OPTIONS: `--import ${pathToFileURL(clock).href}`,
    SLOT_TEST_CLOCK_START: String(startMs),
    SLOT_TEST_CLOCK_SHIFT: clockShift(),
  }
}

function clockShift(): string {
  return join(dir, 'clock.shift')
}

function preload(name: string, source: string): Record<string, string> {
  const path = join(dir, `${name}.mjs`)
  writeFileSync(path, source)
  return { NODE_OPTIONS: `--import ${pathToFileURL(path).href}` }
}

const INTEROP_SOURCE = `import cp from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, join } from 'node:path'
if (process.platform !== 'win32') process.getuid = () => Number(process.env.SLOT_TEST_UID)
const root = process.env.SLOT_TEST_INTEROP_ROOT
const mode = process.env.SLOT_TEST_INTEROP
const toLinux = windows => join(root, ...windows.replace(/^[A-Za-z]:\\\\/, '').split('\\\\'))
const reply = (status, stdout, stderr) => ({ status, stdout, stderr, pid: 0, signal: null, output: [null, stdout, stderr] })
const real = cp.spawnSync
cp.spawnSync = (file, args, options) => {
  // 真实 WSL 上 binfmt 没登记时脚本经 /init 起：那时程序在第一个参数里。
  const argv = Array.isArray(args) ? (file === '/init' ? args.slice(1) : args) : []
  const program = file === '/init' && Array.isArray(args) ? String(args[0]) : String(file)
  if (program === 'wslpath') {
    const linux = toLinux(String(argv[1]))
    // Windows 的系统目录在替身里也看得见：脚本先核对 powershell.exe 在不在
    if (/powershell\\.exe$/iu.test(linux)) {
      mkdirSync(dirname(linux), { recursive: true })
      writeFileSync(linux, '')
    }
    return reply(0, linux + '\\n', '')
  }
  if (/powershell\\.exe$/iu.test(program)) {
    if (mode === 'broken') return reply(1, '', 'interop 关着\\n')
    const windows = 'C:\\\\Temp\\\\omne-core-tokens-tester'
    if (mode === 'ok') {
      const linux = toLinux(windows)
      mkdirSync(linux, { recursive: true })
      // 命令里点名的探针是 .omne-probe-<进程号>；清旧探针那句的 .omne-probe-* 不算
      const probe = /\\.omne-probe-\\d+/u.exec(argv.join(' '))?.[0]
      writeFileSync(join(linux, probe), '')
    }
    return reply(0, windows + '\\r\\n', '')
  }
  return real(file, args, options)
}
syncBuiltinESMExports()
`

const LEDGER_GATE_SOURCE = `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const gated = process.env.SLOT_TEST_GATED_LEDGER
const gate = process.env.SLOT_TEST_LEDGER_GATE
const real = fs.appendFileSync
fs.appendFileSync = (path, ...rest) => {
  if (path === gated) {
    const deadline = Date.now() + 15_000
    while (!fs.existsSync(gate) && Date.now() < deadline)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
  return real(path, ...rest)
}
syncBuiltinESMExports()
`

async function waitFor(ready: () => boolean, what: string, limitMs = 10_000): Promise<void> {
  const deadline = Date.now() + limitMs
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`等了 ${limitMs} 毫秒没等到：${what}`)
    await new Promise(tick => setTimeout(tick, 50))
  }
}

function register(
  name: string,
  entry: {
    readonly pid: number
    readonly side?: string
    readonly beat?: number
    readonly age?: number
  },
): string {
  const path = join(dir, 'locks', name)
  mkdirSync(dirname(path), { recursive: true })
  const side = entry.side === undefined ? '' : `side=${entry.side}\n`
  writeFileSync(
    path,
    `pid=${entry.pid}\n${side}since=${Math.floor(Date.now() / 1000)}\ncwd=${dir}\ncmd=手写的登记\nbeat=${entry.beat ?? 5}\n`,
  )
  const at = new Date(Date.now() - (entry.age ?? 0) * 1000)
  utimesSync(path, at, at)
  return path
}

const entryName = (pid: number) => `owner-${pid}-0abc`

const tokenEntryName = (index: number, pid: number) => join(`core-${index}`, entryName(pid))

const tokenDir = (index: number) => join(dir, 'locks', `core-${index}`)

function tokenEntry(index: number): string {
  const names = readdirSync(tokenDir(index)).filter(name => name.startsWith('owner-'))
  expect(names, `core-${index} 里的条目`).toHaveLength(1)
  return join(tokenDir(index), names[0] ?? '')
}

function placeQueueLock(
  owner: string | { readonly pid: number; readonly side: string },
  age = 0,
): string {
  const lock = join(dir, 'locks', 'queue.lock')
  mkdirSync(lock, { recursive: true })
  const pid = typeof owner === 'string' ? 1 : owner.pid
  const entry = join(lock, entryName(pid))
  writeFileSync(
    entry,
    typeof owner === 'string'
      ? owner
      : `version=2\npid=${owner.pid}\nside=${owner.side}\nsince=${Math.floor(Date.now() / 1000)}\ncwd=${dir}\ncmd=手写的锁\nbeat=5\n`,
  )
  const at = new Date(Date.now() - age * 1000)
  utimesSync(entry, at, at)
  utimesSync(lock, at, at)
  return entry
}

function deadPid(): number {
  const exited = spawnSync(process.execPath, ['-e', '0'])
  return exited.pid
}

async function stall(path: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const old = new Date(Date.now() - 60_000)
    utimesSync(path, old, old)
    await new Promise(tick => setTimeout(tick, 250))
    if (Date.now() - statSync(path).mtimeMs > 30_000) return
  }
  throw new Error(`${path} 的修改时间一直被刷回来`)
}

const BASELINE = '1a80ccd93eab67930bafcb4c679db66957ff9614'
function legacyLaunch(): readonly [string, ...string[]] {
  const path = join(dir, 'legacy-with-test-slot.mjs')
  writeFileSync(
    path,
    execFileSync('git', ['show', `${BASELINE}:scripts/with-test-slot.mjs`], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: gitEnv(REPOSITORY_ROOT, process.env),
    }),
  )
  return [process.execPath, path]
}

function queue(
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  launcher: readonly [string, ...string[]] = LAUNCH,
): Queued {
  const [file, ...rest] = launcher
  const child = spawn(file, [...rest, ...args], {
    env: slotEnv({ OMNE_TEST_SLOT_POLL_SECONDS: '1', ...env }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !WINDOWS,
  })
  groups.push(child)
  let stdout = ''
  let stderr = ''
  let done = false
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
  const exited = new Promise<number | null>(settle =>
    child.once('exit', code => {
      done = true
      settle(code)
    }),
  )
  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    exited,
    until: async text => {
      const deadline = Date.now() + UNTIL_LIMIT_MS
      const seen = () => (typeof text === 'string' ? stderr.includes(text) : text.test(stderr))
      while (!seen()) {
        if (done) throw new Error(`进程已退出，没等到「${String(text)}」：\n${stderr}`)
        if (Date.now() > deadline)
          throw new Error(`等了 ${UNTIL_LIMIT_MS} 毫秒没等到「${String(text)}」：\n${stderr}`)
        await new Promise(tick => setTimeout(tick, 50))
      }
    },
  }
}

function blocker(
  name: string,
  env: Record<string, string> = {},
  launcher: readonly [string, ...string[]] = LAUNCH,
) {
  const ready = join(dir, `${name}.ready`)
  const release = join(dir, `${name}.release`)
  const queued = queue(
    [
      'env',
      `SLOT_TEST=${name}`,
      'bash',
      '-c',
      `touch "${ready}"; until [ -e "${release}" ]; do sleep 0.1; done`,
    ],
    env,
    launcher,
  )
  return {
    queued,
    started: async () => {
      while (!existsSync(ready)) await new Promise(tick => setTimeout(tick, 50))
    },
    release: async () => {
      writeFileSync(release, '')
      await queued.exited
    },
  }
}

async function hold(): Promise<{ release: () => Promise<void> }> {
  const holder = blocker('holder')
  await holder.started()
  return holder
}

function appendOrder(name: string, env: Record<string, string> = {}): Queued {
  return queue(['bash', '-c', `echo ${name} >> "${join(dir, 'order')}"`], env)
}

function order(): string[] {
  return readFileSync(join(dir, 'order'), 'utf8').trim().split('\n')
}

function tickets(): string[] {
  return readdirSync(join(dir, 'locks')).filter(name => name.startsWith('ticket-'))
}

describe('with-test-slot.sh', { timeout: 30_000 }, () => {
  it.runIf(WINDOWS)(
    'Windows 没有 USERNAME 时仍按 OS 用户名共用旧 TEMP 名额：哨兵不重叠，账本恰好两条 ran',
    async () => {
      const temp = join(dir, 'windows-temp')
      mkdirSync(temp)
      const strict = preload(
        'strict-environment',
        'for (const key of Object.keys(process.env)) if (key.toUpperCase() === "USERNAME") delete process.env[key]\n',
      )
      const sentinel = `const fs = require('node:fs');
if (process.env.USERNAME !== undefined) throw new Error('USERNAME must be absent');
const started = Date.now();
fs.writeFileSync(process.argv[1], process.env.OMNE_TEST_SLOT_HELD);
const timer = setInterval(() => {
  if (fs.existsSync(process.argv[2])) {
    clearInterval(timer);
    fs.writeFileSync(process.argv[3], started + ' ' + Date.now());
  } else if (Date.now() - started > 10_000) process.exit(90);
}, 20);`
      const start = (name: string) => {
        return queue(
          [
            process.execPath,
            '-e',
            sentinel,
            join(dir, `${name}.started`),
            join(dir, 'release'),
            join(dir, `${name}.interval`),
          ],
          {
            ...strict,
            USERNAME: undefined,
            TEMP: temp,
            TMP: temp,
            OMNE_TEST_SLOT_DIR: '',
            WSL_DISTRO_NAME: '',
            OMNE_TEST_SLOT_CAPACITY: '1',
            OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '15',
          },
          [process.execPath, SCRIPT.replace(/\.sh$/u, '.mjs')],
        )
      }
      const first = start('first')
      await waitFor(
        () => existsSync(join(dir, 'first.started')) || first.child.exitCode !== null,
        '第一个哨兵开始',
      )
      expect(first.child.exitCode, first.stderr()).toBeNull()
      const second = start('second')
      try {
        await waitFor(
          () => second.stderr().includes('排队中') || existsSync(join(dir, 'second.started')),
          '第二个哨兵排队或错误地开始',
        )
        expect(existsSync(join(dir, 'second.started')), '第一个哨兵仍在运行，第二个不能开始').toBe(
          false,
        )
        expect(second.stderr()).toContain('排队中')
      } finally {
        writeFileSync(join(dir, 'release'), '')
        expect(await Promise.all([first.exited, second.exited])).toEqual([0, 0])
      }
      expect(readFileSync(join(dir, 'second.started'), 'utf8')).toBe(
        readFileSync(join(dir, 'first.started'), 'utf8'),
      )
      expect(readFileSync(join(dir, 'first.started'), 'utf8')).toBe(
        join(temp, `omne-core-tokens-${userInfo().username}`, 'core-1'),
      )
      const [, firstEnd] = readFileSync(join(dir, 'first.interval'), 'utf8').split(' ').map(Number)
      const [secondStart] = readFileSync(join(dir, 'second.interval'), 'utf8')
        .split(' ')
        .map(Number)
      expect(secondStart).toBeGreaterThanOrEqual(firstEnd ?? Number.NaN)
      expect(ledger()).toHaveLength(2)
      expect(ledger()).toMatchObject([
        { event: 'ran', exitCode: 0 },
        { event: 'ran', exitCode: 0 },
      ])
    },
  )

  it('有空名额：执行命令并透传退出码与输出', () => {
    const result = slot(['bash', '-c', 'echo 跑了; exit 7'])
    expect(result.stdout).toBe('跑了\n')
    expect(result.status).toBe(7)
  })

  it('系统 bash 没有 EPOCHSECONDS 时仍执行命令', () => {
    const result = spawnSync(SYSTEM_BASH, [SCRIPT, 'bash', '-c', 'echo ok'], {
      encoding: 'utf8',
      env: slotEnv({}),
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('ok\n')
    expect(result.stderr).not.toContain('EPOCHSECONDS')
  })

  it('命令能看到自己持有名额，嵌套调用直接放行', () => {
    const result = slot([...LAUNCH, 'bash', '-c', 'echo "$OMNE_TEST_SLOT_HELD"'])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(tokenDir(1))
    expect(result.stderr).toBe('')
    expect(ledger().map(line => line.command)).toEqual([
      `${LAUNCH.join(' ')} bash -c echo "$OMNE_TEST_SLOT_HELD"`,
    ])
  })

  it('运行账本：用完名额记一行，命令原样转义，CPU 时间算的是命令自己用掉的', () => {
    const args = [
      'node',
      '-e',
      'while (process.cpuUsage().user < 600000) {} process.exit(3)',
      'a"b\\c\tz',
    ]
    const clock = join(dir, 'ledger-clock.mjs')
    writeFileSync(clock, `Date.now = () => ${Date.now()}\n`)
    const result = slot(args, {
      NODE_OPTIONS: [process.env['NODE_OPTIONS'], `--import=${pathToFileURL(clock).href}`]
        .filter(Boolean)
        .join(' '),
    })
    expect(result.status).toBe(3)
    expect(result.stderr).not.toContain('排队中')
    const [line, ...rest] = ledger()
    expect(rest).toEqual([])
    expect(line).toMatchObject({
      event: 'ran',
      command: args.join(' '),
      cwd: process.cwd(),
      capacity: 1,
      want: 1,
      min: 1,
      tokens: 1,
      aheadOnArrival: 0,
      waitSeconds: 0,
      exitCode: 3,
    })
    if (WINDOWS) expect(line?.cpuSeconds).toBeNull()
    else expect(line?.cpuSeconds).toBeGreaterThanOrEqual(0.6)
    expect(line?.heldSeconds).toBeGreaterThanOrEqual(0)
    expect(line?.cores).toBeGreaterThanOrEqual(1)
    for (const at of [line?.arrivedAt, line?.acquiredAt, line?.endedAt]) {
      expect(at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/)
      expect(Number.isNaN(Date.parse(at ?? ''))).toBe(false)
    }
    for (const load of [line?.loadAtAcquire, line?.loadAtEnd]) {
      expect(load).toHaveLength(3)
      expect(load?.every(value => typeof value === 'number' && value >= 0)).toBe(true)
    }
  })

  it('运行账本：进队与拿到名额之间跨过整秒边界、只过了几毫秒，waitSeconds 记 0', () => {
    const result = slotWithClock(['bash', '-c', 'exit 0'], CLOCK_SECOND + 999)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).not.toContain('排队中')
    expect(ledger()).toEqual([
      expect.objectContaining({
        event: 'ran',
        arrivedAt: '2023-11-14T22:13:20+00:00',
        acquiredAt: '2023-11-14T22:13:21+00:00',
        endedAt: '2023-11-14T22:13:21+00:00',
        waitSeconds: 0,
        heldSeconds: 0,
      }),
    ])
  })

  it('运行账本：命令占用约 1.6 秒、跨过两个整秒边界，heldSeconds 记 1，时刻截到秒', () => {
    const result = slotWithClock(
      ['bash', '-c', `printf 1600 > "${clockShift()}"`],
      CLOCK_SECOND + 900,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(ledger()).toEqual([
      expect.objectContaining({
        event: 'ran',
        arrivedAt: '2023-11-14T22:13:20+00:00',
        acquiredAt: '2023-11-14T22:13:20+00:00',
        endedAt: '2023-11-14T22:13:22+00:00',
        waitSeconds: 0,
        heldSeconds: 1,
      }),
    ])
    const [line] = ledger()
    const acquired = line?.acquiredMs ?? 0
    const ended = line?.endedMs ?? 0
    expect(Math.floor(acquired / 1000)).toBe(CLOCK_SECOND / 1000)
    expect(acquired).toBeGreaterThanOrEqual(CLOCK_SECOND + 900)
    expect(Math.floor(ended / 1000)).toBe(CLOCK_SECOND / 1000 + 2)
    expect(ended - acquired).toBeGreaterThanOrEqual(1600)
  })

  it('运行账本：工作树有 task context 时记下最后一项任务的卡号与 attempt', () => {
    const task = (number: number, attempt: string) => ({
      binding: { issue: { number }, attempt },
      taskSource: 'b'.repeat(40),
    })
    const root = repository(
      'bound',
      JSON.stringify({ schemaVersion: 1, tasks: [task(700, '700-r1-a1'), task(794, '794-r2-a1')] }),
    )
    const result = slotIn(root, ['bash', '-c', 'exit 4'])
    expect(result.status).toBe(4)
    expect(result.stderr).toBe('')
    expect(ledger()).toMatchObject([{ event: 'ran', cwd: root, issue: 794, attempt: '794-r2-a1' }])
  })

  it('运行账本：不是 git 仓库或 context 不合格时卡号与 attempt 为 null，不提醒，退出码照旧', () => {
    const plain = join(dir, 'plain')
    mkdirSync(plain)
    const broken = repository('broken', '{ not json')
    const untyped = repository('untyped', JSON.stringify({ tasks: [{ binding: { issue: {} } }] }))
    const zero = repository(
      'zero',
      JSON.stringify({ tasks: [{ binding: { issue: { number: 0 }, attempt: '0-r1-a1' } }] }),
    )
    for (const cwd of [plain, broken, untyped, zero]) {
      const result = slotIn(cwd, ['bash', '-c', 'exit 5'])
      expect(result.status).toBe(5)
      expect(result.stderr).toBe('')
    }
    expect(ledger().map(line => [line.cwd, line.issue, line.attempt])).toEqual([
      [plain, null, null],
      [broken, null, null],
      [untyped, null, null],
      [zero, null, null],
    ])
  })

  it('运行账本写不进去：只提醒，不改命令的退出码', () => {
    writeFileSync(join(dir, 'file'), '')
    const result = slot(['bash', '-c', 'exit 7'], {
      OMNE_TEST_SLOT_LEDGER: join(dir, 'file', 'ledger.jsonl'),
    })
    expect(result.status).toBe(7)
    expect(result.stderr).toContain('运行账本写不进')
  })

  it('名额占满且有人排队：已持有名额的嵌套调用照旧直接放行', async () => {
    const holder = await hold()
    const waiter = appendOrder('等着的')
    try {
      await waiter.until('排队中')
      const result = slot(['bash', '-c', 'echo 嵌套'], {
        OMNE_TEST_SLOT_HELD: tokenDir(1),
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe('嵌套\n')
      expect(result.stderr).toBe('')
      expect(ledger()).toEqual([])
    } finally {
      await holder.release()
      await waiter.exited
    }
  })

  it('名额占满：超过最长等待即以 75 退出，命令没有执行，票也收回，账本记下放弃', async () => {
    const holder = await hold()
    try {
      const marker = join(dir, 'ran')
      const result = slot(['touch', marker], {
        OMNE_TEST_SLOT_POLL_SECONDS: '1',
        OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '1',
      })
      expect(result.status).toBe(75)
      expect(result.stderr).toContain('排队中')
      expect(result.stderr).toContain('命令没有执行')
      expect(existsSync(marker)).toBe(false)
      expect(tickets()).toEqual([])
      const [line, ...rest] = ledger()
      expect(rest).toEqual([])
      expect(line).toMatchObject({
        event: 'gave-up',
        command: `touch ${marker}`,
        aheadOnArrival: 0,
        tokens: null,
        acquiredAt: null,
        acquiredMs: null,
        heldSeconds: null,
        cpuSeconds: null,
        loadAtAcquire: null,
        exitCode: 75,
      })
      expect(line?.waitSeconds).toBeGreaterThanOrEqual(1)
    } finally {
      await holder.release()
    }
  })

  it('名额占满、最长等待为 0：头一次没轮到就放弃，不报排队，跨整秒边界的几毫秒记 0 秒', async () => {
    const holder = await hold()
    try {
      const marker = join(dir, 'ran')
      const result = slotWithClock(['touch', marker], CLOCK_SECOND + 999, {
        OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0',
      })
      expect(result.status, result.stderr).toBe(75)
      expect(result.stderr).toContain('命令没有执行')
      expect(result.stderr).not.toContain('排队中')
      expect(existsSync(marker)).toBe(false)
      expect(tickets()).toEqual([])
      expect(ledger()).toEqual([
        expect.objectContaining({
          event: 'gave-up',
          arrivedAt: '2023-11-14T22:13:20+00:00',
          endedAt: '2023-11-14T22:13:21+00:00',
          waitSeconds: 0,
          exitCode: 75,
        }),
      ])
    } finally {
      await holder.release()
    }
  })

  it('名额占满：前一个放手后，排队的那个拿到名额并执行', async () => {
    const holder = await hold()
    const waiter = queue(['bash', '-c', 'echo 轮到了'])
    await waiter.until('排队中')
    expect(waiter.stdout()).toBe('')
    await holder.release()
    expect(await waiter.exited).toBe(0)
    expect(waiter.stdout()).toBe('轮到了\n')
    expect(waiter.stderr()).toContain('拿到 1 个令牌（共 1 个）')
    expect(ledger().find(line => line.command === 'bash -c echo 轮到了')?.heldSeconds).toBe(0)
  })

  it('名额占满：排队约 0.6 秒后拿到名额，waitSeconds 截到整秒记 0', async () => {
    const holder = await hold()
    const waiter = queue(['true'], clockEnv(CLOCK_SECOND))
    await waiter.until('排队中')
    writeFileSync(clockShift(), '600')
    await holder.release()
    expect(await waiter.exited).toBe(0)
    expect(ledger().find(line => line.command === 'true')).toMatchObject({
      event: 'ran',
      arrivedAt: '2023-11-14T22:13:20+00:00',
      waitSeconds: 0,
    })
  })

  it('先来后到：按进队顺序拿到名额，与谁看得勤无关', async () => {
    const holder = await hold()
    const first = appendOrder('A', { OMNE_TEST_SLOT_POLL_SECONDS: '2' })
    await first.until('排队中')
    const second = appendOrder('B')
    await second.until('排队中')
    const third = appendOrder('C')
    await third.until('排队中')
    await holder.release()
    expect(await Promise.all([first.exited, second.exited, third.exited])).toEqual([0, 0, 0])
    expect(order()).toEqual(['A', 'B', 'C'])
    const name = (command: string) =>
      /SLOT_TEST=(\w+)|echo (\w+) >>/.exec(command)?.slice(1).find(Boolean)
    expect(ledger().map(line => [name(line.command), line.aheadOnArrival])).toEqual([
      ['holder', 0],
      ['A', 0],
      ['B', 1],
      ['C', 2],
    ])
  })

  it('排在中间的被杀掉：它的票作废，后来者照常轮到', async () => {
    const holder = await hold()
    const first = appendOrder('A')
    await first.until('排队中')
    const second = appendOrder('B')
    await second.until('排队中')
    const third = appendOrder('C')
    await third.until('前面还有 2 个')
    if (second.child.pid !== undefined) killTree(second.child.pid)
    await second.exited
    await third.until('前面还有 1 个')
    await holder.release()
    expect(await Promise.all([first.exited, third.exited])).toEqual([0, 0])
    expect(order()).toEqual(['A', 'C'])
    expect(tickets()).toEqual([])
  })

  it('排队时报出前面还有几个、谁占着名额、占了多久，位置变了再报', async () => {
    const heldBy = (name: string) =>
      new RegExp(`1 个令牌正由「env SLOT_TEST=${name} [^」]*」占着，已 \\d+ 秒`, 'u')
    const holder = await hold()
    const first = blocker('first')
    await first.queued.until('排队中')
    // 占用者行在位置行之后另行写出：等它到了再断言。
    await first.queued.until(heldBy('holder'))
    const second = queue(['true'])
    await second.until('排队中')
    expect(first.queued.stderr()).toContain('前面还有 0 个')
    expect(first.queued.stderr()).toMatch(heldBy('holder'))
    expect(second.stderr()).toContain('前面还有 1 个')
    await holder.release()
    await first.started()
    await second.until('前面还有 0 个')
    await second.until(heldBy('first'))
    expect(second.stderr()).toMatch(heldBy('first'))
    await first.release()
    expect(await second.exited).toBe(0)
  })

  it('两个令牌：一个被占时另一个仍可用，不排队；拿到的个数经 OMNE_WORKER_BUDGET 交给命令', async () => {
    const holder = await hold()
    try {
      const result = slot(['bash', '-c', 'echo "$OMNE_TEST_SLOT_HELD $OMNE_WORKER_BUDGET"'], {
        OMNE_TEST_SLOT_CAPACITY: '2',
      })
      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe(`${tokenDir(2)} 1`)
      expect(result.stderr).toBe('')
    } finally {
      await holder.release()
    }
  })

  it('没给命令、策略值不是整数、--want 与 --min 不是正整数或 min 大于 want：以 2 退出，命令不执行', () => {
    expect(slot([]).status).toBe(2)
    expect(slot(['--want', '2']).status).toBe(2)
    expect(slot(['true'], { OMNE_TEST_SLOT_CAPACITY: '两个' }).status).toBe(2)
    expect(slot(['true'], { OMNE_TEST_SLOT_CAPACITY: '0' }).status).toBe(2)
    expect(slot(['--want', '0', 'true']).status).toBe(2)
    expect(slot(['--min', 'x', 'true']).status).toBe(2)
    const inverted = slot(['--want', '1', '--min', '2', '--', 'true'])
    expect(inverted.status).toBe(2)
    expect(inverted.stderr).toContain('--min 2 大于 --want 1')
  })

  it('登记带 side 行：平台@主机名，给了 WSL_DISTRO_NAME 再加发行版名；排队提示里报出持有者的侧', async () => {
    const holder = await hold()
    expect(readFileSync(tokenEntry(1), 'utf8')).toContain(`\nside=${SIDE}\n`)
    const waiter = queue(['true'], { WSL_DISTRO_NAME: 'Fedora' })
    await waiter.until(`，${SIDE}）`)
    const [ticket] = tickets()
    expect(readFileSync(join(dir, 'locks', ticket ?? ''), 'utf8')).toContain(
      `\nside=${process.platform}@${hostname()}/Fedora\n`,
    )
    await holder.release()
    expect(await waiter.exited).toBe(0)
  })

  it('对侧的登记：心跳新鲜时排队不删（名额与票都算数），心跳停过阈值才回收并拿到', () => {
    const otherPid = deadPid()
    const held = register(tokenEntryName(1, otherPid), { pid: otherPid, side: OTHER_SIDE, beat: 5 })
    const before = readFileSync(held, 'utf8')
    const refused = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(refused.status, refused.stderr).toBe(75)
    expect(refused.stdout).toBe('')
    expect(readFileSync(held, 'utf8')).toBe(before)
    const ticket = register('ticket-7', { pid: deadPid(), side: OTHER_SIDE, beat: 1 })
    const behind = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(behind.status).toBe(75)
    expect(behind.stderr).toContain('前面还有 1 个')
    expect(existsSync(ticket)).toBe(true)
    for (const path of [held, ticket]) {
      const old = new Date(Date.now() - 30_000)
      utimesSync(path, old, old)
    }
    const ran = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toBe('跑了\n')
    expect(ran.stderr).toBe('')
    expect(existsSync(ticket)).toBe(false)
  })

  it('同侧的登记：进程不在了立刻回收（没有 side 行的旧版登记同样）；进程在而心跳停了，过了阈值加一次轮询内回收', async () => {
    const samePid = deadPid()
    register(tokenEntryName(1, samePid), { pid: samePid, side: SIDE, beat: 5 })
    const immediate = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(immediate.status, immediate.stderr).toBe(0)
    expect(immediate.stderr).toBe('')
    const noSidePid = deadPid()
    register(tokenEntryName(1, noSidePid), { pid: noSidePid, beat: 5 })
    const legacy = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(legacy.status, legacy.stderr).toBe(0)
    expect(legacy.stdout).toBe('跑了\n')
    register(tokenEntryName(1, process.pid), { pid: process.pid, side: SIDE, beat: 1, age: 5 })
    const waiter = queue(['bash', '-c', 'echo 轮到了'], clockEnv(Date.now()))
    await waiter.until('排队中')
    writeFileSync(clockShift(), '4000')
    expect(await waiter.exited).toBe(0)
    expect(waiter.stdout()).toBe('轮到了\n')
    const waited = Number(/等了 (\d+) 秒，拿到 \d+ 个令牌/u.exec(waiter.stderr())?.[1])
    expect(waited).toBe(4)
  })

  it('票号单调：票被回收后新号比它大；先到者发现票没了就提示并重新排队，最终拿到名额', async () => {
    const holder = await hold()
    const first = appendOrder('A', { OMNE_TEST_SLOT_POLL_SECONDS: '3' })
    await first.until('排队中')
    expect(tickets()).toEqual(['ticket-1'])
    await stall(join(dir, 'locks', 'ticket-1'))
    const second = appendOrder('B')
    await second.until('排队中')
    expect(tickets()).toEqual(['ticket-2'])
    await first.until('票被回收，重新排队（前面还有 1 个）')
    expect(tickets().sort()).toEqual(['ticket-2', 'ticket-3'])
    await holder.release()
    expect(await Promise.all([first.exited, second.exited])).toEqual([0, 0])
    expect(order()).toEqual(['B', 'A'])
    expect(tickets()).toEqual([])
  })

  it('旧版运行名额脚本与令牌池互不排斥（过渡期的已知限制）：一边持有时另一边照常拿到，同一个锁目录里也不互删', async () => {
    const legacy = legacyLaunch()
    const legacyEnv = WINDOWS
      ? {
          PATH: `${resolve(dirname(SYSTEM_BASH), '..', 'usr', 'bin')};${process.env['PATH'] ?? ''}`,
        }
      : {}
    const legacyHolder = blocker('legacy', legacyEnv, legacy)
    await legacyHolder.started()
    const legacySlot = join(dir, 'locks', 'slot-1.lock')
    expect(readFileSync(legacySlot, 'utf8')).not.toContain('side=')
    const waiter = appendOrder('new')
    expect(await waiter.exited).toBe(0)
    expect(waiter.stderr()).not.toContain('排队中')
    expect(order()).toEqual(['new'])
    expect(existsSync(legacySlot)).toBe(true)
    await legacyHolder.release()
    expect(await legacyHolder.queued.exited).toBe(0)
    const holder = await hold()
    const legacyWaiter = queue(
      ['bash', '-c', `echo legacy >> "${join(dir, 'order')}"`],
      legacyEnv,
      legacy,
    )
    expect(await legacyWaiter.exited).toBe(0)
    expect(order()).toEqual(['new', 'legacy'])
    expect(tokenEntry(1)).toContain('owner-')
    await holder.release()
  })

  describe('WSL 里的默认目录', () => {
    function resolveDefault(mode: 'ok' | 'unshared' | 'broken') {
      const root = join(dir, 'windows')
      const uid = randomInt(0x4000_0000, 0x7fff_ffff)
      const fallback = WINDOWS
        ? join(dir, `omne-core-tokens-${userInfo().username}`)
        : `/tmp/omne-core-tokens-${uid}`
      if (!WINDOWS) {
        mkdirSync(fallback)
        fallbackDirectories.push(fallback)
      }
      const env = slotEnv({
        ...preload('interop', INTEROP_SOURCE),
        WSL_DISTRO_NAME: 'Fake',
        SLOT_TEST_INTEROP: mode,
        SLOT_TEST_UID: String(uid),
        SLOT_TEST_INTEROP_ROOT: root,
        TEMP: dir,
        TMP: dir,
      })
      delete env['OMNE_TEST_SLOT_DIR']
      delete env['USERNAME']
      const result = spawnSync(
        ...launch([
          process.execPath,
          '-e',
          'process.stdout.write(process.env.OMNE_TEST_SLOT_HELD)',
        ]),
        { encoding: 'utf8', env, timeout: 20_000 },
      )
      return { ...result, root, fallback }
    }

    it('有 interop：解析到 Windows 临时目录下的同一个目录，探针用完即删，不提示', () => {
      const result = resolveDefault('ok')
      const shared = join(result.root, 'Temp', 'omne-core-tokens-tester')
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(join(shared, 'core-1'))
      expect(result.stderr).toBe('')
      expect(readdirSync(shared).filter(name => name.startsWith('.omne-probe-'))).toEqual([])
    })

    it('interop 起不来：回退到本侧目录，并在标准错误提示没有共用名额', () => {
      const result = resolveDefault('broken')
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(join(result.fallback, 'core-1'))
      expect(result.stderr).toContain('WSL 与 Windows 没有共用令牌池')
      expect(result.stderr).toContain(result.fallback)
    })

    it('解析出了路径，但 Windows 建的文件在那里看不见：同目录判定不成立，回退并提示', () => {
      const result = resolveDefault('unshared')
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(join(result.fallback, 'core-1'))
      expect(result.stderr).toContain('WSL 与 Windows 没有共用令牌池')
      expect(result.stderr).toContain('看不见')
    })
  })

  it('对侧的队列锁：条目年龄不到 30 秒不删、等着；过了 30 秒才删。同侧进程不在了立刻删', async () => {
    const entry = placeQueueLock({ pid: deadPid(), side: OTHER_SIDE })
    const waiter = appendOrder('A')
    await new Promise(tick => setTimeout(tick, 2000))
    expect(existsSync(join(dir, 'order'))).toBe(false)
    expect(readFileSync(entry, 'utf8')).toContain(`side=${OTHER_SIDE}`)
    rmSync(dirname(entry), { recursive: true, force: true })
    expect(await waiter.exited).toBe(0)
    expect(order()).toEqual(['A'])
    placeQueueLock({ pid: deadPid(), side: OTHER_SIDE }, 40)
    const aged = slot(['bash', '-c', 'echo 过期'])
    expect(aged.status, aged.stderr).toBe(0)
    expect(aged.stdout).toBe('过期\n')
    placeQueueLock({ pid: deadPid(), side: SIDE })
    const same = slot(['bash', '-c', 'echo 同侧'])
    expect(same.status, same.stderr).toBe(0)
    expect(same.stdout).toBe('同侧\n')
  })

  it('结束时只删自己的队列锁条目：自己的条目已被当作失效删掉、别人放了条目时，不动别人的条目与目录', async () => {
    const gate = join(dir, 'ledger.gate')
    const proceed = join(dir, 'command.proceed')
    const holder = queue(['bash', '-c', `until [ -e "${proceed}" ]; do sleep 0.1; done`], {
      ...preload('ledger-gate', LEDGER_GATE_SOURCE),
      SLOT_TEST_GATED_LEDGER: join(dir, 'ledger.jsonl'),
      SLOT_TEST_LEDGER_GATE: gate,
    })
    const lock = join(dir, 'locks', 'queue.lock')
    const ownEntries = () =>
      existsSync(lock) ? readdirSync(lock).filter(name => name.startsWith('owner-')) : []
    await waitFor(() => existsSync(tokenDir(1)), '拿到令牌')
    writeFileSync(proceed, '')
    await waitFor(() => !existsSync(tokenDir(1)) && ownEntries().length === 1, '收尾时持有队列锁')
    const own = join(lock, ownEntries()[0] ?? '')
    expect(readFileSync(own, 'utf8')).toContain(`side=${SIDE}`)
    rmSync(own)
    const foreign = placeQueueLock({ pid: deadPid(), side: OTHER_SIDE })
    const foreignText = readFileSync(foreign, 'utf8')
    writeFileSync(gate, '')
    expect(await holder.exited).toBe(0)
    expect(readFileSync(foreign, 'utf8')).toBe(foreignText)
    expect(ownEntries()).toEqual([basename(foreign)])
    expect(ledger()).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('两个等待者同时判队列锁的持有者已死：只删那个确切的条目，谁也删不掉别人的活锁', async () => {
    placeQueueLock({ pid: deadPid(), side: SIDE })
    const runs = ['A', 'B', 'C'].map(actor =>
      queue([process.execPath, '-e', PUBLICATION_COMMAND, dir, actor], {
        OMNE_TEST_SLOT_POLL_SECONDS: '1',
      }),
    )
    writeFileSync(join(dir, 'C.release'), '')
    expect(await Promise.all(runs.map(run => run.exited))).toEqual([0, 0, 0])
    for (const actor of ['A', 'B', 'C']) {
      expect(existsSync(join(dir, `${actor}.collision`)), `${actor} 撞上了别人的哨兵`).toBe(false)
      expect(existsSync(join(dir, `${actor}.ended`))).toBe(true)
    }
    expect(ledger()).toHaveLength(3)
  })

  it('判死之后锁已被别人回收、重新拿到：回收只删判死的那个条目，删不掉别人的活锁（模型 finding-lock-steal-c2 的那一步）', async () => {
    const dead = placeQueueLock({ pid: deadPid(), side: SIDE })
    const waiter = queue(['bash', '-c', 'echo ran'], publicationEnv('B', 'reap-pause'))
    try {
      await waitFor(() => existsSync(join(dir, 'B-judged.ready')), '等待者读到已死的条目、还没删')
      rmSync(dead)
      rmSync(dirname(dead), { recursive: true })
      const live = placeQueueLock({ pid: process.pid, side: SIDE })
      writeFileSync(join(dir, 'B-judged.continue'), '')
      await new Promise(tick => setTimeout(tick, 500))
      expect(existsSync(live), '活锁的条目被等待者删掉了').toBe(true)
      expect(waiter.stdout()).toBe('')
      rmSync(dirname(live), { recursive: true })
      expect(await waiter.exited, waiter.stderr()).toBe(0)
      expect(waiter.stdout()).toBe('ran\n')
    } finally {
      writeFileSync(join(dir, 'B-judged.continue'), '')
    }
  })

  it('持有者发现令牌条目被删：标准错误报一句，命令照常跑完', async () => {
    const holder = blocker('holder')
    await holder.started()
    rmSync(tokenEntry(1))
    await holder.queued.until('令牌文件被删')
    await holder.release()
    expect(await holder.queued.exited).toBe(0)
    expect(ledger()).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('读者时钟超前 25 秒、持有者在对侧：会误删活着的持有者并拿到名额，持有者报名额文件被删（已知限制）', async () => {
    const holder = blocker('holder', { WSL_DISTRO_NAME: 'elsewhere' })
    await holder.started()
    const reader = queue(['bash', '-c', 'echo 抢到了; sleep 8'], clockEnv(Date.now() + 25_000))
    await waitFor(() => reader.stdout().includes('抢到了'), '读者拿到名额')
    expect(reader.stderr()).not.toContain('排队中')
    await holder.queued.until('令牌文件被删')
    expect(reader.child.exitCode).toBeNull()
    expect(await reader.exited).toBe(0)
    await holder.release()
    expect(await holder.queued.exited).toBe(0)
  })
})
