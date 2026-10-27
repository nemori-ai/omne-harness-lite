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
  schemaVersion: 1
  instanceId: string
  repository: string
  eventFile: string
  mode: 'channel' | 'legacy'
  managed: boolean
  hookId: number | null
  events: string[]
  pid: number
  host: string
  processStartedAt: string
  state: 'starting' | 'connected' | 'reconnecting' | 'recovery-needed' | 'stopped' | 'failed'
  reasonCode: string
  connectionEpoch: number
  updatedAt: string
  lastDeliveryAt: string | null
}

export function processIdentity(pid: number): string | null {
  try {
    const value = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
    }).trim()
    return value || null
  } catch {
    return null
  }
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
    started = processIdentity(process.pid)
  if (started === null) throw new ReceiverError('process-identity-unavailable')
  const state: ReceiverState = {
    schemaVersion: 1,
    instanceId: config.instanceId,
    repository: config.repository,
    eventFile: config.eventFile,
    mode: config.mode,
    managed: config.managed,
    hookId: config.hookId,
    events: config.events,
    pid: process.pid,
    host: hostname(),
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
          processIdentity(state.pid) !== started
        )
          throw new ReceiverError('receiver-process-identity-changed')
        const current = readReceiverState(config.eventFile)
        if (current.instanceId !== state.instanceId || current.processStartedAt !== started)
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
      value.schemaVersion !== 1 ||
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
      schemaVersion: 1,
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
      processStartedAt: text(value.processStartedAt, 'processStartedAt'),
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
    state.host === hostname() && processIdentity(state.pid) === state.processStartedAt
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
