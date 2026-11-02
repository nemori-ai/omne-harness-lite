// @module-tag slow
// 归慢层：起运行名额脚本子进程，排队、等待与杀进程都是真的，另有临时 git 仓库。全量准入快层账本里整份合计 15.4 秒，负载下 22.0 秒，只标超预算的 3 条，余下仍有 7.5 秒（负载下 12.3 秒），过了线（tools/test-runner/README_ZH.md「归层」）。
// 运行名额脚本的行为核对：透传退出码、嵌套放行、占满时按先来后到排队并报出位置、
// 被杀的排队者不挡后来者、等太久放弃且不执行命令，以及每次用完或放弃都在运行账本记一行；
// 账本的等待与占用秒数按毫秒差截到整秒，用预载的伪时钟把时刻放到整秒边界两侧核对。
// 分侧判存活（#979 D1）：登记带 side 行，进程号只在同侧判，对侧只看心跳或年龄；队列锁同一规则、只删自己的；
// 票号单调、票被回收时提示；持有者发现名额文件被删时提示；旧版登记按同侧处理；WSL 里的默认目录解析
// 用预载的替身覆盖 wslpath 与 PowerShell，不依赖真实 WSL（真实跨侧归 test-slot-wsl.spec.ts）。
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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(new URL('../../../scripts/with-test-slot.sh', import.meta.url)),
)
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

const WINDOWS = process.platform === 'win32'

/** 本进程的 side，与脚本同一算法：平台@主机名，WSL 里再加发行版名。 */
const SIDE = `${process.platform}@${hostname()}${
  process.env['WSL_DISTRO_NAME'] ? `/${process.env['WSL_DISTRO_NAME']}` : ''
}`
/** 对侧登记用的 side：主机名不同就够了，脚本只比较整串。 */
const OTHER_SIDE = 'other@elsewhere'

/** Git for Windows 的 bash：从 `git --exec-path`（`<Git>/mingw64/libexec/git-core`）往上三级找 `bin/bash.exe`。 */
function gitBash(): string {
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  return join(resolve(exec), '..', '..', '..', 'bin', 'bash.exe')
}

/** 系统 bash：POSIX 上是 `/bin/bash`（macOS 上是没有 EPOCHSECONDS 的 3.2）；Windows 上是 Git for Windows 的 bash。 */
const SYSTEM_BASH = WINDOWS ? gitBash() : '/bin/bash'

/**
 * 执行名额脚本的命令行：POSIX 上直接执行它；Windows 上 Node 不能直接起 `.sh`（spawn EFTYPE），
 * 经系统 bash 起同一个脚本。
 */
const LAUNCH: readonly [string, ...string[]] = WINDOWS ? [SYSTEM_BASH, SCRIPT] : [SCRIPT]

/** 经名额脚本执行 `args` 的可执行文件与参数。 */
function launch(args: readonly string[]): [string, string[]] {
  const [file, ...rest] = LAUNCH
  return [file, [...rest, ...args]]
}

/** 杀掉后台起的进程及其子孙：POSIX 上给整个进程组发信号；Windows 没有进程组，用 taskkill 杀整棵树。 */
function killTree(pid: number): void {
  if (WINDOWS) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // 整组都已退出
  }
}

let dir: string
/**
 * 后台起的进程；用例失败、等着放行的命令没被放行时，收尾整组杀掉，不留空转的进程。
 * 已经退出的不再杀：Windows 上每次 taskkill 都要起一个进程，机器忙时几次就超过收尾钩子的时限。
 */
let groups: ChildProcess[] = []
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-slot-')))
})
afterEach(() => {
  for (const child of groups)
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null)
      killTree(child.pid)
  groups = []
  rmSync(dir, { recursive: true, force: true })
})

function slotEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const cleared: NodeJS.ProcessEnv = { ...process.env }
  // 这份测试自己可能就跑在名额里；清掉标记才测得到排队。
  delete cleared['OMNE_TEST_SLOT_HELD']
  // 账本也指到临时目录，测试的运行不混进真实账本。
  return {
    ...cleared,
    OMNE_TEST_SLOT_DIR: join(dir, 'locks'),
    OMNE_TEST_SLOT_LEDGER: join(dir, 'ledger.jsonl'),
    ...env,
  }
}

interface LedgerLine {
  readonly event: 'ran' | 'gave-up'
  readonly command: string
  readonly issue: number | null
  readonly attempt: string | null
  readonly cwd: string
  readonly cores: number
  readonly slots: number
  readonly slot: number | null
  readonly aheadOnArrival: number
  readonly waitSeconds: number
  readonly heldSeconds: number | null
  readonly cpuSeconds: number | null
  readonly exitCode: number
  readonly arrivedAt: string
  readonly acquiredAt: string | null
  readonly endedAt: string
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

/**
 * 在 `cwd` 起 git 子进程用的环境：git 只认 `cwd` 本身。外面环境里的 `GIT_DIR`、`GIT_WORK_TREE`、
 * `GIT_COMMON_DIR` 不漏进来，`GIT_CEILING_DIRECTORIES` 让 git 不向上找到临时目录之外的仓库。
 */
function gitEnv(cwd: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env, GIT_CEILING_DIRECTORIES: dirname(cwd) }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete result[name]
  return result
}

/** 在 `cwd` 经名额执行命令，git 环境见 `gitEnv`。 */
function slotIn(cwd: string, args: readonly string[]) {
  return spawnSync(...launch(args), { encoding: 'utf8', env: gitEnv(cwd, slotEnv({})), cwd })
}

/** 在 `name` 下建一个 git 仓库，git 目录里写入 `context`（task context 文件的原文）。 */
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
  /**
   * 等到标准错误里出现 `text`（字符串或正则）；进程先退出、或等了 `UNTIL_LIMIT_MS` 还没出现则失败。
   * 脚本一次报告分几次写出（位置一行、每个占用者一行），父进程可能分几次收到：要断言哪一行，就等哪一行。
   */
  readonly until: (text: string | RegExp) => Promise<void>
}

/** `until` 最多等多久：比用例时限短，超时时报出已收到的输出，而不是只报用例超时。 */
const UNTIL_LIMIT_MS = 20_000

/**
 * 伪时钟：预载进脚本的 node 进程，替换 `Date.now`。时刻从 `SLOT_TEST_CLOCK_START` 起，每读一次前进 1 毫秒；
 * `SLOT_TEST_CLOCK_SHIFT` 指向的文件存在时再加上其中的毫秒数，命令写这个文件就能把时钟往前拨。
 */
const CLOCK_SOURCE = `import { existsSync, readFileSync } from 'node:fs'
const start = Number(process.env.SLOT_TEST_CLOCK_START)
const shift = process.env.SLOT_TEST_CLOCK_SHIFT
let reads = 0
Date.now = () => start + reads++ + (existsSync(shift) ? Number(readFileSync(shift, 'utf8')) : 0)
`

/**
 * 2023-11-14T22:13:20Z 的毫秒时刻：伪时钟的整秒基准。有意取在过去：脚本拿 `Date.now()` 比名额锁文件的真实 mtime，
 * 取将来的时刻会让排队者把占用者的锁当成失效删掉。
 */
const CLOCK_SECOND = 1_700_000_000_000

/**
 * 在伪时钟下经名额执行命令：时钟从 `startMs` 起，命令可往 `clockShift()` 写毫秒数拨快时钟；`TZ=UTC` 让账本时刻按字符串比对。
 * 设了时限：时钟几乎不走，脚本若该放弃而没放弃就会一直排下去。
 */
function slotWithClock(args: readonly string[], startMs: number, env: Record<string, string> = {}) {
  return spawnSync(...launch(args), {
    encoding: 'utf8',
    timeout: 10_000,
    env: slotEnv({ ...clockEnv(startMs), ...env }),
  })
}

/** 写出伪时钟模块，返回让脚本预载它的环境变量。 */
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

/** 写出一个预载模块，返回让脚本（与它起的 node 子进程）预载它的环境变量。 */
function preload(name: string, source: string): Record<string, string> {
  const path = join(dir, `${name}.mjs`)
  writeFileSync(path, source)
  return { NODE_OPTIONS: `--import ${pathToFileURL(path).href}` }
}

/**
 * 替身：WSL 里解析默认目录要起的 `wslpath` 与 PowerShell。`wslpath -u X:\a\b` 映射到 `SLOT_TEST_INTEROP_ROOT/a/b`；
 * PowerShell 按 `SLOT_TEST_INTEROP` 行事：`ok` 建好目录与命令里点名的探针文件并报出 Windows 路径，
 * `unshared` 只报路径不建文件（解析出的目录里看不见 Windows 建的文件），`broken` 起不来。其余命令照常起。
 */
const INTEROP_SOURCE = `import cp from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { dirname, join } from 'node:path'
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
    const windows = 'C:\\\\Temp\\\\omne-test-slots-tester'
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

/**
 * 替身：往 `SLOT_TEST_GATED_LEDGER` 追加账本行之前，等 `SLOT_TEST_LEDGER_GATE` 文件出现（最多 15 秒）。
 * 脚本在队列锁内写账本，所以这能把它钉在持有队列锁的那一刻。
 */
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

/** 等到 `ready()` 成立；超过 `limitMs` 则失败。 */
async function waitFor(ready: () => boolean, what: string, limitMs = 10_000): Promise<void> {
  const deadline = Date.now() + limitMs
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`等了 ${limitMs} 毫秒没等到：${what}`)
    await new Promise(tick => setTimeout(tick, 50))
  }
}

/**
 * 手写一份登记（名额、票或队列锁的 owner）：进程号、side（不给就不写这一行，即旧版格式，按同侧处理）、
 * 心跳间隔，修改时间拨到 `age` 秒前。
 */
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

/** 在锁目录里放一把队列锁，owner 写成给定内容，修改时间拨到 `age` 秒前。 */
function placeQueueLock(owner: string, age = 0): string {
  const lock = join(dir, 'locks', 'queue.lock')
  mkdirSync(lock, { recursive: true })
  writeFileSync(join(lock, 'owner'), owner)
  const at = new Date(Date.now() - age * 1000)
  utimesSync(lock, at, at)
  return lock
}

/** 一个已经退出的进程的进程号。 */
function deadPid(): number {
  const exited = spawnSync(process.execPath, ['-e', '0'])
  return exited.pid
}

/**
 * 让一张票看起来心跳停了：把修改时间拨到 60 秒前。登记者每轮刷新它，所以拨完等一会再看，
 * 被刷回来就再拨，直到旧时间留住。
 */
async function stall(path: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const old = new Date(Date.now() - 60_000)
    utimesSync(path, old, old)
    await new Promise(tick => setTimeout(tick, 250))
    if (Date.now() - statSync(path).mtimeMs > 30_000) return
  }
  throw new Error(`${path} 的修改时间一直被刷回来`)
}

/** 基线版脚本（登记没有 side 行）：从 git 历史抽出放进临时目录，直接用 node 起。 */
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

/** 在后台经名额执行命令，边跑边收集输出；默认每秒看一次队列。`launcher` 可换成别的版本的脚本。 */
function queue(
  args: readonly string[],
  env: Record<string, string> = {},
  launcher: readonly [string, ...string[]] = LAUNCH,
): Queued {
  const [file, ...rest] = launcher
  const child = spawn(file, [...rest, ...args], {
    env: slotEnv({ OMNE_TEST_SLOT_POLL_SECONDS: '1', ...env }),
    stdio: ['ignore', 'pipe', 'pipe'],
    // POSIX 上自成进程组，收尾时整组杀掉；Windows 上 detached 只会另开控制台，收尾改用 taskkill。
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

/**
 * 经名额执行一条等着放行的命令：拿到名额后建 `<name>.ready`，等 `<name>.release` 出现才结束。
 * 命令行以 `env SLOT_TEST=<name>` 开头，排队者报出的持有者命令据此认得出是谁。
 */
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

/** 占住一个名额，直到放行。 */
async function hold(): Promise<{ release: () => Promise<void> }> {
  const holder = blocker('holder')
  await holder.started()
  return holder
}

/** 一个排队者：拿到名额后把自己的名字追加进 `order`。 */
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
    // 嵌套的那次同样经 LAUNCH 起名额脚本：Windows 上名额脚本也不能直接执行 `.sh`。
    const result = slot([...LAUNCH, 'bash', '-c', 'echo "$OMNE_TEST_SLOT_HELD"'])
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(join(dir, 'locks', 'slot-1.lock'))
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
    // 前提：名额空闲、没有排队；在此前提下 waitSeconds 应为 0。跨整秒边界的情形由下面的伪时钟用例核对。
    expect(result.stderr).not.toContain('排队中')
    const [line, ...rest] = ledger()
    expect(rest).toEqual([])
    expect(line).toMatchObject({
      event: 'ran',
      command: args.join(' '),
      cwd: process.cwd(),
      slots: 1,
      slot: 1,
      aheadOnArrival: 0,
      waitSeconds: 0,
      exitCode: 3,
    })
    // Windows 上没有 /proc 与 /usr/bin/time，名额脚本不量 CPU，记 null；其余平台必须量到命令自己用掉的。
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
        OMNE_TEST_SLOT_HELD: join(dir, 'locks', 'slot-1.lock'),
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
        slot: null,
        acquiredAt: null,
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
    expect(waiter.stderr()).toContain('拿到名额 1/1')
    // 占用从拿到名额算起，不含排队的时间：命令只是一次 echo。
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
    // 先到的看得最慢：若谁先看到空名额谁拿，后两个大概率插到它前面。
    const first = appendOrder('A', { OMNE_TEST_SLOT_POLL_SECONDS: '2' })
    await first.until('排队中')
    const second = appendOrder('B')
    await second.until('排队中')
    const third = appendOrder('C')
    await third.until('排队中')
    await holder.release()
    expect(await Promise.all([first.exited, second.exited, third.exited])).toEqual([0, 0, 0])
    expect(order()).toEqual(['A', 'B', 'C'])
    // 账本按用完的先后记：占着的、A、B、C；各自进队时前面有几个也记下了。
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
      new RegExp(`名额 1/1 正由「env SLOT_TEST=${name} [^」]*」占着，已 \\d+ 秒`, 'u')
    const holder = await hold()
    const first = blocker('first')
    await first.queued.until('排队中')
    // 占用者行在位置行之后另行写出：等它到了再断言（#737）。
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

  it('两个名额：一个被占时另一个仍可用，不排队', async () => {
    const holder = await hold()
    try {
      const result = slot(['bash', '-c', 'echo "$OMNE_TEST_SLOT_HELD"'], { OMNE_TEST_SLOTS: '2' })
      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe(join(dir, 'locks', 'slot-2.lock'))
      expect(result.stderr).toBe('')
    } finally {
      await holder.release()
    }
  })

  it('没给命令或策略值不是整数：以 2 退出', () => {
    expect(slot([]).status).toBe(2)
    expect(slot(['true'], { OMNE_TEST_SLOTS: '两个' }).status).toBe(2)
    expect(slot(['true'], { OMNE_TEST_SLOTS: '0' }).status).toBe(2)
  })

  it('登记带 side 行：平台@主机名，给了 WSL_DISTRO_NAME 再加发行版名；排队提示里报出持有者的侧', async () => {
    const holder = await hold()
    expect(readFileSync(join(dir, 'locks', 'slot-1.lock'), 'utf8')).toContain(`\nside=${SIDE}\n`)
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
    // 对侧的进程号在本侧判不了：这个号在本侧已经退出，心跳却是新鲜的。
    const held = register('slot-1.lock', { pid: deadPid(), side: OTHER_SIDE, beat: 5 })
    const before = readFileSync(held, 'utf8')
    const refused = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(refused.status, refused.stderr).toBe(75)
    expect(refused.stdout).toBe('')
    expect(readFileSync(held, 'utf8')).toBe(before)
    // 对侧的活票排在前面。
    const ticket = register('ticket-7', { pid: deadPid(), side: OTHER_SIDE, beat: 1 })
    const behind = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(behind.status).toBe(75)
    expect(behind.stderr).toContain('前面还有 1 个')
    expect(existsSync(ticket)).toBe(true)
    // 心跳停了 30 秒：两份登记都失效，立刻回收并拿到。
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
    register('slot-1.lock', { pid: deadPid(), side: SIDE, beat: 5 })
    const immediate = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(immediate.status, immediate.stderr).toBe(0)
    expect(immediate.stderr).toBe('')
    // 旧版登记没有 side 行：按同侧判进程号，不是只看心跳等 20 秒。
    register('slot-1.lock', { pid: deadPid(), beat: 5 })
    const legacy = slot(['bash', '-c', 'echo 跑了'], { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0' })
    expect(legacy.status, legacy.stderr).toBe(0)
    expect(legacy.stdout).toBe('跑了\n')
    // 进程号是本进程（活着），心跳 5 秒前停了，阈值 3×1+5=8 秒：再过约 3 秒失效，每秒看一次。
    register('slot-1.lock', { pid: process.pid, side: SIDE, beat: 1, age: 5 })
    const waiter = queue(['bash', '-c', 'echo 轮到了'])
    await waiter.until('排队中')
    expect(await waiter.exited).toBe(0)
    expect(waiter.stdout()).toBe('轮到了\n')
    const waited = Number(/等了 (\d+) 秒，拿到名额/u.exec(waiter.stderr())?.[1])
    expect(waited).toBeGreaterThanOrEqual(2)
    expect(waited).toBeLessThanOrEqual(8)
  })

  it('票号单调：票被回收后新号比它大；先到者发现票没了就提示并重新排队，最终拿到名额', async () => {
    const holder = await hold()
    // 先到者 3 秒看一次，它的票 60 秒没刷新就当作心跳停了。
    const first = appendOrder('A', { OMNE_TEST_SLOT_POLL_SECONDS: '3' })
    await first.until('排队中')
    expect(tickets()).toEqual(['ticket-1'])
    await stall(join(dir, 'locks', 'ticket-1'))
    const second = appendOrder('B')
    await second.until('排队中')
    // 后到者把失效的 1 号删了，领到的是 2 号，不是 1 号。
    expect(tickets()).toEqual(['ticket-2'])
    await first.until('票被回收，重新排队（前面还有 1 个）')
    expect(tickets().sort()).toEqual(['ticket-2', 'ticket-3'])
    await holder.release()
    expect(await Promise.all([first.exited, second.exited])).toEqual([0, 0])
    expect(order()).toEqual(['B', 'A'])
    expect(tickets()).toEqual([])
  })

  it('旧版脚本的登记没有 side 行，按同侧处理：与新版混跑仍互斥', async () => {
    const legacy = legacyLaunch()
    const legacyHolder = blocker('legacy', {}, legacy)
    await legacyHolder.started()
    expect(readFileSync(join(dir, 'locks', 'slot-1.lock'), 'utf8')).not.toContain('side=')
    const waiter = appendOrder('new')
    await waiter.until('排队中')
    expect(existsSync(join(dir, 'order'))).toBe(false)
    await legacyHolder.release()
    expect(await waiter.exited).toBe(0)
    const holder = await hold()
    const legacyWaiter = queue(['bash', '-c', `echo legacy >> "${join(dir, 'order')}"`], {}, legacy)
    await legacyWaiter.until('排队中')
    expect(order()).toEqual(['new'])
    await holder.release()
    expect(await legacyWaiter.exited).toBe(0)
    expect(order()).toEqual(['new', 'legacy'])
  })

  describe('WSL 里的默认目录', () => {
    /** 不设 OMNE_TEST_SLOT_DIR，让脚本自己解析；Windows 上 TEMP 指到临时目录，回退也落在私有目录里。 */
    function resolveDefault(mode: 'ok' | 'unshared' | 'broken') {
      const root = join(dir, 'windows')
      const env = slotEnv({
        ...preload('interop', INTEROP_SOURCE),
        WSL_DISTRO_NAME: 'Fake',
        SLOT_TEST_INTEROP: mode,
        SLOT_TEST_INTEROP_ROOT: root,
        TEMP: dir,
        TMP: dir,
      })
      delete env['OMNE_TEST_SLOT_DIR']
      const result = spawnSync(
        ...launch([
          process.execPath,
          '-e',
          'process.stdout.write(process.env.OMNE_TEST_SLOT_HELD)',
        ]),
        { encoding: 'utf8', env, timeout: 20_000 },
      )
      return { ...result, root }
    }
    /** 回退目录：Windows 上是 TEMP（已指到临时目录）下的；POSIX 上是真实的 /tmp 下的，用例只在里面短暂领一次。 */
    const fallback = () =>
      WINDOWS
        ? join(dir, `omne-test-slots-${userInfo().username}`)
        : `/tmp/omne-test-slots-${process.getuid?.() ?? ''}`

    it('有 interop：解析到 Windows 侧临时目录下的同一个目录，探针用完即删，不提示', () => {
      const result = resolveDefault('ok')
      const shared = join(result.root, 'Temp', 'omne-test-slots-tester')
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(join(shared, 'slot-1.lock'))
      expect(result.stderr).toBe('')
      expect(readdirSync(shared).filter(name => name.startsWith('.omne-probe-'))).toEqual([])
    })

    it('interop 起不来：回退到本侧目录，并在标准错误提示没有共用名额', () => {
      const result = resolveDefault('broken')
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(join(fallback(), 'slot-1.lock'))
      expect(result.stderr).toContain('WSL 与 Windows 没有共用名额')
      expect(result.stderr).toContain(fallback())
    })

    it('解析出了路径，但 Windows 建的文件在那里看不见：同目录判定不成立，回退并提示', () => {
      const result = resolveDefault('unshared')
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe(join(fallback(), 'slot-1.lock'))
      expect(result.stderr).toContain('WSL 与 Windows 没有共用名额')
      expect(result.stderr).toContain('看不见')
    })
  })

  it('对侧的队列锁：年龄不到 30 秒不删、等着；过了 30 秒才删。同侧进程不在了立刻删', async () => {
    const lock = placeQueueLock(`pid=${deadPid()}\nside=${OTHER_SIDE}\n`)
    const waiter = appendOrder('A')
    await new Promise(tick => setTimeout(tick, 2000))
    expect(existsSync(join(dir, 'order'))).toBe(false)
    expect(readFileSync(join(lock, 'owner'), 'utf8')).toContain(`side=${OTHER_SIDE}`)
    rmSync(lock, { recursive: true, force: true })
    expect(await waiter.exited).toBe(0)
    expect(order()).toEqual(['A'])
    placeQueueLock(`pid=${deadPid()}\nside=${OTHER_SIDE}\n`, 40)
    const aged = slot(['bash', '-c', 'echo 过期'])
    expect(aged.status, aged.stderr).toBe(0)
    expect(aged.stdout).toBe('过期\n')
    placeQueueLock(`pid=${deadPid()}\nside=${SIDE}\n`)
    const same = slot(['bash', '-c', 'echo 同侧'])
    expect(same.status, same.stderr).toBe(0)
    expect(same.stdout).toBe('同侧\n')
  })

  it('结束时只删自己的队列锁：锁被别人重建过就不动它', async () => {
    const gate = join(dir, 'ledger.gate')
    const proceed = join(dir, 'command.proceed')
    // 命令等放行文件，名额文件在被观察期间一直在；命令太短的话，名额文件只活十几毫秒，轮询可能看不到。
    const holder = queue(['bash', '-c', `until [ -e "${proceed}" ]; do sleep 0.1; done`], {
      ...preload('ledger-gate', LEDGER_GATE_SOURCE),
      SLOT_TEST_GATED_LEDGER: join(dir, 'ledger.jsonl'),
      SLOT_TEST_LEDGER_GATE: gate,
    })
    const slotFile = join(dir, 'locks', 'slot-1.lock')
    const owner = join(dir, 'locks', 'queue.lock', 'owner')
    await waitFor(() => existsSync(slotFile), '拿到名额')
    writeFileSync(proceed, '')
    // 命令跑完、名额已删、卡在写账本：这时它持有队列锁。
    await waitFor(() => !existsSync(slotFile) && existsSync(owner), '收尾时持有队列锁')
    expect(readFileSync(owner, 'utf8')).toContain(`side=${SIDE}`)
    const foreign = `pid=${deadPid()}\nside=${OTHER_SIDE}\n`
    rmSync(dirname(owner), { recursive: true, force: true })
    placeQueueLock(foreign)
    writeFileSync(gate, '')
    expect(await holder.exited).toBe(0)
    expect(readFileSync(owner, 'utf8')).toBe(foreign)
    expect(ledger()).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('持有者发现名额文件被删：标准错误报一句，命令照常跑完', async () => {
    const holder = blocker('holder')
    await holder.started()
    rmSync(join(dir, 'locks', 'slot-1.lock'))
    await holder.queued.until('名额文件被删')
    await holder.release()
    expect(await holder.queued.exited).toBe(0)
    expect(ledger()).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('读者时钟超前 25 秒、持有者在对侧：会误删活着的持有者并拿到名额，持有者报名额文件被删（已知限制）', async () => {
    const holder = blocker('holder', { WSL_DISTRO_NAME: 'elsewhere' })
    await holder.started()
    // 读者拿到名额后占 8 秒：持有者下一次心跳（5 秒一次）落在这期间，发现登记已经是别人的，不等读者放手才报。
    const reader = queue(['bash', '-c', 'echo 抢到了; sleep 8'], clockEnv(Date.now() + 25_000))
    await waitFor(() => reader.stdout().includes('抢到了'), '读者拿到名额')
    expect(reader.stderr()).not.toContain('排队中')
    await holder.queued.until('名额文件被删')
    expect(reader.child.exitCode).toBeNull()
    expect(await reader.exited).toBe(0)
    await holder.release()
    expect(await holder.queued.exited).toBe(0)
  })
})
