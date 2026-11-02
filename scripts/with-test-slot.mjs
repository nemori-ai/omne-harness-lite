#!/usr/bin/env node
// 运行名额：同一台机器上同一时刻只让有限个重负载的检查在跑，其余按先来后到排队。
// 多棵工作树、多个 agent 各自起全量测试时，CPU 被压满会让本来能过的用例超时；
// 这里用文件把它们排成队，而不是靠每个调用者自觉。只用 Node 标准库，macOS、Linux、Windows 通用。
//
// 用法：node scripts/with-test-slot.mjs <命令> [参数…]（scripts/with-test-slot.sh 转发到这里）
// 命令不经 shell 执行。Windows 上 `pnpm` 与 `.sh` 脚本另有起法，见 `launch`。
//
// 策略都可用环境变量覆盖，下面是初值：
//   OMNE_TEST_SLOTS                  名额数（1）
//   OMNE_TEST_SLOT_DIR               锁文件目录（见下面「一个锁目录」；同一用户的全部检出共用）
//   OMNE_TEST_SLOT_POLL_SECONDS      没轮到时隔多久再看一次（5）
//   OMNE_TEST_SLOT_MAX_WAIT_SECONDS  最多等多久，超过即以 75 退出、命令不执行（7200）
//   OMNE_TEST_SLOT_LEDGER            运行账本（${XDG_STATE_HOME:-~/.local/state}/omne-test-slots/ledger.jsonl）
//
// 运行账本：每次用完名额、或等到超时放弃，都追加一行 JSON：命令、所属卡号与 attempt、目录、等了多久、占了多久、
// 命令用掉的 CPU 时间、起止时的机器负载、退出码。它给「按任务大小分配名额」（#57 第二步）校准用，
// 所以跟名额同一个范围（同一用户的全部检出与克隆），放在重启也不清的用户状态目录；写不进去只提醒，不改退出码。
//
// 先来后到：进队时领一张票（ticket-<号>，号比目录里见过的所有票号都大，失效的也算，所以回收后重领的号不会重复），
// 名额空出时只有号码最小的活票去拿。票与名额（slot-<序号>.lock）都是独占创建的文件，记着登记它的进程号、
// 所在侧（side）与心跳间隔；登记者定时刷新修改时间。这些文件只在队列锁（queue.lock 目录，mkdir 原子创建）内增删。
// 已经持有名额的进程再调用本脚本（例如 pnpm run check 里嵌着的测试入口）直接放行，不重复排队。
// 名额随持有它的包装进程退出而释放；POSIX 下杀持有者要杀整棵进程树，否则被包装的命令成孤儿继续跑而名额已释放。
//
// 一个锁目录（#979 D1）：Windows 侧是 os.tmpdir() 下的 omne-test-slots-<用户名>；WSL 侧（有 WSL_DISTRO_NAME）
// 默认解析到同一个物理目录——经 interop 起 PowerShell 取 Windows 侧的临时目录与用户名（Get-Item 给出长名，
// 8.3 短名也转成长名）、在那里建目录与一个探针文件，再 wslpath -u 转成 WSL 路径，看得见探针才算同一个目录。
// 解析失败或同目录判定不成立时回退 /tmp/omne-test-slots-<uid>，并在 stderr 报「WSL 与 Windows 没有共用名额」。
// 其余 POSIX 是 /tmp/omne-test-slots-<uid>。
//
// 分侧判存活：登记写 side=<platform>@<主机名>，WSL 里再加 /<发行版名>。进程号只在同侧判（两侧的进程号空间不同，
// 对侧的号在本侧总是「不存在」）；对侧的登记只看心跳——名额与票停了超过三个间隔，队列锁停留超过 30 秒——就算失效。
// 没有 side 行的旧版登记按同侧处理。失效的登记不挡后来者，由下一个看队列的进程删掉。
// 队列锁与自己的票、名额都只删自己登记的：被别人当作失效删掉又重建的，不再动它。等待者发现自己的票被回收时，
// 在 stderr 提示并重新排队；持有者发现名额文件被删时在 stderr 报一句，命令照常跑完。
// 跨侧判定依赖两侧时钟一致：WSL 时钟落后超过心跳阈值时，对侧活着的持有者会被误删。
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeSync,
} from 'node:fs'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0) {
  process.stderr.write('Usage: with-test-slot <command> [args...]\n')
  process.exit(2)
}

if (process.env['OMNE_TEST_SLOT_HELD'])
  process.exit(await run(args, process.env, false).then(r => r.status))

const env = process.env
const integer = name => {
  const value = env[name.env] ?? name.initial
  if (!/^[0-9]+$/.test(value)) {
    process.stderr.write(`with-test-slot: ${name.label}=${value} 须为非负整数\n`)
    process.exit(2)
  }
  return Number(value)
}
const slots = integer({ env: 'OMNE_TEST_SLOTS', initial: '1', label: 'slots' })
const pollSeconds = integer({
  env: 'OMNE_TEST_SLOT_POLL_SECONDS',
  initial: '5',
  label: 'poll_seconds',
})
const maxWaitSeconds = integer({
  env: 'OMNE_TEST_SLOT_MAX_WAIT_SECONDS',
  initial: '7200',
  label: 'max_wait_seconds',
})
if (slots < 1 || pollSeconds < 1) {
  process.stderr.write('with-test-slot: 名额数与轮询间隔须至少为 1\n')
  process.exit(2)
}
/** 本进程所在的侧：平台@主机名，WSL 里再加发行版名。登记里写它，判存活时按它决定进程号判不判。 */
const SIDE = `${process.platform}@${os.hostname()}${env['WSL_DISTRO_NAME'] ? `/${env['WSL_DISTRO_NAME']}` : ''}`
// 锁目录不跟 TMPDIR 走：不同的 TMPDIR 会把同一台机器上的调用者分进两个队列。
const user = process.getuid?.() ?? os.userInfo().username
const slotDir = env['OMNE_TEST_SLOT_DIR'] || defaultSlotDir()
const ledger =
  env['OMNE_TEST_SLOT_LEDGER'] ||
  join(
    env['XDG_STATE_HOME'] || join(env['HOME'] || os.homedir(), '.local', 'state'),
    'omne-test-slots',
    'ledger.jsonl',
  )
mkdirSync(slotDir, { recursive: true })
try {
  mkdirSync(dirname(ledger), { recursive: true })
} catch {
  // 写账本时再提醒
}

/** 本侧的默认锁目录；WSL 里先试 Windows 侧的同一个目录，不成再回退并提醒。 */
function defaultSlotDir() {
  const own = join(process.platform === 'win32' ? os.tmpdir() : '/tmp', `omne-test-slots-${user}`)
  if (!env['WSL_DISTRO_NAME']) return own
  const shared = windowsSlotDir()
  if (shared.dir !== undefined) return shared.dir
  process.stderr.write(
    `with-test-slot: WSL 与 Windows 没有共用名额（${shared.reason}），这次用 ${own}\n`,
  )
  return own
}

/**
 * WSL 里解析 Windows 侧的默认锁目录。经 interop 起 Windows PowerShell：取 %TEMP% 的长名、拼上 omne-test-slots-%USERNAME%、
 * 建目录、清掉 10 分钟前留下的探针、建一个以本进程号命名的探针文件，再报出目录。这边 wslpath -u 转成 WSL 路径，
 * 在那里看得见探针才算同一个目录，看完即删。任何一步不成都给出原因，由调用方回退。
 */
function windowsSlotDir() {
  const powershell = wslpath('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  if (powershell === undefined) return { reason: 'wslpath 不可用' }
  if (!existsSync(powershell)) return { reason: `${powershell} 不存在` }
  const probe = `.omne-probe-${process.pid}`
  const script = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    "$ErrorActionPreference = 'Stop'",
    "$dir = Join-Path (Get-Item -LiteralPath $env:TEMP).FullName ('omne-test-slots-' + $env:USERNAME)",
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    "Get-ChildItem -LiteralPath $dir -Filter '.omne-probe-*' -Force | Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-10) } | Remove-Item -Force",
    `New-Item -ItemType File -Force -Path (Join-Path $dir '${probe}') | Out-Null`,
    'Write-Output $dir',
  ].join('; ')
  // Windows PowerShell 5.1 的 New-Item 没有 -LiteralPath，这里用 -Path；它不展开通配符。
  const output = interop(powershell, ['-NoProfile', '-NonInteractive', '-Command', script])
  if (output.reason !== undefined) return output
  const windowsDir = output.stdout.trim().split(/\r?\n/).at(-1) ?? ''
  if (!/^[A-Za-z]:\\/.test(windowsDir))
    return { reason: `PowerShell 没有报出 Windows 侧的目录：${windowsDir || '（空）'}` }
  const dir = wslpath(windowsDir)
  if (dir === undefined) return { reason: `wslpath 转不了 ${windowsDir}` }
  const probePath = join(dir, probe)
  if (!existsSync(probePath))
    return { reason: `Windows 在 ${windowsDir} 建的文件在 ${dir} 下看不见` }
  rmSync(probePath, { force: true })
  return { dir }
}

/** Windows 路径在 WSL 里的路径；wslpath 不可用或转不了时为 undefined。 */
function wslpath(windowsPath) {
  const result = spawnSync('wslpath', ['-u', windowsPath], { encoding: 'utf8', timeout: 10_000 })
  if (result.status !== 0 || typeof result.stdout !== 'string') return undefined
  const path = result.stdout.trim()
  return path === '' ? undefined : path
}

/**
 * 在 WSL 里起一个 Windows 程序，取它的标准输出。binfmt 登记了 WSLInterop 时直接起，内核会交给 /init；
 * 没登记（systemd 启用后登记常被清掉；直接起会被 execvp 当作 shell 脚本交给 /bin/sh）时显式经 /init 起。
 * 当前目录放在程序所在的 Windows 目录，免得 Windows 程序对 UNC 形式的 WSL 当前目录报警。
 */
function interop(file, args) {
  const launcher = interopLauncher()
  const [exe, ...argv] = [...launcher, file, ...args]
  const result = spawnSync(exe, argv, {
    encoding: 'utf8',
    cwd: dirname(file),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  })
  if (result.error === undefined && result.status === 0) return { stdout: result.stdout }
  const how = launcher.length === 0 ? '' : '（经 /init）'
  const why =
    result.error !== undefined
      ? result.error.message
      : `退出码 ${result.status}${result.stderr.trim() === '' ? '' : `，${result.stderr.trim().split(/\r?\n/)[0]}`}`
  return { reason: `${basename(file)} 起不来${how}：${why}` }
}

/** 起 Windows 程序要不要经 /init：binfmt_misc 里有 WSLInterop 登记就不用；没登记而 /init 在，就经它。 */
function interopLauncher() {
  try {
    if (readdirSync('/proc/sys/fs/binfmt_misc').some(name => name.startsWith('WSLInterop')))
      return []
  } catch {
    // 没有 binfmt_misc：按没登记算
  }
  return existsSync('/init') ? ['/init'] : []
}

const commandLine = args.join(' ').replaceAll('\n', ' ')
const unixNow = () => Math.floor(Date.now() / 1000)
// 账本里的时刻按毫秒取、经过的时长按毫秒相减后再取整秒：先各自取整再相减，跨过整秒边界的几毫秒会被记成 1 秒。
const wholeSeconds = ms => Math.floor(ms / 1000)
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const sleep = seconds => new Promise(settle => setTimeout(settle, seconds * 1000))

/**
 * 票与名额登记同一格式：谁、在哪一侧、从何时起、在哪个目录、跑什么命令、多久刷新一次心跳。
 * `since` 保持整秒：别的进程（包括旧版本的本脚本）按整秒读它，它只用于排队提示里的「已 N 秒」，不进账本。
 */
function describe(beatSeconds) {
  return `pid=${process.pid}\nside=${SIDE}\nsince=${unixNow()}\ncwd=${process.cwd()}\ncmd=${commandLine}\nbeat=${beatSeconds}\n`
}

function fields(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .filter(line => line.includes('='))
        .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    )
  } catch {
    return undefined
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** 登记在本侧：side 与本进程相同；没有 side 行的旧版登记也算本侧。 */
const sameSide = entry => entry.side === undefined || entry.side === SIDE

/** 登记是本进程自己写的。 */
const mine = entry => entry !== undefined && Number(entry.pid) === process.pid && sameSide(entry)

/** 登记里的进程还在：同侧按进程号判；对侧判不了进程号，只要登记在就算在。 */
function registrantPresent(entry) {
  if (!sameSide(entry)) return true
  const pid = Number(entry.pid)
  return Number.isSafeInteger(pid) && pid > 0 && (pid === process.pid || processAlive(pid))
}

/** 登记还活着：登记它的进程在（同侧才判），心跳也没停太久；失效的顺手删掉。只在队列锁内调用。 */
function alive(path) {
  const entry = fields(path)
  if (entry === undefined) return false
  const beat = Number(entry.beat) || pollSeconds
  let age = 0
  try {
    age = Date.now() / 1000 - statSync(path).mtimeMs / 1000
  } catch {
    return false
  }
  if (registrantPresent(entry) && age <= 3 * beat + 5) return true
  remove(path)
  return false
}

/** 刷新自己登记的心跳。登记不在了、或已被别人重新登记（票被回收后号被重发），返回 false。 */
function beatOwn(path) {
  if (!mine(fields(path))) return false
  try {
    const now = new Date()
    utimesSync(path, now, now)
    return true
  } catch {
    return false
  }
}

/** 删掉自己的登记；已经不是自己的（被回收又被别人登记）就不动。 */
function removeOwn(path) {
  if (mine(fields(path))) remove(path)
}

/**
 * 删一份登记文件。对侧正读着它时 NTFS 经 9p 可能拒绝（EPERM、EBUSY）：这次删不掉就留着，
 * 它仍是失效的，下一个看队列的进程再删。
 */
function remove(path) {
  try {
    rmSync(path, { force: true })
  } catch {
    // 下一轮再删
  }
}

/**
 * 独占创建登记文件。已存在时为 false；对侧刚删了同名文件、NTFS 还处在待删除状态时也会被拒（EPERM、EACCES、EBUSY），
 * 同样算没创建成，由调用方换下一个号或下一轮再试。
 */
function createExclusive(path, text) {
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return false
    if (error.code !== 'ENOENT') throw error
    // 锁目录没了（或对侧刚删过同名文件、9p 一时报找不到）：补建目录再试一次
    mkdirSync(dirname(path), { recursive: true })
    try {
      fd = openSync(path, 'wx')
    } catch (again) {
      if (['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(again.code)) return false
      throw again
    }
  }
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
  return true
}

/** 删整个队列锁目录；对侧正在里面读写时 NTFS 经 9p 会先拒绝，照 Node 的退避重试几次。 */
function removeQueueLock(lock) {
  rmSync(lock, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 })
}

/**
 * 队列锁：mkdir 是原子的。持有者是同侧且进程不在了，或停留超过 30 秒，就当作失效；对侧的持有者只看停留时间。
 * 目录刚建好就被别人删了（旧版脚本在对侧把本侧的进程号当作不存在）时，重新去拿。
 * 收尾只删 owner 还是自己的锁：被别人当作失效删掉又重建的，是别人的。自己的锁删不掉时提醒一句，
 * 它会在 30 秒后由下一个看队列的进程回收，不改命令的退出码。
 */
function inQueue(work) {
  const lock = join(slotDir, 'queue.lock')
  const ownerPath = join(lock, 'owner')
  let refusals = 0
  for (;;) {
    try {
      mkdirSync(lock)
    } catch (error) {
      if (['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY', 'ENOENT'].includes(error.code)) {
        // 对侧刚删掉同名目录、NTFS 还处在待删除状态（Windows 报 EPERM，WSL 经 9p 报 ENOENT）：稍等再试；
        // 锁目录真的没了就重建它。一直被拒就不是这种情形，照常抛出
        if ((refusals += 1) > 250) throw error
        if (error.code === 'ENOENT') mkdirSync(slotDir, { recursive: true })
        sleepSync(20)
        continue
      }
      if (error.code !== 'EEXIST') throw error
      const owner = fields(ownerPath)
      let age = 0
      try {
        age = Date.now() / 1000 - statSync(lock).mtimeMs / 1000
      } catch {
        continue
      }
      const gone = owner !== undefined && sameSide(owner) && !processAlive(Number(owner.pid))
      if (!gone && age <= 30) {
        sleepSync(20)
        continue
      }
      try {
        removeQueueLock(lock)
      } catch {
        // 别人同时在动它：再看一遍
      }
      continue
    }
    try {
      createExclusive(ownerPath, `pid=${process.pid}\nside=${SIDE}\n`)
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  try {
    return work()
  } finally {
    if (mine(fields(ownerPath)))
      try {
        removeQueueLock(lock)
      } catch (error) {
        process.stderr.write(
          `with-test-slot: 队列锁 ${lock} 删不掉（${error.code}），30 秒后由下一个看队列的进程回收\n`,
        )
      }
  }
}

function duration(seconds) {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
}

/** RFC 3339 本地时刻（精确到秒），带冒号的时区偏移；参数是毫秒时刻。 */
function jsonTime(ms) {
  const at = new Date(ms)
  const pad = n => String(n).padStart(2, '0')
  const offset = -at.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  )
}

const load = () => os.loadavg().map(value => Math.round(value * 100) / 100)

/**
 * 当前目录所在工作树的 task context（git 目录下的 omne-integration-context.json，由 dev-flow 的 start 写入）
 * 里最后一项任务的卡号与 attempt。账本只借它归卡：任何一步不成立都记 null，不报错、不改退出码。
 */
function currentTask() {
  const none = { issue: null, attempt: null }
  try {
    const git = spawnSync('git', ['rev-parse', '--git-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    })
    if (git.status !== 0 || typeof git.stdout !== 'string') return none
    const gitDir = resolve(process.cwd(), git.stdout.trim())
    const tasks = JSON.parse(
      readFileSync(join(gitDir, 'omne-integration-context.json'), 'utf8'),
    )?.tasks
    const binding = Array.isArray(tasks) ? tasks.at(-1)?.binding : undefined
    const issue = binding?.issue?.number
    const attempt = binding?.attempt
    if (!Number.isSafeInteger(issue) || issue < 1 || typeof attempt !== 'string' || attempt === '')
      return none
    return { issue, attempt }
  } catch {
    return none
  }
}
const task = currentTask()

let ticket
let ticketNumber = 0
let acquired = 0
let ahead = 0
let holders = []
let holderIds = []

/**
 * 在队列锁内走一轮：数出目录里见过的最大票号（失效的也算，重领的号才不会重复）、清掉失效的票、
 * 数出排在前面的活票；第一次来就领票；排到最前就试名额。
 */
function takeTurn() {
  let newest = 0
  ahead = 0
  for (const name of readdirSync(slotDir)) {
    const match = /^ticket-(\d+)$/.exec(name)
    if (match === null) continue
    const number = Number(match[1])
    newest = Math.max(newest, number)
    if (number === ticketNumber || !alive(join(slotDir, name))) continue
    if (ticketNumber === 0 || number < ticketNumber) ahead += 1
  }
  if (ticketNumber === 0) {
    for (ticketNumber = newest + 1; ; ticketNumber += 1) {
      ticket = join(slotDir, `ticket-${ticketNumber}`)
      if (createExclusive(ticket, describe(pollSeconds))) break
    }
  }
  if (ahead === 0)
    for (let index = 1; index <= slots; index += 1) {
      const path = join(slotDir, `slot-${index}.lock`)
      if (existsSync(path) && alive(path)) continue
      if (createExclusive(path, describe(HOLDER_BEAT_SECONDS))) {
        removeOwn(ticket)
        acquired = index
        return
      }
    }
  holders = []
  holderIds = []
  for (let index = 1; index <= slots; index += 1) {
    const path = join(slotDir, `slot-${index}.lock`)
    if (!existsSync(path) || !alive(path)) continue
    const entry = fields(path) ?? {}
    const since = /^\d+$/.test(entry.since ?? '') ? Number(entry.since) : unixNow()
    let cmd = entry.cmd ?? ''
    if (cmd.length > 160) cmd = `${cmd.slice(0, 160)}…`
    holders.push(
      `名额 ${index}/${slots} 正由「${cmd}」占着，已 ${duration(Math.max(0, unixNow() - since))}（${entry.cwd ?? ''}，进程 ${entry.pid ?? ''}，${entry.side ?? SIDE}）`,
    )
    holderIds.push(`${entry.pid}@${since}`)
  }
}

const HOLDER_BEAT_SECONDS = 5
const started = Date.now()
let aheadOnArrival
let waited = 0
let status = 0

/** 往运行账本追加一行；只在队列锁内调用，各进程的行不会交错。 */
function record(event, run) {
  const line = {
    event,
    command: commandLine.slice(0, 500),
    issue: task.issue,
    attempt: task.attempt,
    cwd: process.cwd(),
    pid: process.pid,
    cores: os.availableParallelism?.() ?? os.cpus().length,
    slots,
    aheadOnArrival,
    arrivedAt: jsonTime(started),
    waitSeconds: waited,
    slot: event === 'ran' ? acquired : null,
    acquiredAt: event === 'ran' ? jsonTime(run.acquiredAt) : null,
    heldSeconds: event === 'ran' ? wholeSeconds(run.endedAt - run.acquiredAt) : null,
    cpuSeconds: event === 'ran' ? run.cpuSeconds : null,
    loadAtAcquire: event === 'ran' ? run.loadAtAcquire : null,
    endedAt: jsonTime(run.endedAt),
    loadAtEnd: load(),
    exitCode: status,
  }
  try {
    appendFileSync(ledger, `${JSON.stringify(line)}\n`)
  } catch {
    process.stderr.write(`with-test-slot: 运行账本写不进 ${ledger}，这次没记\n`)
  }
}

// 等待时被打断：交还票再退出。
const interrupted = signal => {
  if (ticket !== undefined && acquired === 0) removeOwn(ticket)
  process.exit(128 + (os.constants.signals[signal] ?? 1))
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, interrupted)

let announced = false
let lastSeen = ''
let recycled = false
for (;;) {
  inQueue(takeTurn)
  aheadOnArrival ??= ahead
  waited = wholeSeconds(Date.now() - started)
  if (recycled) {
    process.stderr.write(`with-test-slot: 票被回收，重新排队（前面还有 ${ahead} 个）\n`)
    recycled = false
    lastSeen = ''
  }
  if (acquired) break
  if (waited >= maxWaitSeconds) {
    status = 75
    inQueue(() => {
      removeOwn(ticket)
      record('gave-up', { endedAt: Date.now() })
    })
    process.stderr.write(
      `with-test-slot: 等了 ${waited} 秒仍没轮到（前面还有 ${ahead} 个，共 ${slots} 个名额，锁在 ${slotDir}），命令没有执行\n`,
    )
    process.exit(75)
  }
  const seen = `${ahead}|${holderIds.join(' ')}`
  if (seen !== lastSeen) {
    if (!announced) {
      process.stderr.write(
        `with-test-slot: 排队中，前面还有 ${ahead} 个（共 ${slots} 个名额；每 ${pollSeconds} 秒看一次，最多等 ${maxWaitSeconds} 秒）\n`,
      )
      announced = true
    } else process.stderr.write(`with-test-slot: 前面还有 ${ahead} 个\n`)
    for (const line of holders) process.stderr.write(`with-test-slot:   ${line}\n`)
    lastSeen = seen
  }
  if (!beatOwn(ticket)) {
    // 票被当作失效删掉了（号可能已经发给别人）：下一轮重新领一张，领到后提示
    ticketNumber = 0
    recycled = true
  }
  await sleep(pollSeconds)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupted)

if (announced)
  process.stderr.write(`with-test-slot: 等了 ${waited} 秒，拿到名额 ${acquired}/${slots}\n`)
const slotPath = join(slotDir, `slot-${acquired}.lock`)
const acquiredAt = Date.now()
const loadAtAcquire = load()
let noticedGone = false
const heartbeat = setInterval(() => {
  if (beatOwn(slotPath) || noticedGone) return
  // 名额文件被别人当作失效删掉了（对侧时钟偏差、或被手工清理）：命令照常跑完，结束时不再删它。
  noticedGone = true
  process.stderr.write(
    `with-test-slot: 名额文件被删（${slotPath}），本进程的登记被当作失效；命令照常跑完，但别的等待者可能已经开始\n`,
  )
}, HOLDER_BEAT_SECONDS * 1000)
// 不替换本进程：让本进程持有名额直到命令结束，命令留下的后台进程不会把名额带走。
const result = await run(args, { ...process.env, OMNE_TEST_SLOT_HELD: slotPath }, true)
clearInterval(heartbeat)
status = result.status
const endedAt = Date.now()
inQueue(() => {
  removeOwn(slotPath)
  record('ran', { acquiredAt, endedAt, cpuSeconds: result.cpuSeconds, loadAtAcquire })
})
process.exit(status)

/**
 * 跑命令，透传标准输入输出与退出码；被信号结束时按 shell 的习惯返回 128 加信号号。
 * `measure` 时另量命令自己用掉的 CPU：Linux 读本进程已回收子进程的累计时间，macOS 等其余 POSIX 系统
 * 经 /usr/bin/time，Windows 量不到时记 null。
 */
async function run(command, childEnv, measure) {
  const proc = measure ? cpuMeter() : undefined
  let started
  try {
    started = launch(proc?.wrap(command) ?? command, childEnv)
  } catch (error) {
    process.stderr.write(`with-test-slot: ${command[0]}: ${error.message}\n`)
    return { status: 127, cpuSeconds: null }
  }
  const child = spawn(started.file, started.args, {
    stdio: 'inherit',
    env: childEnv,
    ...started.options,
  })
  const forward = signal => child.kill(signal)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, forward)
  const code = await new Promise(settle => {
    child.once('error', error => {
      process.stderr.write(`with-test-slot: ${command[0]}: ${error.message}\n`)
      settle(error.code === 'ENOENT' ? 127 : 126)
    })
    child.once('exit', (exitCode, signal) =>
      settle(exitCode ?? 128 + (os.constants.signals[signal] ?? 1)),
    )
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, forward)
  return { status: code, cpuSeconds: proc?.read() ?? null }
}

/**
 * 实际起的程序、参数与另加的 spawn 选项。POSIX 上原样起。Windows 上 Node 不经 shell 只能起 `.exe`，所以有两种命令另起：
 * - `pnpm`（或 `pnpm.cmd`）：按 PATH 顺序找。先遇到 `pnpm.exe` 就直接起它（独立安装的布局）。先遇到旁边有
 *   `node_modules/pnpm/bin/pnpm.cjs` 的 `pnpm.cmd`（npm 全局安装的布局），就用本进程的 Node 运行那个 `pnpm.cjs`：
 *   直接起 `pnpm` 报 ENOENT，起 `pnpm.cmd` 报 EINVAL。旁边没有 `pnpm.cjs` 的 `pnpm.cmd` 跳过。与 dev-flow 的 `pnpmCommand` 相同。
 * - 以 `.sh` 结尾的命令：直接起报 EFTYPE。改为经 Git for Windows 的 bash 运行，bash 按 `git --exec-path`
 *   （`<Git>/<mingw64>/libexec/git-core`）往上三级找 `bin/bash.exe`，不取 PATH 里的 `bash`，因为那可能是 WSL 的启动器。
 *   这个 bash 被非 MSYS 进程起时，自己解析命令行，并展开没加双引号的参数（通配符、花括号、`~`、单引号）。
 *   所以每个参数都由 `msysQuote` 加上双引号，命令行原样交给 bash（`windowsVerbatimArguments`），参数原样到达脚本。
 * 找不到时抛错，不尝试其他位置。其余命令原样起。
 */
function launch(argv, childEnv) {
  const [command, ...rest] = argv
  if (process.platform !== 'win32') return { file: command, args: rest, options: {} }
  if (/^pnpm(\.cmd)?$/i.test(command)) {
    const seen = []
    for (const directory of (childEnv['PATH'] ?? childEnv['Path'] ?? '').split(';')) {
      if (directory === '') continue
      const exe = join(directory, 'pnpm.exe')
      if (existsSync(exe)) return { file: exe, args: rest, options: {} }
      if (!existsSync(join(directory, 'pnpm.cmd'))) continue
      const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
      if (existsSync(entry)) return { file: process.execPath, args: [entry, ...rest], options: {} }
      seen.push(join(directory, 'pnpm.cmd'))
    }
    throw new Error(
      seen.length === 0
        ? 'PATH 里没有 pnpm.exe，也没有 pnpm.cmd'
        : `PATH 里没有 pnpm.exe，${seen.join('、')} 旁边都没有 node_modules/pnpm/bin/pnpm.cjs，起不了 pnpm`,
    )
  }
  if (/\.sh$/i.test(command)) {
    const git = spawnSync('git', ['--exec-path'], { encoding: 'utf8' })
    const execPath = git.status === 0 ? git.stdout.trim() : ''
    const bash = execPath === '' ? '' : join(resolve(execPath), '..', '..', '..', 'bin', 'bash.exe')
    if (bash === '' || !existsSync(bash))
      throw new Error(
        `起 .sh 要 Git for Windows 的 bash，没找到（git --exec-path：${execPath || '读不到'}）`,
      )
    // 命令行整条由这里拼好：Node 不再加引号，第一项也要自己加。
    return {
      file: bash,
      args: [[command, ...rest].map(msysQuote).join(' ')],
      options: { windowsVerbatimArguments: true, argv0: msysQuote(bash) },
    }
  }
  return { file: command, args: rest, options: {} }
}

/**
 * MSYS 的命令行解析读双引号内的参数时，不展开通配符等，`\\` 读作 `\`，`\"` 读作 `"`，其余字符原样。
 * 所以把参数里的每个 `\` 与 `"` 前加一个 `\`，再整个加双引号。
 */
function msysQuote(value) {
  return `"${value.replaceAll(/[\\"]/g, '\\$&')}"`
}

function cpuMeter() {
  if (process.platform === 'linux' && existsSync('/proc/self/stat')) {
    const ticks =
      Number(spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).stdout.trim()) || 100
    const children = () => {
      const fieldsAfterName = readFileSync('/proc/self/stat', 'utf8').split(') ')[1].split(' ')
      return Number(fieldsAfterName[13]) + Number(fieldsAfterName[14])
    }
    const before = children()
    return {
      wrap: command => command,
      read: () => Math.round(((children() - before) / ticks) * 100) / 100,
    }
  }
  if (process.platform !== 'win32' && existsSync('/usr/bin/time')) {
    const file = join(mkdtempSync(join(os.tmpdir(), 'omne-slot-time-')), 'time')
    return {
      wrap: command => ['/usr/bin/time', '-p', '-o', file, ...command],
      read: () => {
        try {
          const text = readFileSync(file, 'utf8')
          const value = name =>
            Number(new RegExp(`^${name}\\s+([0-9.]+)`, 'm').exec(text)?.[1] ?? 0)
          return Math.round((value('user') + value('sys')) * 100) / 100
        } catch {
          return null
        } finally {
          rmSync(dirname(file), { recursive: true, force: true })
        }
      },
    }
  }
  return { wrap: command => command, read: () => null }
}
