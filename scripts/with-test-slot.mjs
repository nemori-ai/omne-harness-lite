#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = [
  'Usage: with-test-slot [--want <n>] [--min <n>] [--] <command> [args...]',
  'Runs the command when it holds cores from the machine token pool, in arrival order, and returns its exit code. The command does not run through a shell.',
  'The pool has C = max(1, cores - parallel.reserveCores) tokens (tools/test-runner/test-runs.config.json). Only the head of the queue takes tokens:',
  'it takes min(want, free) tokens when at least min tokens are free, and keeps them until the command ends. Default want is C, default min is 1.',
  'The command gets the number of tokens in OMNE_WORKER_BUDGET. A process that already holds tokens (OMNE_TEST_SLOT_HELD) runs the command at once.',
  'Environment:',
  '  OMNE_TEST_SLOT_CAPACITY          tokens on this machine (default from the core count; set the same value for every caller on the machine)',
  '  OMNE_TEST_SLOT_DIR               lock directory (default omne-core-tokens-<user> in the Windows temp directory, shared with WSL; /tmp/omne-core-tokens-<uid> on other POSIX hosts)',
  '  OMNE_TEST_SLOT_POLL_SECONDS      seconds between queue checks (default 5)',
  '  OMNE_TEST_SLOT_MAX_WAIT_SECONDS  longest wait (default 7200)',
  '  OMNE_TEST_SLOT_LEDGER            token ledger, one JSON line per use (default ${XDG_STATE_HOME:-~/.local/state}/omne-test-slots/ledger.jsonl)',
  'Exit 75: the wait timed out and the command did not run. Exit 127 on Windows: no pnpm or no Git bash was found. Exit 2: usage error.',
  'To stop a run that holds tokens on POSIX, kill the whole process group. Rules: tools/test-runner/SPEC.md.',
  '',
].join('\n')

const request = parseRequest(process.argv.slice(2))
if (request.error !== undefined) {
  process.stderr.write(`with-test-slot: ${request.error}\n${USAGE}`)
  process.exit(2)
}
const args = request.command

if (process.env['OMNE_TEST_SLOT_HELD'])
  process.exit(await run(args, process.env, false).then(r => r.status))

function parseRequest(argv) {
  const numbers = {}
  let index = 0
  for (; index < argv.length; index += 2) {
    const flag = argv[index]
    if (flag !== '--want' && flag !== '--min') break
    const value = argv[index + 1]
    if (value === undefined || !/^[1-9][0-9]*$/.test(value))
      return { error: `${flag} 须跟一个正整数，现在是 ${value ?? '（缺）'}` }
    numbers[flag.slice(2)] = Number(value)
  }
  if (argv[index] === '--') index += 1
  const command = argv.slice(index)
  if (command.length === 0) return { error: '没给命令' }
  const { want, min } = numbers
  if (want !== undefined && min !== undefined && min > want)
    return { error: `--min ${min} 大于 --want ${want}` }
  return { want, min, command }
}

function grant({ head, free, want, min }) {
  return head && free >= min ? Math.min(want, free) : 0
}

const now = () => Date.now()

const env = process.env
const integer = name => {
  const value = env[name.env] ?? name.initial
  if (!/^[0-9]+$/.test(value)) {
    process.stderr.write(`with-test-slot: ${name.label}=${value} 须为非负整数\n`)
    process.exit(2)
  }
  return Number(value)
}

function reserveCores() {
  const config = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'tools',
    'test-runner',
    'test-runs.config.json',
  )
  try {
    const value = JSON.parse(readFileSync(config, 'utf8'))?.parallel?.reserveCores
    if (Number.isSafeInteger(value) && value >= 0) return value
  } catch {}
  process.stderr.write(`with-test-slot: 读不到 ${config} 的 parallel.reserveCores，按 2 算\n`)
  return 2
}

const capacity = env['OMNE_TEST_SLOT_CAPACITY']
  ? integer({ env: 'OMNE_TEST_SLOT_CAPACITY', initial: '1', label: 'capacity' })
  : Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - reserveCores())
const want = request.want ?? capacity
const min = Math.min(request.min ?? 1, capacity, want)
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
if (capacity < 1 || pollSeconds < 1) {
  process.stderr.write('with-test-slot: 令牌数与轮询间隔须至少为 1\n')
  process.exit(2)
}
const SIDE = `${process.platform}@${os.hostname()}${env['WSL_DISTRO_NAME'] ? `/${env['WSL_DISTRO_NAME']}` : ''}`
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
} catch {}

function defaultSlotDir() {
  const own = join(process.platform === 'win32' ? os.tmpdir() : '/tmp', `omne-core-tokens-${user}`)
  if (!env['WSL_DISTRO_NAME']) return own
  const shared = windowsSlotDir()
  if (shared.dir !== undefined) return shared.dir
  process.stderr.write(
    `with-test-slot: WSL 与 Windows 没有共用令牌池（${shared.reason}），这次用 ${own}\n`,
  )
  return own
}

function windowsSlotDir() {
  const powershell = wslpath('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  if (powershell === undefined) return { reason: 'wslpath 不可用' }
  if (!existsSync(powershell)) return { reason: `${powershell} 不存在` }
  const probe = `.omne-probe-${process.pid}`
  const script = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    "$ErrorActionPreference = 'Stop'",
    "$dir = Join-Path (Get-Item -LiteralPath $env:TEMP).FullName ('omne-core-tokens-' + [Environment]::UserName)",
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    "Get-ChildItem -LiteralPath $dir -Filter '.omne-probe-*' -Force | Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-10) } | Remove-Item -Force",
    `New-Item -ItemType File -Force -Path (Join-Path $dir '${probe}') | Out-Null`,
    'Write-Output $dir',
  ].join('; ')
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

function wslpath(windowsPath) {
  const result = spawnSync('wslpath', ['-u', windowsPath], { encoding: 'utf8', timeout: 10_000 })
  if (result.status !== 0 || typeof result.stdout !== 'string') return undefined
  const path = result.stdout.trim()
  return path === '' ? undefined : path
}

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

function interopLauncher() {
  try {
    if (readdirSync('/proc/sys/fs/binfmt_misc').some(name => name.startsWith('WSLInterop')))
      return []
  } catch {}
  return existsSync('/init') ? ['/init'] : []
}

const commandLine = args.join(' ').replaceAll('\n', ' ')
const unixNow = () => Math.floor(now() / 1000)
const wholeSeconds = ms => Math.floor(ms / 1000)
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const sleep = seconds => new Promise(settle => setTimeout(settle, seconds * 1000))

function describe(beatSeconds) {
  return `version=2\npid=${process.pid}\nside=${SIDE}\nsince=${unixNow()}\ncwd=${process.cwd()}\ncmd=${commandLine}\nbeat=${beatSeconds}\n`
}

function fields(path) {
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.endsWith('\n')) return null
    const entry = Object.fromEntries(
      text
        .split('\n')
        .filter(line => line.includes('='))
        .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    )
    const pid = Number(entry.pid)
    if (!Number.isSafeInteger(pid) || pid < 1) return null
    if (entry.side !== undefined && entry.side === '') return null
    if (
      !/^\d+$/.test(entry.since ?? '') ||
      !entry.cwd ||
      !entry.cmd ||
      !/^\d+$/.test(entry.beat ?? '') ||
      Number(entry.beat) < 1 ||
      (entry.version !== undefined && (entry.version !== '2' || !entry.side))
    )
      return null
    return entry
  } catch (error) {
    return error.code === 'ENOENT' ? undefined : null
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

const sameSide = entry => entry.side === undefined || entry.side === SIDE

const mine = entry => entry != null && Number(entry.pid) === process.pid && sameSide(entry)

function registrantPresent(entry) {
  if (!sameSide(entry)) return true
  const pid = Number(entry.pid)
  return Number.isSafeInteger(pid) && pid > 0 && (pid === process.pid || processAlive(pid))
}

function alive(path) {
  const entry = fields(path)
  if (entry === undefined) return false
  if (entry === null) return true
  const beat = Number(entry.beat) || pollSeconds
  const age = ageOf(path)
  if (age === undefined) return false
  if (registrantPresent(entry) && age <= 3 * beat + 5) return true
  remove(path)
  return false
}

function releaseTokens(entries) {
  for (const entry of entries) leave(entry)
}

const OWNER_ENTRY = /^owner-\d+-[0-9a-f]+$/

const freshEntry = () => `owner-${process.pid}-${randomBytes(8).toString('hex')}`

function owners(directory) {
  try {
    return readdirSync(directory).filter(name => OWNER_ENTRY.test(name))
  } catch {
    return []
  }
}

function removeIfEmpty(directory) {
  try {
    rmdirSync(directory)
  } catch {}
}

function reap(directory, name) {
  remove(join(directory, name))
  removeIfEmpty(directory)
}

function enter(directory, beatSeconds) {
  try {
    mkdirSync(directory)
  } catch (error) {
    if (error.code === 'EEXIST') return 'taken'
    if (['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY', 'ENOENT'].includes(error.code)) {
      if (error.code === 'ENOENT') mkdirSync(slotDir, { recursive: true })
      return 'retry'
    }
    throw error
  }
  const entry = join(directory, freshEntry())
  if (!createExclusive(entry, describe(beatSeconds))) {
    removeIfEmpty(directory)
    return 'retry'
  }
  if (owners(directory).length === 1) return entry
  leave(entry)
  return 'retry'
}

function leave(entry) {
  remove(entry)
  removeIfEmpty(dirname(entry))
}

function ageOf(path) {
  try {
    return (now() - statSync(path).mtimeMs) / 1000
  } catch {
    return undefined
  }
}

function beatOwn(path) {
  if (!mine(fields(path))) return false
  try {
    const at = new Date(now())
    utimesSync(path, at, at)
    return true
  } catch {
    return false
  }
}

function removeOwn(path) {
  if (mine(fields(path))) remove(path)
}

function remove(path) {
  try {
    rmSync(path, { force: true })
  } catch {}
}

function createExclusive(path, text) {
  let fd
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if (['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return false
    if (error.code === 'ENOENT') return false
    throw error
  }
  try {
    writeFileSync(fd, text)
  } finally {
    closeSync(fd)
  }
  return true
}

const QUEUE_LOCK_STALE_SECONDS = 30

function inQueue(work) {
  const lock = join(slotDir, 'queue.lock')
  let refusals = 0
  let entry
  for (;;) {
    const entered = enter(lock, pollSeconds)
    if (entered !== 'taken' && entered !== 'retry') {
      entry = entered
      break
    }
    if (entered === 'retry') {
      if ((refusals += 1) > 250) throw new Error(`队列锁 ${lock} 一直建不成`)
      sleepSync(20)
      continue
    }
    const names = owners(lock)
    let reaped = false
    for (const name of names) {
      const path = join(lock, name)
      const owner = fields(path)
      const age = ageOf(path)
      const dead = owner != null && sameSide(owner) && !processAlive(Number(owner.pid))
      if (dead || (age !== undefined && age > QUEUE_LOCK_STALE_SECONDS)) {
        reap(lock, name)
        reaped = true
      }
    }
    if (names.length === 0 && (ageOf(lock) ?? 0) > QUEUE_LOCK_STALE_SECONDS) {
      removeIfEmpty(lock)
      reaped = true
    }
    if (!reaped) sleepSync(20)
  }
  try {
    return work()
  } finally {
    leave(entry)
  }
}

function duration(seconds) {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
}

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
let tokens = []
let ahead = 0
let free = 0
let holders = []
let holderIds = []

const tokenDir = index => join(slotDir, `core-${index}`)

function tokenHolder(directory) {
  let holder
  for (const name of owners(directory)) {
    const path = join(directory, name)
    if (alive(path)) holder ??= path
    else removeIfEmpty(directory)
  }
  removeIfEmpty(directory)
  return holder
}

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
  const held = new Map()
  for (const name of readdirSync(slotDir)) {
    const match = /^core-(\d+)$/.exec(name)
    if (match === null) continue
    const holder = tokenHolder(join(slotDir, name))
    if (holder !== undefined) held.set(Number(match[1]), holder)
  }
  const vacant = []
  for (let index = 1; index <= capacity; index += 1) if (!held.has(index)) vacant.push(index)
  free = Math.max(0, Math.min(vacant.length, capacity - held.size))
  const granted = grant({ head: ahead === 0, free, want, min })
  if (granted > 0) {
    const taken = []
    for (const index of vacant) {
      if (taken.length === granted) break
      const entry = enter(tokenDir(index), HOLDER_BEAT_SECONDS)
      if (entry !== 'taken' && entry !== 'retry') taken.push(entry)
    }
    if (taken.length >= min) {
      removeOwn(ticket)
      tokens = taken
      return
    }
    releaseTokens(taken)
  }
  holders = []
  holderIds = []
  const byHolder = new Map()
  for (const path of held.values()) {
    const entry = fields(path) ?? {}
    const key = `${entry.pid}@${entry.side ?? SIDE}@${entry.since}`
    const seen = byHolder.get(key)
    if (seen === undefined) byHolder.set(key, { entry, count: 1 })
    else seen.count += 1
  }
  for (const [key, { entry, count }] of byHolder) {
    const since = /^\d+$/.test(entry.since ?? '') ? Number(entry.since) : unixNow()
    let cmd = entry.cmd ?? ''
    if (cmd.length > 160) cmd = `${cmd.slice(0, 160)}…`
    holders.push(
      `${count} 个令牌正由「${cmd}」占着，已 ${duration(Math.max(0, unixNow() - since))}（${entry.cwd ?? ''}，进程 ${entry.pid ?? ''}，${entry.side ?? SIDE}）`,
    )
    holderIds.push(`${key}x${count}`)
  }
}

const HOLDER_BEAT_SECONDS = 5
const started = now()
let aheadOnArrival
let waited = 0
let status = 0

function record(event, run) {
  const line = {
    event,
    command: commandLine.slice(0, 500),
    issue: task.issue,
    attempt: task.attempt,
    cwd: process.cwd(),
    pid: process.pid,
    cores: os.availableParallelism?.() ?? os.cpus().length,
    capacity,
    want,
    min,
    aheadOnArrival,
    arrivedAt: jsonTime(started),
    waitSeconds: waited,
    tokens: event === 'ran' ? tokens.length : null,
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

const interrupted = signal => {
  if (ticket !== undefined && tokens.length === 0) removeOwn(ticket)
  process.exit(128 + (os.constants.signals[signal] ?? 1))
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, interrupted)

let announced = false
let lastSeen = ''
let recycled = false
for (;;) {
  inQueue(takeTurn)
  aheadOnArrival ??= ahead
  waited = wholeSeconds(now() - started)
  if (recycled) {
    process.stderr.write(`with-test-slot: 票被回收，重新排队（前面还有 ${ahead} 个）\n`)
    recycled = false
    lastSeen = ''
  }
  if (tokens.length > 0) break
  if (waited >= maxWaitSeconds) {
    status = 75
    inQueue(() => {
      removeOwn(ticket)
      record('gave-up', { endedAt: now() })
    })
    process.stderr.write(
      `with-test-slot: 等了 ${waited} 秒仍没轮到（前面还有 ${ahead} 个，空闲 ${free} 个，共 ${capacity} 个令牌，至少要 ${min} 个，锁在 ${slotDir}），命令没有执行\n`,
    )
    process.exit(75)
  }
  const seen = `${ahead}|${holderIds.join(' ')}`
  if (seen !== lastSeen) {
    if (!announced) {
      process.stderr.write(
        `with-test-slot: 排队中，前面还有 ${ahead} 个（共 ${capacity} 个令牌，空闲 ${free} 个；这次要 ${want} 个、至少 ${min} 个；每 ${pollSeconds} 秒看一次，最多等 ${maxWaitSeconds} 秒）\n`,
      )
      announced = true
    } else process.stderr.write(`with-test-slot: 前面还有 ${ahead} 个，空闲 ${free} 个\n`)
    for (const line of holders) process.stderr.write(`with-test-slot:   ${line}\n`)
    lastSeen = seen
  }
  if (!beatOwn(ticket)) {
    ticketNumber = 0
    recycled = true
  }
  await sleep(pollSeconds)
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupted)

if (announced)
  process.stderr.write(
    `with-test-slot: 等了 ${waited} 秒，拿到 ${tokens.length} 个令牌（共 ${capacity} 个）\n`,
  )
const acquiredAt = now()
const loadAtAcquire = load()
let noticedGone = false
const heartbeat = setInterval(() => {
  const gone = tokens.filter(path => !beatOwn(path))
  if (gone.length === 0 || noticedGone) return
  noticedGone = true
  process.stderr.write(
    `with-test-slot: 令牌文件被删（${gone.join('、')}），本进程的登记被当作失效；命令照常跑完，但别的等待者可能已经开始\n`,
  )
}, HOLDER_BEAT_SECONDS * 1000)
const result = await run(
  args,
  {
    ...process.env,
    OMNE_TEST_SLOT_HELD: dirname(tokens[0]),
    OMNE_WORKER_BUDGET: String(tokens.length),
  },
  true,
)
clearInterval(heartbeat)
status = result.status
const endedAt = now()
inQueue(() => {
  releaseTokens(tokens)
  record('ran', { acquiredAt, endedAt, cpuSeconds: result.cpuSeconds, loadAtAcquire })
})
process.exit(status)

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
    return {
      file: bash,
      args: [[command, ...rest].map(msysQuote).join(' ')],
      options: { windowsVerbatimArguments: true, argv0: msysQuote(bash) },
    }
  }
  return { file: command, args: rest, options: {} }
}

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
