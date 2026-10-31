import { execFileSync } from 'node:child_process'
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname, resolve } from 'node:path'
import { errorCode, parseEventLine } from './events.ts'
import { ReceiverError } from './events-channel.ts'
import {
  positiveInteger,
  receiverPaths,
  writePrivateJson,
  type ChannelConfig,
} from './events-channel-config.ts'
import { array, record, text } from './protocol.ts'

export type ReceiverState = {
  schemaVersion: 2
  instanceId: string
  repository: string
  eventFile: string
  mode: 'channel' | 'legacy'
  managed: boolean
  hookId: number | null
  events: string[]
  pid: number
  host: string
  processIdentity: string
  processStartedAt: string
  state: 'starting' | 'connected' | 'reconnecting' | 'recovery-needed' | 'stopped' | 'failed'
  reasonCode: string
  connectionEpoch: number
  updatedAt: string
  lastDeliveryAt: string | null
}

/**
 * 进程启动时刻。POSIX 读 `ps -o lstart=`。Windows 没有这个 `ps`
 * （Git Bash 的 ps 只认 MSYS 的 pid、也不支持 `-o`），改读 `Get-Process` 的 StartTime（UTC，100ns 精度）；
 * PowerShell 冷启动较慢，时限放宽。取不到时返回 null，调用方按身份不可得处理。
 */
function startTimeCommand(pid: number): { command: string; args: string[]; timeout: number } {
  if (process.platform !== 'win32')
    return { command: 'ps', args: ['-p', String(pid), '-o', 'lstart='], timeout: 2000 }
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`,
    ],
    timeout: 10000,
  }
}

function processStartTime(pid: number): string | null {
  try {
    const { command, args, timeout } = startTimeCommand(pid)
    const value = execFileSync(command, args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
    }).trim()
    return Number.isFinite(Date.parse(value)) ? value : null
  } catch {
    return null
  }
}

function posixStartTimeUtc(pid: number): string | null {
  try {
    const { command, args, timeout } = startTimeCommand(pid)
    const value = execFileSync(command, args, {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
      env: { ...process.env, TZ: 'UTC0', LC_ALL: 'C' },
    }).trim()
    const fields =
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})$/.exec(
        value,
      )
    if (fields === null) return null
    const [, weekday, month, day, time, year] = fields
    const started = new Date(`${value} GMT`)
    if (
      started.toUTCString() !== `${weekday}, ${day?.padStart(2, '0')} ${month} ${year} ${time} GMT`
    )
      return null
    return started.toISOString()
  } catch {
    return null
  }
}

export function processIdentity(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid < 1) return null
  if (process.platform !== 'linux') return processStartTime(pid)
  try {
    const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    // comm may contain spaces and parentheses; field 3 follows its final closing parenthesis.
    const commEnd = stat.lastIndexOf(')')
    const fields = stat
      .slice(commEnd + 1)
      .trim()
      .split(/\s+/)
    const startTicks = fields[19]
    if (
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(bootId) ||
      !stat.startsWith(`${pid} (`) ||
      commEnd < `${pid} (`.length ||
      startTicks === undefined ||
      !/^\d+$/.test(startTicks)
    )
      return null
    return `linux:${bootId}:${pid}:${startTicks}`
  } catch {
    return null
  }
}

function startTime(value: unknown): string {
  const result = text(value, 'processStartedAt')
  const parsed = Date.parse(result)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== result)
    throw new ReceiverError('invalid-receiver-state')
  return result
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) !== 'ESRCH'
  }
}

/** Serializes local pid claim/release. An abandoned guard is an explicit recovery error. */
export function withReceiverGuard<T>(file: string, operation: () => T): T {
  const { guard } = receiverPaths(file)
  mkdirSync(dirname(guard), { recursive: true, mode: 0o700 })
  try {
    mkdirSync(guard, { mode: 0o700 })
  } catch {
    throw new ReceiverError('receiver-lock-held')
  }
  try {
    return operation()
  } finally {
    rmSync(guard, { recursive: true })
  }
}

export function ensureReceiverStopped(file: string): void {
  const { pid } = receiverPaths(file)
  if (!existsSync(pid)) return
  const value = Number(readFileSync(pid, 'utf8').trim())
  if (!Number.isSafeInteger(value) || value < 1) throw new ReceiverError('invalid-receiver-pid')
  if (alive(value)) throw new ReceiverError('receiver-already-running')
}

export function claimChannelReceiver(config: ChannelConfig): {
  state: ReceiverState
  release: () => void
} {
  return claimReceiver({
    instanceId: config.instanceId,
    repository: config.repository,
    eventFile: config.eventFile,
    mode: 'channel',
    managed: config.ownership.kind !== 'borrowed',
    hookId: 'hookId' in config.ownership ? config.ownership.hookId : null,
    events: config.events,
  })
}

export function claimReceiver(
  config: Pick<
    ReceiverState,
    'instanceId' | 'repository' | 'eventFile' | 'mode' | 'managed' | 'hookId' | 'events'
  >,
): { state: ReceiverState; release: () => void } {
  const paths = receiverPaths(config.eventFile),
    identity = processIdentity(process.pid)
  if (identity === null) throw new ReceiverError('process-identity-unavailable')
  const queriedStart = process.platform === 'win32' ? identity : posixStartTimeUtc(process.pid)
  if (queriedStart === null) throw new ReceiverError('process-start-time-unavailable')
  const started = new Date(queriedStart).toISOString()
  const state: ReceiverState = {
    schemaVersion: 2,
    instanceId: config.instanceId,
    repository: config.repository,
    eventFile: config.eventFile,
    mode: config.mode,
    managed: config.managed,
    hookId: config.hookId,
    events: config.events,
    pid: process.pid,
    host: hostname(),
    processIdentity: identity,
    processStartedAt: started,
    state: 'starting',
    reasonCode: 'starting',
    connectionEpoch: 0,
    updatedAt: new Date().toISOString(),
    lastDeliveryAt: null,
  }
  withReceiverGuard(config.eventFile, () => {
    ensureReceiverStopped(config.eventFile)
    rmSync(paths.pid, { force: true })
    writeFileSync(paths.pid, `${process.pid}\n`, { flag: 'wx', mode: 0o600 })
    try {
      writePrivateJson(paths.state, state)
    } catch (error) {
      rmSync(paths.pid, { force: true })
      throw error
    }
  })
  return {
    state,
    release: () =>
      withReceiverGuard(config.eventFile, () => {
        if (
          readFileSync(paths.pid, 'utf8').trim() !== String(state.pid) ||
          processIdentity(state.pid) !== identity
        )
          throw new ReceiverError('receiver-process-identity-changed')
        const current = readReceiverState(config.eventFile)
        if (
          current.instanceId !== state.instanceId ||
          current.repository !== state.repository ||
          current.eventFile !== state.eventFile ||
          current.host !== state.host ||
          current.pid !== state.pid ||
          current.mode !== state.mode ||
          current.managed !== state.managed ||
          current.hookId !== state.hookId ||
          current.processIdentity !== identity ||
          current.processStartedAt !== started
        )
          throw new ReceiverError('receiver-owner-changed')
        rmSync(paths.pid)
      }),
  }
}

export function readReceiverState(file: string): ReceiverState {
  try {
    const value = record(
      JSON.parse(readFileSync(receiverPaths(file).state, 'utf8')),
      'receiver state',
    )
    if (
      value.schemaVersion !== 2 ||
      (value.mode !== 'channel' && value.mode !== 'legacy') ||
      typeof value.managed !== 'boolean'
    )
      throw new ReceiverError('invalid-receiver-state')
    const state = value.state
    if (
      state !== 'starting' &&
      state !== 'connected' &&
      state !== 'reconnecting' &&
      state !== 'recovery-needed' &&
      state !== 'stopped' &&
      state !== 'failed'
    )
      throw new ReceiverError('invalid-receiver-state')
    if (
      typeof value.connectionEpoch !== 'number' ||
      !Number.isSafeInteger(value.connectionEpoch) ||
      value.connectionEpoch < 0
    )
      throw new ReceiverError('invalid-receiver-state')
    return {
      schemaVersion: 2,
      mode: value.mode,
      state,
      managed: value.managed,
      instanceId: text(value.instanceId, 'instanceId'),
      repository: text(value.repository, 'repository'),
      eventFile: text(value.eventFile, 'eventFile'),
      host: text(value.host, 'host'),
      pid: positiveInteger(value.pid),
      hookId: value.hookId === null ? null : positiveInteger(value.hookId),
      events: array(value.events, 'events').map(value => text(value, 'event')),
      processIdentity: text(value.processIdentity, 'processIdentity'),
      processStartedAt: startTime(value.processStartedAt),
      reasonCode: text(value.reasonCode, 'reasonCode'),
      connectionEpoch: value.connectionEpoch,
      updatedAt: text(value.updatedAt, 'updatedAt'),
      lastDeliveryAt:
        value.lastDeliveryAt === null ? null : text(value.lastDeliveryAt, 'lastDeliveryAt'),
    }
  } catch {
    throw new ReceiverError('invalid-receiver-state')
  }
}

export function inspectEventLog(file: string): Set<string> {
  const deliveries = new Set<string>()
  if (!existsSync(file)) return deliveries
  if (!lstatSync(file).isFile()) throw new ReceiverError('invalid-event-file')
  const content = readFileSync(file, 'utf8')
  if (content !== '' && !content.endsWith('\n')) throw new ReceiverError('event-log-corrupt')
  for (const line of content.split('\n').filter(Boolean)) {
    const event = parseEventLine(line)
    if (event === undefined) throw new ReceiverError('event-log-corrupt')
    if (event.delivery !== null) deliveries.add(event.delivery)
  }
  return deliveries
}

/** Local-only inspection; callers may poll every 5 seconds without GitHub requests. */
export function readReceiverHealth(args: { file: string; repository: string }) {
  const state = readReceiverState(args.file)
  if (state.repository !== args.repository || state.eventFile !== resolve(args.file))
    throw new ReceiverError('receiver-identity-mismatch')
  const processAlive =
    state.host === hostname() && processIdentity(state.pid) === state.processIdentity
  let reasonCode = state.reasonCode
  try {
    if (readFileSync(receiverPaths(args.file).pid, 'utf8').trim() !== String(state.pid))
      reasonCode = 'receiver-pid-mismatch'
    if (state.connectionEpoch > 0 && !existsSync(args.file))
      throw new ReceiverError('event-log-missing')
    inspectEventLog(args.file)
    accessSync(existsSync(args.file) ? args.file : dirname(args.file), constants.W_OK)
  } catch (error) {
    reasonCode = error instanceof ReceiverError ? error.reasonCode : 'receiver-files-unavailable'
  }
  if (!processAlive) reasonCode = 'receiver-process-dead'
  const healthy = processAlive && state.state === 'connected' && reasonCode === state.reasonCode
  return { kind: 'receiver-health' as const, ...state, processAlive, healthy, reasonCode }
}
