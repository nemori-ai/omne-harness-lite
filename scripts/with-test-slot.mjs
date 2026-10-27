#!/usr/bin/env node
// 运行名额：同一台机器上同一时刻只让有限个重负载的检查在跑，其余按先来后到排队。
// 多棵工作树、多个 agent 各自起全量测试时，CPU 被压满会让本来能过的用例超时；
// 这里用文件把它们排成队，而不是靠每个调用者自觉。只用 Node 标准库，macOS、Linux、Windows 通用。
//
// 用法：node scripts/with-test-slot.mjs <命令> [参数…]（scripts/with-test-slot.sh 转发到这里）
//
// 策略都可用环境变量覆盖，下面是初值：
//   OMNE_TEST_SLOTS                  名额数（1）
//   OMNE_TEST_SLOT_DIR               锁文件目录（/tmp/omne-test-slots-<uid>，Windows 为系统临时目录下同名目录；同一用户的全部检出共用）
//   OMNE_TEST_SLOT_POLL_SECONDS      没轮到时隔多久再看一次（5）
//   OMNE_TEST_SLOT_MAX_WAIT_SECONDS  最多等多久，超过即以 75 退出、命令不执行（7200）
//   OMNE_TEST_SLOT_LEDGER            运行账本（${XDG_STATE_HOME:-~/.local/state}/omne-test-slots/ledger.jsonl）
//
// 运行账本：每次用完名额、或等到超时放弃，都追加一行 JSON：命令、所属卡号与 attempt、目录、等了多久、占了多久、
// 命令用掉的 CPU 时间、起止时的机器负载、退出码。它给「按任务大小分配名额」（#57 第二步）校准用，
// 所以跟名额同一个范围（同一用户的全部检出与克隆），放在重启也不清的用户状态目录；写不进去只提醒，不改退出码。
//
// 先来后到：进队时领一张票（ticket-<号>，号比队里所有活票都大），名额空出时只有号码最小的活票去拿。
// 票与名额（slot-<序号>.lock）都是独占创建的文件，记着登记它的进程号与心跳间隔；登记者定时刷新修改时间。
// 进程不在了，或心跳停了超过三个间隔，登记就算失效：失效的登记不挡后来者，由下一个看队列的进程删掉。
// 这些文件只在队列锁（queue.lock 目录，mkdir 原子创建）内增删。
// 已经持有名额的进程再调用本脚本（例如 pnpm run check 里嵌着的测试入口）直接放行，不重复排队。
// 名额随持有它的进程退出而释放，被强行杀掉也不会卡死后来者。
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
import { dirname, join, resolve } from 'node:path'

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
// 锁目录不跟 TMPDIR 走：不同的 TMPDIR 会把同一台机器上的调用者分进两个队列。
const user = process.getuid?.() ?? os.userInfo().username
const slotDir =
  env['OMNE_TEST_SLOT_DIR'] ||
  join(process.platform === 'win32' ? os.tmpdir() : '/tmp', `omne-test-slots-${user}`)
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

const commandLine = args.join(' ').replaceAll('\n', ' ')
const unixNow = () => Math.floor(Date.now() / 1000)
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const sleep = seconds => new Promise(settle => setTimeout(settle, seconds * 1000))

/** 票与名额登记同一格式：谁、从何时起、在哪个目录、跑什么命令、多久刷新一次心跳。 */
function describe(beatSeconds) {
  return `pid=${process.pid}\nsince=${unixNow()}\ncwd=${process.cwd()}\ncmd=${commandLine}\nbeat=${beatSeconds}\n`
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

/** 登记还活着：登记它的进程在，心跳也没停太久；失效的顺手删掉。只在队列锁内调用。 */
function alive(path) {
  const entry = fields(path)
  if (entry === undefined) return false
  const pid = Number(entry.pid)
  const beat = Number(entry.beat) || pollSeconds
  let age = 0
  try {
    age = Date.now() / 1000 - statSync(path).mtimeMs / 1000
  } catch {
    return false
  }
  if (
    Number.isSafeInteger(pid) &&
    pid > 0 &&
    (pid === process.pid || processAlive(pid)) &&
    age <= 3 * beat + 5
  )
    return true
  rmSync(path, { force: true })
  return false
}

function createExclusive(path, text) {
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
  return true
}

/** 队列锁：mkdir 是原子的。持有者不在了或停留超过 30 秒就当作失效。 */
function inQueue(work) {
  const lock = join(slotDir, 'queue.lock')
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const owner = fields(join(lock, 'owner'))
      let age = 0
      try {
        age = Date.now() / 1000 - statSync(lock).mtimeMs / 1000
      } catch {
        continue
      }
      const pid = Number(owner?.pid)
      if ((owner !== undefined && !processAlive(pid)) || age > 30)
        rmSync(lock, { recursive: true, force: true })
      else sleepSync(20)
    }
  }
  try {
    createExclusive(join(lock, 'owner'), `pid=${process.pid}\n`)
    return work()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

function duration(seconds) {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
}

/** RFC 3339 本地时刻，带冒号的时区偏移。 */
function jsonTime(seconds) {
  const at = new Date(seconds * 1000)
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

/** 在队列锁内走一轮：清掉失效的票、数出排在前面的活票；第一次来就领票；排到最前就试名额。 */
function takeTurn() {
  let newest = 0
  ahead = 0
  for (const name of readdirSync(slotDir)) {
    const match = /^ticket-(\d+)$/.exec(name)
    if (match === null) continue
    const number = Number(match[1])
    if (number === ticketNumber || !alive(join(slotDir, name))) continue
    newest = Math.max(newest, number)
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
        rmSync(ticket, { force: true })
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
      `名额 ${index}/${slots} 正由「${cmd}」占着，已 ${duration(unixNow() - since)}（${entry.cwd ?? ''}，进程 ${entry.pid ?? ''}）`,
    )
    holderIds.push(`${entry.pid}@${since}`)
  }
}

const HOLDER_BEAT_SECONDS = 5
const started = unixNow()
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
    heldSeconds: event === 'ran' ? run.endedAt - run.acquiredAt : null,
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
  if (ticket !== undefined && acquired === 0) rmSync(ticket, { force: true })
  process.exit(128 + (os.constants.signals[signal] ?? 1))
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, interrupted)

let announced = false
let lastSeen = ''
for (;;) {
  inQueue(takeTurn)
  aheadOnArrival ??= ahead
  waited = unixNow() - started
  if (acquired) break
  if (waited >= maxWaitSeconds) {
    status = 75
    inQueue(() => {
      rmSync(ticket, { force: true })
      record('gave-up', { endedAt: unixNow() })
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
  try {
    const now = new Date()
    utimesSync(ticket, now, now)
  } catch {
    // 票被当作失效删掉了：下一轮重新领一张
    ticketNumber = 0
  }
  await sleep(pollSeconds)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupted)

if (announced)
  process.stderr.write(`with-test-slot: 等了 ${waited} 秒，拿到名额 ${acquired}/${slots}\n`)
const slotPath = join(slotDir, `slot-${acquired}.lock`)
const acquiredAt = unixNow()
const loadAtAcquire = load()
const heartbeat = setInterval(() => {
  try {
    const now = new Date()
    utimesSync(slotPath, now, now)
  } catch {
    // 名额文件不在了：命令照常跑完，结束时不再重复删除
  }
}, HOLDER_BEAT_SECONDS * 1000)
// 不替换本进程：让本进程持有名额直到命令结束，命令留下的后台进程不会把名额带走。
const result = await run(args, { ...process.env, OMNE_TEST_SLOT_HELD: slotPath }, true)
clearInterval(heartbeat)
status = result.status
const endedAt = unixNow()
inQueue(() => {
  rmSync(slotPath, { force: true })
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
  const argv = proc?.wrap(command) ?? command
  const child = spawn(argv[0], argv.slice(1), { stdio: 'inherit', env: childEnv })
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
