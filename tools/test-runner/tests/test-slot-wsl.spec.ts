// @module-tag slow
// 归慢层：真实跨侧。Windows 宿主与 WSL 发行版各起名额脚本，经同一个物理目录互斥；要起 wsl.exe，等待都是真的。
// 只在 Windows 宿主上、wsl.exe 起得来且 WSL 里有 node 时跑，否则每条用例用 context.skip 写明原因
// （慢层开着 preParse，静态 skipIf 会把整个文件丢掉）。
// 核对三件事（#979 D1）：WSL 里不给 OMNE_TEST_SLOT_DIR 时解析到 Windows 侧的同一个目录（Windows 建的探针文件
// WSL 看得见、WSL 登记的名额 Windows 看得见）；Windows 持有时 WSL 排队、反向亦然；两侧各 20 个短命令抢同一目录，
// 从没同时在跑（独立原子占用哨兵覆盖命令有效区间，另采样运行标记）、40 个进程都以 0 退出、恰好 40 行 ran。
// Date.now 在 WSL 上可能回拨，墙钟区间与账本只留作诊断，不作重叠门；hrtime 原值不跨平台比较。
// WSL 侧只读工作树里的脚本（它只用 Node 标准库），不往 WSL 里装任何东西；锁目录放在 Windows 临时目录下的私有目录。
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(
  fileURLToPath(new URL('../../../scripts/with-test-slot.mjs', import.meta.url)),
)
const WINDOWS = process.platform === 'win32'

/** wsl.exe 自己的输出是 UTF-16，字节里夹着 NUL；Linux 进程的输出是 UTF-8。统一去掉 NUL 再读。 */
function text(raw: string | Buffer | null | undefined): string {
  return (raw ?? '').toString().replaceAll('\0', '')
}

type Wsl =
  | { readonly ok: true; readonly distro: string }
  | { readonly ok: false; readonly reason: string }

/** 能不能跑：Windows 宿主、wsl.exe 的缺省发行版起得来、里面有 node。只探一次。 */
function probeWsl(): Wsl {
  if (!WINDOWS) return { ok: false, reason: '真实跨侧只在 Windows 宿主上跑' }
  const probe = spawnSync(
    'wsl.exe',
    ['--exec', 'bash', '-l', '-c', 'command -v node >/dev/null && echo "$WSL_DISTRO_NAME"'],
    { encoding: 'utf8', timeout: 60_000 },
  )
  const distro = text(probe.stdout).trim()
  if (probe.status !== 0 || distro === '')
    return {
      ok: false,
      reason: `wsl.exe 起不来缺省发行版，或 WSL 里没有 node：${text(probe.stderr).trim() || `退出码 ${probe.status}`}`,
    }
  return { ok: true, distro }
}
const wsl = probeWsl()

/** 在 WSL 里跑一段 bash（登录 shell，PATH 里才有 node）。 */
function wslArgs(script: string): [string, string[]] {
  return ['wsl.exe', ['--exec', 'bash', '-l', '-c', script]]
}

/** Windows 路径在 WSL 里的路径。 */
function toWsl(windowsPath: string): string {
  const result = spawnSync('wsl.exe', ['--exec', 'wslpath', '-u', windowsPath], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  const path = text(result.stdout).trim()
  if (result.status !== 0 || path === '')
    throw new Error(`wslpath 转不了 ${windowsPath}：${text(result.stderr)}`)
  return path
}

/** bash 单引号：里面的单引号写成 '\''。 */
const q = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`

let dir: string
let wslDir: string
let children: ChildProcess[] = []
beforeEach(() => {
  // 长名：Windows 的临时目录常带 8.3 短名，WSL 侧按长名找同一个目录。
  dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'omne-slot-wsl-')))
  mkdirSync(join(dir, 'locks'))
  if (wsl.ok) wslDir = toWsl(dir)
})
afterEach(() => {
  for (const child of children)
    if (child.pid !== undefined && child.exitCode === null)
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  children = []
  rmSync(dir, { recursive: true, force: true })
})

interface Running {
  readonly child: ChildProcess
  readonly stdout: () => string
  readonly stderr: () => string
  readonly exited: Promise<number | null>
  readonly until: (needle: string) => Promise<void>
}

function watch(child: ChildProcess): Running {
  children.push(child)
  let stdout = ''
  let stderr = ''
  let done = false
  child.stdout?.on('data', (chunk: Buffer) => (stdout += text(chunk)))
  child.stderr?.on('data', (chunk: Buffer) => (stderr += text(chunk)))
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
    until: async needle => {
      const deadline = Date.now() + 60_000
      while (!stderr.includes(needle)) {
        if (done) throw new Error(`进程已退出，没等到「${needle}」：\n${stderr}`)
        if (Date.now() > deadline) throw new Error(`等了 60 秒没等到「${needle}」：\n${stderr}`)
        await new Promise(tick => setTimeout(tick, 100))
      }
    },
  }
}

async function waitFor(ready: () => boolean, what: string, limitMs = 60_000): Promise<void> {
  const deadline = Date.now() + limitMs
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`等了 ${limitMs} 毫秒没等到：${what}`)
    await new Promise(tick => setTimeout(tick, 100))
  }
}

/**
 * 经名额执行的命令（node -e）：建 `<argv[1]>` 表示开始、等 `<argv[2]>` 出现再结束，最多等 90 秒。
 * `fs` 在 `node -e` 里是现成的全局量。
 */
const HOLD_CODE = `fs.writeFileSync(process.argv[1], String(Date.now()));
const until = Date.now() + 90_000;
while (!fs.existsSync(process.argv[2]) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);`

/**
 * 独立哨兵覆盖所有有效工作，包括运行标记和诊断写入。竞争失败立即退出 86，不等待、不串行化命令。
 * argv[2] 放哨兵与诊断，argv[3] 只供负控延长首个命令，正常命令仍睡 300 毫秒。
 */
const RUN_CODE = `const path = require('node:path');
const sentinel = process.argv[2] + '/active';
const observation = process.argv[2] + '/' + path.basename(process.argv[1]);
let fd;
try { fd = fs.openSync(sentinel, 'wx'); }
catch (error) { fs.writeFileSync(observation + '.collision', error.code); process.exit(86); }
const started = Date.now(), monoStarted = process.hrtime.bigint().toString();
fs.writeFileSync(process.argv[1] + '.running', '');
if (process.argv[3]) {
  const deadline = performance.now() + 10000;
  while (!fs.existsSync(process.argv[3])) {
    if (performance.now() > deadline) throw new Error('sentinel control timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
} else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
fs.rmSync(process.argv[1] + '.running');
const ended = Date.now(), monoEnded = process.hrtime.bigint().toString();
fs.writeFileSync(process.argv[1], started + ' ' + ended);
fs.writeFileSync(observation + '.json', JSON.stringify({ pid: process.pid, started, ended, monoStarted, monoEnded }));
fs.closeSync(fd);
fs.rmSync(sentinel);`

/**
 * 两侧的时钟不一定对得上（本机 WSL 落后 Windows 约 2 秒），跨侧的重叠不能比时刻。
 * 改由 Windows 侧这一个观察者每 10 毫秒看一次 `runs/` 里的 `.running` 标记：同时看到两个就是重叠。
 * 返回停止观察的函数，它给出看到过的最多并发数与第一次重叠时的标记名。
 */
function observeOverlap(runs: string): () => { readonly most: number; readonly overlap: string[] } {
  let most = 0
  let overlap: string[] = []
  const timer = setInterval(() => {
    let running: string[]
    try {
      running = readdirSync(runs).filter(name => name.endsWith('.running'))
    } catch {
      return
    }
    if (running.length > most) most = running.length
    if (running.length > 1 && overlap.length === 0) overlap = running
  }, 10)
  return () => {
    clearInterval(timer)
    return { most, overlap }
  }
}

/** Windows 侧：直接用本进程的 node 起名额脚本，锁目录与账本在私有目录里，每秒看一次。 */
function onWindows(code: string, extra: string[]): Running {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OMNE_TEST_SLOT_DIR: join(dir, 'locks'),
    OMNE_TEST_SLOT_LEDGER: join(dir, 'ledger-windows.jsonl'),
    OMNE_TEST_SLOT_POLL_SECONDS: '1',
  }
  delete env['OMNE_TEST_SLOT_HELD']
  return watch(
    spawn(process.execPath, [SCRIPT, process.execPath, '-e', code, ...extra], {
      env,
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
}

/** WSL 侧要起名额脚本时的 bash 前缀：同一个锁目录、自己的账本、每秒看一次，清掉继承的 HELD。 */
function wslPrefix(): string {
  return [
    `cd ${q(wslDir)}`,
    'unset OMNE_TEST_SLOT_HELD',
    `export OMNE_TEST_SLOT_DIR=${q(`${wslDir}/locks`)}`,
    `export OMNE_TEST_SLOT_LEDGER=${q(`${wslDir}/ledger-wsl.jsonl`)}`,
    'export OMNE_TEST_SLOT_POLL_SECONDS=1',
  ].join(' && ')
}

/** WSL 侧：经 wsl.exe 起名额脚本，脚本本身读工作树里的那一份。 */
function onWsl(code: string, extra: string[]): Running {
  const command = [`node ${q(toWsl(SCRIPT))} node -e ${q(code)}`, ...extra.map(toWsl).map(q)].join(
    ' ',
  )
  const [file, args] = wslArgs(`${wslPrefix()} && ${command}`)
  return watch(spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] }))
}

interface LedgerLine {
  readonly event: string
  readonly acquiredAt: string | null
  readonly endedAt: string
  readonly exitCode: number
}

function ledgerLines(name: string): LedgerLine[] {
  const path = join(dir, name)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as LedgerLine)
}

/** 持有者在一侧占着，等待者在另一侧排队：等待者不开始；持有者放手后等待者才开始。 */
async function holdAcross(
  holdOn: (code: string, extra: string[]) => Running,
  waitOn: (code: string, extra: string[]) => Running,
): Promise<void> {
  const holderStarted = join(dir, 'holder.started')
  const holderRelease = join(dir, 'holder.release')
  const waiterStarted = join(dir, 'waiter.started')
  const waiterRelease = join(dir, 'waiter.release')
  const holder = holdOn(HOLD_CODE, [holderStarted, holderRelease])
  await waitFor(() => existsSync(holderStarted), '持有者开始')
  const waiter = waitOn(HOLD_CODE, [waiterStarted, waiterRelease])
  await waiter.until('排队中')
  await new Promise(tick => setTimeout(tick, 2500))
  expect(existsSync(waiterStarted)).toBe(false)
  // 持有者的命令行与侧都报出来：Windows 上命令是 node.exe 的完整路径。
  expect(waiter.stderr()).toMatch(
    /名额 1\/1 正由「\S*node(\.exe)? -e [^」]*」占着，已 \d+ 秒（[^）]*，(win32|linux)@/u,
  )
  writeFileSync(holderRelease, '')
  expect(await holder.exited, holder.stderr()).toBe(0)
  await waitFor(() => existsSync(waiterStarted), '持有者放手后等待者开始')
  writeFileSync(waiterRelease, '')
  expect(await waiter.exited, waiter.stderr()).toBe(0)
  expect(waiter.stderr()).toMatch(/等了 \d+ 秒，拿到名额 1\/1/u)
}

describe('with-test-slot.mjs 跨 WSL 与 Windows', { timeout: 240_000 }, () => {
  it('占用哨兵的负控：绕过 slot 的并发命令立即报告 EEXIST，不能等待放行', async () => {
    const runs = join(dir, 'runs')
    const observations = join(dir, 'observations')
    mkdirSync(runs)
    mkdirSync(observations)
    const release = join(dir, 'release')
    const firstPath = join(runs, 'first')
    const first = watch(
      spawn(process.execPath, ['-e', RUN_CODE, firstPath, observations, release], {
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
    try {
      await waitFor(() => existsSync(`${firstPath}.running`), '首个命令占用哨兵')
      const second = watch(
        spawn(process.execPath, ['-e', RUN_CODE, join(runs, 'second'), observations], {
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      )
      expect(await second.exited, second.stderr()).toBe(86)
      expect(readFileSync(join(observations, 'second.collision'), 'utf8')).toBe('EEXIST')
      expect(first.child.exitCode).toBeNull()
      expect(existsSync(`${firstPath}.running`)).toBe(true)
    } finally {
      writeFileSync(release, '')
      expect(await first.exited, first.stderr()).toBe(0)
    }
  })

  it('没有 USERNAME 且不给 OMNE_TEST_SLOT_DIR：Windows 与 WSL 仍共用旧 TEMP 目录', async ctx => {
    if (!wsl.ok) ctx.skip(wsl.reason)
    // 把一个私有目录当作 Windows 侧的 TEMP：WSLENV 让 interop 起的 PowerShell 看到它（/p 转成 Windows 路径）。
    const windowsTemp = join(dir, 'win-temp')
    mkdirSync(windowsTemp)
    const held = join(dir, 'held')
    const release = join(dir, 'release')
    const code = `if (process.env.USERNAME !== undefined) throw new Error('USERNAME must be absent');
fs.writeFileSync(process.argv[1], process.env.OMNE_TEST_SLOT_HELD);
const until = Date.now() + 90_000;
while (!fs.existsSync(process.argv[2]) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);`
    const [file, args] = wslArgs(
      [
        `cd ${q(wslDir)}`,
        'unset OMNE_TEST_SLOT_DIR OMNE_TEST_SLOT_HELD USERNAME',
        `export TEMP=${q(toWsl(windowsTemp))} WSLENV=TEMP/p`,
        `export OMNE_TEST_SLOT_LEDGER=${q(`${wslDir}/ledger-wsl.jsonl`)}`,
        `node ${q(toWsl(SCRIPT))} node -e ${q(code)} ${q(toWsl(held))} ${q(toWsl(release))}`,
      ].join(' && '),
    )
    const cleanEnv = { ...process.env }
    delete cleanEnv['USERNAME']
    const holder = (() => {
      const username = Object.entries(process.env).filter(
        ([key]) => key.toUpperCase() === 'USERNAME',
      )
      for (const [key] of username) delete process.env[key]
      try {
        return watch(spawn(file, args, { env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'] }))
      } finally {
        for (const [key, value] of username) process.env[key] = value
      }
    })()
    await waitFor(() => existsSync(held) || holder.child.exitCode !== null, '脚本拿到名额')
    expect(holder.child.exitCode, holder.stderr()).toBeNull()
    const windowsSlotDir = join(windowsTemp, `omne-test-slots-${userInfo().username}`)
    // WSL 侧登记在解析出的路径下，这个路径就是 Windows 侧那个目录。
    expect(readFileSync(held, 'utf8')).toBe(`${toWsl(windowsSlotDir)}/slot-1.lock`)
    expect(holder.stderr()).not.toContain('没有共用名额')
    // Windows 侧看得见 WSL 登记的名额；PowerShell 建的探针用完即删。
    expect(readFileSync(join(windowsSlotDir, 'slot-1.lock'), 'utf8')).toContain('\nside=linux@')
    expect(readdirSync(windowsSlotDir).filter(name => name.startsWith('.omne-probe-'))).toEqual([])
    const waiterStarted = join(dir, 'windows.started')
    const strict = join(dir, 'strict-environment.mjs')
    writeFileSync(
      strict,
      'for (const key of Object.keys(process.env)) if (key.toUpperCase() === "USERNAME") delete process.env[key]\n',
    )
    const waiterEnv: NodeJS.ProcessEnv = {
      ...cleanEnv,
      NODE_OPTIONS: `--import ${pathToFileURL(strict).href}`,
      TEMP: windowsTemp,
      TMP: windowsTemp,
      OMNE_TEST_SLOT_LEDGER: join(dir, 'ledger-windows.jsonl'),
      OMNE_TEST_SLOT_POLL_SECONDS: '1',
    }
    delete waiterEnv['OMNE_TEST_SLOT_DIR']
    delete waiterEnv['OMNE_TEST_SLOT_HELD']
    const waiter = watch(
      spawn(
        process.execPath,
        [
          SCRIPT,
          process.execPath,
          '-e',
          'if (process.env.USERNAME !== undefined) throw new Error("USERNAME must be absent"); fs.writeFileSync(process.argv[1], process.env.OMNE_TEST_SLOT_HELD)',
          waiterStarted,
        ],
        { env: waiterEnv, stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    )
    await waiter.until('排队中')
    expect(existsSync(waiterStarted)).toBe(false)
    writeFileSync(release, '')
    expect(await holder.exited, holder.stderr()).toBe(0)
    expect(await waiter.exited, waiter.stderr()).toBe(0)
    expect(readFileSync(waiterStarted, 'utf8')).toBe(join(windowsSlotDir, 'slot-1.lock'))
    expect(ledgerLines('ledger-wsl.jsonl')).toMatchObject([{ event: 'ran', exitCode: 0 }])
    expect(ledgerLines('ledger-windows.jsonl')).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('Windows 持有、WSL 等待：等待者排队不开始，持有者结束后才开始', async ctx => {
    if (!wsl.ok) ctx.skip(wsl.reason)
    await holdAcross(onWindows, onWsl)
    expect(ledgerLines('ledger-windows.jsonl')).toMatchObject([{ event: 'ran', exitCode: 0 }])
    expect(ledgerLines('ledger-wsl.jsonl')).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('WSL 持有、Windows 等待：等待者排队不开始，持有者结束后才开始', async ctx => {
    if (!wsl.ok) ctx.skip(wsl.reason)
    await holdAcross(onWsl, onWindows)
    expect(ledgerLines('ledger-windows.jsonl')).toMatchObject([{ event: 'ran', exitCode: 0 }])
    expect(ledgerLines('ledger-wsl.jsonl')).toMatchObject([{ event: 'ran', exitCode: 0 }])
  })

  it('两侧各 20 个短命令抢同一目录：运行两两不重叠，40 个进程都以 0 退出，账本恰好 40 行 ran', async ctx => {
    if (!wsl.ok) ctx.skip(wsl.reason)
    const runs = join(dir, 'runs')
    const observations = join(dir, 'observations')
    mkdirSync(runs)
    mkdirSync(observations)
    const count = 20
    const windowsSide = Array.from({ length: count }, (_, index) =>
      onWindows(RUN_CODE, [join(runs, `windows-${index}`), observations]),
    )
    // WSL 侧一次起 20 个放到后台，逐个 wait 收退出码；wsl.exe 退出时会杀掉它起的进程，所以要在里面等完。
    const script = [
      wslPrefix(),
      'pids=()',
      `for i in $(seq 1 ${count}); do node ${q(toWsl(SCRIPT))} node -e ${q(RUN_CODE)} ${q(`${wslDir}/runs`)}/wsl-$i ${q(toWsl(observations))} >${q(toWsl(observations))}/wsl-$i.stdout 2>${q(toWsl(observations))}/wsl-$i.stderr & pids+=($!); done`,
      'failures=0; for p in "${pids[@]}"; do wait "$p" || failures=$((failures + 1)); done',
      'echo "failures=$failures"',
    ].join(' && ')
    const [file, args] = wslArgs(script)
    const stopObserving = observeOverlap(runs)
    const wslSide = watch(spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] }))
    const exits = await Promise.all(windowsSide.map(run => run.exited))
    const wslExit = await wslSide.exited
    const seen = stopObserving()
    for (const [index, run] of windowsSide.entries()) {
      writeFileSync(join(observations, `windows-${index}.stdout`), run.stdout())
      writeFileSync(join(observations, `windows-${index}.stderr`), run.stderr())
    }
    const complaints = windowsSide
      .map((run, index) => (exits[index] === 0 ? '' : `windows-${index}：\n${run.stderr()}`))
      .filter(Boolean)
      .join('\n')
    expect(exits, complaints).toEqual(Array.from({ length: count }, () => 0))
    expect(wslExit, wslSide.stderr()).toBe(0)
    expect(wslSide.stdout(), wslSide.stderr()).toContain('failures=0')
    expect(
      readdirSync(observations).filter(name => name.endsWith('.collision')),
      '独立占用哨兵冲突',
    ).toEqual([])
    expect(readdirSync(observations).filter(name => name.endsWith('.json'))).toHaveLength(2 * count)
    expect(existsSync(join(observations, 'active'))).toBe(false)
    // 跨侧：观察者从没同时看到两个在跑。
    expect(seen.overlap, '同时在跑').toEqual([])
    expect(seen.most).toBe(1)
    // 墙钟和单调时钟原值只作诊断。WSL 墙钟会回拨，不按它们排序判互斥。
    const intervals = readdirSync(runs)
      .filter(name => !name.endsWith('.running'))
      .map(name => {
        const [started, ended] = readFileSync(join(runs, name), 'utf8').split(' ').map(Number)
        return { name, started: started ?? Number.NaN, ended: ended ?? Number.NaN }
      })
    expect(intervals).toHaveLength(2 * count)
    for (const side of ['windows', 'wsl']) {
      const own = intervals.filter(run => run.name.startsWith(side))
      expect(own).toHaveLength(count)
      expect(own.every(run => Number.isFinite(run.started) && Number.isFinite(run.ended))).toBe(
        true,
      )
    }
    // 账本仍须恰好 40 行、都以 0 退出，RFC3339 原值保留作诊断。
    const sides = {
      windows: ledgerLines('ledger-windows.jsonl'),
      wsl: ledgerLines('ledger-wsl.jsonl'),
    }
    const ran = [...sides.windows, ...sides.wsl]
    expect(ran).toHaveLength(2 * count)
    expect(ran.every(line => line.event === 'ran' && line.exitCode === 0)).toBe(true)
    expect(
      ran.every(
        line =>
          Number.isFinite(Date.parse(line.acquiredAt ?? '')) &&
          Number.isFinite(Date.parse(line.endedAt)),
      ),
    ).toBe(true)
  })
})
