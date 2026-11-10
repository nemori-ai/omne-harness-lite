import { randomBytes, randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { win32 } from 'node:path'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  BetweenSegments,
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  OutputPolicy,
  ProcessHandle,
  RetainedTerminalLedger,
  TerminalFacility,
  TerminalInformation,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'
import type { HostTerminals, TerminalSettings } from '../host-terminal.ts'
import {
  idleSentinels,
  releaseSentinels,
  scanSentinels,
  watchSentinels,
  type SentinelPiece,
  type SentinelScan,
} from '../terminal-sentinels.ts'
import { deferred, within } from './bridge.ts'
import { windowsTerminalExecutable } from './compile.ts'
import { stopWindowsResource } from './index.ts'
import { startTerminalBridge, type TerminalBridge, type TerminalFrame } from './terminal-bridge.ts'
import {
  createWindowsTerminalCapacity,
  reserveTerminalWindow,
  type TerminalWindow,
  type WindowsTerminalCapacity,
} from './terminal-output.ts'

export { createWindowsTerminalCapacity } from './terminal-output.ts'
export type { WindowsTerminalLimits, WindowsTerminalCapacity } from './terminal-output.ts'
type CreateRequest = Parameters<TerminalFacility<unknown>['create']>[0]
type ExecuteRequest = Parameters<TerminalFacility<unknown>['execute']>[0]
type StopStatus = 'confirmed' | 'unconfirmed'
type Finished = Extract<TerminalFrame, { t: 'finished' }>
/** A file of the pseudoconsole a terminal start could not read. */
export type WindowsTerminalPrerequisite = 'conpty.dll' | 'OpenConsole.exe'
type PlatformInput = Readonly<{
  provider: string
  settings: TerminalSettings
  capacity?: WindowsTerminalCapacity
  /** The absolute path of conpty.dll, with its OpenConsole.exe beside it; node-pty's when absent. */
  conpty?: string
  /** Receives the files a start found missing before it answers `unavailable`. */
  unavailable?(missing: readonly WindowsTerminalPrerequisite[]): void
}>

const resolveHere = createRequire(import.meta.url)

/** The conpty.dll that node-pty ships for this architecture; undefined when node-pty is not installed. */
export function bundledConpty(): string | undefined {
  try {
    const root = win32.dirname(resolveHere.resolve('node-pty/package.json'))
    return win32.join(root, 'prebuilds', `win32-${process.arch}`, 'conpty', 'conpty.dll')
  } catch {
    return undefined
  }
}

/** The files of the pseudoconsole that cannot be read, in the order the terminal needs them. */
export async function missingConptyFiles(
  conpty: string | undefined,
): Promise<WindowsTerminalPrerequisite[]> {
  if (conpty === undefined) return ['conpty.dll', 'OpenConsole.exe']
  const files = [
    ['conpty.dll', conpty],
    ['OpenConsole.exe', win32.join(win32.dirname(conpty), 'OpenConsole.exe')],
  ] as const
  const missing: WindowsTerminalPrerequisite[] = []
  for (const [name, path] of files)
    await access(path).catch(() => {
      missing.push(name)
    })
  return missing
}
type ReservationInput = Readonly<{
  request: CreateRequest
  ledger: RetainedTerminalLedger
  scope: ScopeRef
  closed(): boolean
}>
type Leg = {
  id: string
  sequence: number
  acknowledged: boolean
  started: ReturnType<typeof deferred<boolean>>
  outcome: ReturnType<typeof deferred<CommandOutcome>>
  window: TerminalWindow
  next: TerminalWindow
  /** The bytes kept between segments, taken at the begin sentinel. */
  between: BetweenSegments | undefined
  sawEnd: boolean
  /** The shell's finished frame, kept until the end sentinel arrives: the two come on unordered channels. */
  completion: Finished | undefined
  startedAt: number
  done: boolean
  foregroundCompleted: boolean
}
const now = () =>
  /* wall-clock: operation-timing -- Bound native control and measure one foreground invocation. */ performance.now()
const reject = (requestId: string, reason: FacilityReason): FacilityResult<never> => ({
  kind: 'rejected',
  requestId,
  reason,
})
const pathValid = (path: string) => win32.isAbsolute(path) && !path.includes('\0')
const envValid = (env: Readonly<Record<string, string>>) =>
  Object.entries(env).every(
    ([key, value]) =>
      key.length > 0 && !key.includes('=') && !key.includes('\0') && !value.includes('\0'),
  )
const geometryValid = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 32767

function reserve(input: PlatformInput & ReservationInput & { capacity: WindowsTerminalCapacity }) {
  const { settings, ledger, capacity } = input
  const terminal = Object.freeze({ id: randomUUID(), generation: randomUUID() })
  const name = `Local\\omne-terminal-${terminal.id}`
  const resource: ManagedResource = Object.freeze({
    key: terminal.id,
    provider: input.provider,
    reference: {
      kind: 'object',
      entries: [
        { key: 'windowsJob', value: { kind: 'string', value: name } },
        { key: 'generation', value: { kind: 'string', value: terminal.generation } },
        { key: 'scope', value: { kind: 'string', value: input.scope.ref } },
      ],
    },
  } satisfies ManagedResource)
  const policy: OutputPolicy = Object.freeze({
    maxBufferedBytes: settings.maxBufferedBytes,
    maxChunkBytes: settings.maxChunkBytes,
    overflow: 'discard',
  })
  const reservedTerminal = capacity.terminal()
  if (reservedTerminal === undefined) return undefined
  const releaseTerminal = reservedTerminal
  // The window the next invocation writes into, reserved before it can start.
  let spare: TerminalWindow | undefined = reserveTerminalWindow(policy, capacity)
  if (spare === undefined) {
    releaseTerminal()
    return undefined
  }
  let state: TerminalInformation['state'] = 'idle'
  let cwd = input.request.cwd
  let leg: Leg | undefined
  let bridge: TerminalBridge | undefined
  let bridgeEnded = false
  let starting = false
  let cancelled = false
  let nativeStopped = false
  let confirmed = false
  let planned = false
  let outputFailed = false
  let sequence = 0
  let completedSequence = 0
  let sentinels: SentinelScan = idleSentinels
  /** Bytes read outside any segment, kept for the next segment up to `betweenSegmentBytes`. */
  let between: Uint8Array[] = []
  let betweenKept = 0
  let betweenDiscarded = 0
  let stopping: Promise<StopStatus> | undefined
  let recording:
    | { readonly status: StopStatus; readonly result: Promise<'recorded' | 'unavailable'> }
    | undefined
  let startResult: Promise<FacilityResult<{ terminal: TerminalRef }>> | undefined
  let stopReply = deferred<StopStatus>()
  const ready = deferred<boolean>()
  const opened = deferred<boolean>()
  const closed = () => cancelled || input.closed() || ledger.closed.aborted
  const completedFrame = (id: string) => {
    const prefix = `${terminal.generation}:`
    if (!id.startsWith(prefix)) return false
    const value = id.slice(prefix.length)
    const number = Number(value)
    return (
      Number.isSafeInteger(number) &&
      number > 0 &&
      number <= completedSequence &&
      String(number) === value
    )
  }
  const keepBetween = (bytes: Uint8Array) => {
    const kept = Math.min(bytes.byteLength, settings.betweenSegmentBytes - betweenKept)
    if (kept > 0) between.push(bytes.slice(0, kept))
    betweenKept += kept
    betweenDiscarded += bytes.byteLength - kept
  }
  /** Stops watching the current nonce; bytes held as a possible sentinel start stay between segments. */
  const releaseScan = () => {
    const released = releaseSentinels(sentinels)
    sentinels = released.scan
    for (const piece of released.pieces) if ('bytes' in piece) keepBetween(piece.bytes)
  }
  const finish = (completion?: Finished) => {
    const current = leg
    if (current === undefined || current.done) return
    current.done = true
    current.foregroundCompleted = completion?.completed === true
    current.started.resolve(false)
    releaseScan()
    const counts = current.window.seal()
    const output = Object.freeze(
      current.between === undefined ? counts : { ...counts, between: current.between },
    )
    spare = current.next
    leg = undefined
    current.outcome.resolve(
      completion?.completed === true && !outputFailed
        ? {
            kind: 'completed',
            exit: { kind: 'code', code: completion.code },
            durationMs: completion.elapsedMs,
            output,
          }
        : {
            kind: 'failed',
            reason: outputFailed ? 'unavailable' : 'effectUnknown',
            observedDurationMs: Math.max(0, Math.round(now() - current.startedAt)),
            output,
          },
    )
  }
  /**
   * `control`: the shell or the broker failed. An invocation whose finished frame arrived still
   * waits for its end sentinel: the broker forwards output until it exits. `ended`: the broker's
   * output ended. `order`: the sentinels came in an impossible order. `output`: bytes were lost.
   */
  const invalidate = (reason: 'control' | 'ended' | 'order' | 'output' = 'control') => {
    if (state === 'closed') return
    if (reason === 'output') outputFailed = true
    state = 'invalid'
    ready.resolve(false)
    opened.resolve(false)
    if (reason !== 'control' || leg?.completion === undefined) finish()
  }
  /** Answers the invocation once both its finished frame and its end sentinel arrived. */
  const settle = () => {
    const current = leg
    if (current?.completion === undefined || !current.sawEnd) return
    const completion = current.completion
    finish(completion)
    if (state === 'running')
      state =
        completion.restored &&
        completion.completed &&
        !completion.ended &&
        !closed() &&
        !outputFailed
          ? 'idle'
          : 'invalid'
  }
  /** One attributed piece of PTY output; false when the sentinel order is impossible. */
  const attribute = (piece: SentinelPiece): boolean => {
    const current = leg
    switch (piece.kind) {
      case 'between':
        keepBetween(piece.bytes)
        return true
      case 'segment':
        if (current?.between === undefined || current.sawEnd) return false
        if (!current.window.push(piece.bytes)) {
          invalidate('output')
          void stop()
        }
        return true
      case 'begin':
        if (current === undefined || current.between !== undefined) return false
        current.between = Object.freeze({
          data: new Uint8Array(Buffer.concat(between)),
          count: Object.freeze({
            observedBytes: betweenKept + betweenDiscarded,
            discardedBytes: betweenDiscarded,
          }),
        })
        between = []
        betweenKept = 0
        betweenDiscarded = 0
        return true
      case 'end':
        if (current?.between === undefined || current.sawEnd) return false
        current.sawEnd = true
        settle()
        return true
    }
  }
  /** The shell started an invocation; a frame for another invocation invalidates the terminal. */
  const started = (id: string) => {
    if (completedFrame(id)) return
    if (leg?.id !== id) return invalidate()
    if (leg.acknowledged) return
    leg.acknowledged = true
    leg.startedAt = now()
    leg.started.resolve(true)
  }
  /** PTY bytes, attributed by the sentinels of the invocation being watched. */
  const data = (base64: string) => {
    const scanned = scanSentinels(sentinels, Buffer.from(base64, 'base64'))
    sentinels = scanned.scan
    if (!scanned.pieces.every(attribute)) invalidate('order')
  }
  const finished = (value: Finished) => {
    if (completedFrame(value.id)) return
    if (leg?.id !== value.id) return invalidate()
    cwd = value.cwd
    completedSequence = leg.sequence
    leg.completion = value
    settle()
  }
  const frame = (value: TerminalFrame) => {
    switch (value.t) {
      case 'ready':
        ready.resolve(true)
        return
      case 'opened':
        cwd = value.cwd
        opened.resolve(true)
        return
      case 'started':
        return started(value.id)
      case 'data':
        return data(value.b)
      case 'finished':
        return finished(value)
      case 'stopped':
        if (value.status === 'confirmed') nativeStopped = true
        stopReply.resolve(value.status)
        return
      case 'fault':
        if (value.stopped) nativeStopped = true
        stopReply.resolve(value.stopped ? 'confirmed' : 'unconfirmed')
        invalidate()
        return
      case 'outputLost':
        invalidate('output')
        return
      case 'legFault':
        if (!completedFrame(value.id)) invalidate()
        return
      // The broker is still there: a stop sent to it gets its answer.
      case 'controlLost':
      case 'inputFault':
        invalidate()
        return
      default: {
        const exhaustive: never = value
        return exhaustive
      }
    }
  }
  /**
   * Stops the Job through the broker, else by its name; the broker's own answer can still arrive
   * while the stop by name runs. True once the Job is stopped and the broker is gone.
   */
  async function stopNative(remaining: () => number): Promise<boolean> {
    if (bridge === undefined) nativeStopped = true
    if (!nativeStopped) {
      stopReply = deferred<StopStatus>()
      const sent = bridge?.send('stop') === true
      if (sent && (await within(stopReply.promise, remaining())) === 'confirmed')
        nativeStopped = true
      if (
        !nativeStopped &&
        remaining() > 0 &&
        (await stopWindowsResource(resource, remaining())) === 'confirmed'
      )
        nativeStopped = true
    }
    if (!nativeStopped) return false
    bridge?.send('dispose')
    bridge?.disconnect()
    if (bridge !== undefined && !bridgeEnded)
      bridgeEnded =
        (await within(
          bridge.closed.then(() => true),
          remaining(),
        )) === true
    return bridge === undefined || bridgeEnded
  }
  /** Records the stop on the ledger once; confirmed only when released and recorded as such. */
  async function recordStop(released: boolean, remaining: () => number): Promise<boolean> {
    const status = released ? 'confirmed' : 'unconfirmed'
    recording ??= {
      status,
      result: Promise.resolve()
        .then(() => ledger.stopped(resource.key, status))
        .catch(() => 'unavailable'),
    }
    const recorded = await within(recording.result, remaining())
    const agrees = recording.status === status
    if (recorded !== undefined) recording = undefined
    return released && agrees && recorded === 'recorded'
  }
  async function stop(): Promise<StopStatus> {
    if (confirmed) return 'confirmed'
    cancelled = true
    state = 'invalid'
    if (starting) return 'unconfirmed'
    stopping ??= (async (): Promise<StopStatus> => {
      const deadline = now() + settings.stopBoundMs
      const remaining = () => Math.max(0, deadline - now())
      finish()
      const released = await stopNative(remaining)
      if (released) {
        // Sealing the unused window releases its reservation; the bytes kept between segments go with it.
        spare?.seal()
        spare = undefined
        between = []
      }
      confirmed = !planned && released ? true : await recordStop(released, remaining)
      if (confirmed) {
        state = 'closed'
        releaseTerminal()
      }
      return confirmed ? 'confirmed' : 'unconfirmed'
    })().finally(() => {
      stopping = undefined
    })
    return stopping
  }
  /** The checks of a create request that need no process, in order. */
  const startIssue = (request: typeof input.request): FacilityReason | undefined => {
    if (request.binding.kind !== 'host_machine') return 'unsupported'
    if (
      !pathValid(request.cwd) ||
      !envValid(request.env) ||
      !geometryValid(request.geometry?.columns ?? settings.columns) ||
      !geometryValid(request.geometry?.rows ?? settings.rows)
    )
      return 'invalidInput'
    if (
      Buffer.byteLength(JSON.stringify({ cwd: request.cwd, env: request.env })) + 512 >
      settings.maxControlBytes
    )
      return 'capacity'
    if (closed()) return 'closed'
    if (process.platform !== 'win32') return 'unavailable'
    return undefined
  }
  const start = async (): Promise<FacilityResult<{ terminal: TerminalRef }>> => {
    const request = input.request
    const refused = async (reason: FacilityReason) => {
      starting = false
      await stop()
      return reject(request.requestId, reason)
    }
    const issue = startIssue(request)
    if (issue !== undefined) return refused(issue)
    const conpty = input.conpty ?? bundledConpty()
    const missing = await missingConptyFiles(conpty)
    if (missing.length > 0) {
      input.unavailable?.(missing)
      return refused('unavailable')
    }
    if (closed()) return refused('closed')
    starting = true
    try {
      const executable = await windowsTerminalExecutable()
      if (closed()) return refused('closed')
      planned = true
      const plan = await ledger.plan(resource)
      planned = plan === 'recorded' || plan === 'unavailable'
      if (plan !== 'recorded') return refused(plan)
      if (closed()) return refused('closed')
      bridge = startTerminalBridge({
        executable,
        request: {
          name,
          conpty,
          cwd: request.cwd,
          env: request.env,
          columns: request.geometry?.columns ?? settings.columns,
          rows: request.geometry?.rows ?? settings.rows,
          maxChunkBytes: settings.maxChunkBytes,
          maxControlBytes: settings.maxControlBytes,
          stopBoundMs: settings.stopBoundMs,
        },
        maxChunkBytes: settings.maxChunkBytes,
        maxControlBytes: settings.maxControlBytes,
        onFrame: frame,
        onClosed() {
          bridgeEnded = true
          stopReply.resolve('unconfirmed')
          invalidate('ended')
        },
      })
      const preparation = await within(ready.promise, settings.startBoundMs)
      if (preparation !== true) {
        starting = false
        if (preparation === false && nativeStopped) return refused('unavailable')
        await stop()
        return { kind: 'unknown', requestId: request.requestId }
      }
      const permit = await ledger.permit(resource.key)
      if (permit !== 'confirmed') return refused(permit)
      if (closed()) return refused('closed')
      bridge.send('go')
      if ((await within(opened.promise, settings.startBoundMs)) !== true) {
        starting = false
        await stop()
        return { kind: 'unknown', requestId: request.requestId }
      }
      if (closed()) return refused('closed')
      if (state === 'invalid') return { kind: 'unknown', requestId: request.requestId }
      return { kind: 'done', requestId: request.requestId, value: { terminal } }
    } catch {
      return refused('unavailable')
    } finally {
      starting = false
    }
  }
  /** The checks of an execute request against the terminal's state and its own shape, in order. */
  const executeIssue = (request: ExecuteRequest): FacilityReason | undefined => {
    if (closed() || state === 'closed') return 'closed'
    if (starting || state === 'running') return 'busy'
    if (state === 'invalid' || bridge === undefined || spare === undefined) return 'unavailable'
    if (request.binding.kind !== 'host_machine') return 'unsupported'
    if (request.terminal.id !== terminal.id || request.terminal.generation !== terminal.generation)
      return 'notFound'
    if (
      request.script.includes('\0') ||
      (request.cwd !== undefined && !pathValid(request.cwd)) ||
      (request.env !== undefined && !envValid(request.env))
    )
      return 'invalidInput'
    return undefined
  }
  /** A stop through one invocation's handle: only the running invocation stops the terminal. */
  const stopLeg = async (current: Leg, mode: 'graceful' | 'forced'): Promise<StopStatus> => {
    if (confirmed) return 'confirmed'
    if (current.done && !current.foregroundCompleted && state === 'invalid')
      return mode === 'forced' ? stop() : 'unconfirmed'
    if (current.done || leg !== current) return 'unconfirmed'
    if (mode === 'graceful') {
      bridge?.send('graceful')
      return 'unconfirmed'
    }
    return stop()
  }
  const execute = async (request: ExecuteRequest): Promise<FacilityResult<ProcessHandle>> => {
    const issue = executeIssue(request)
    if (issue !== undefined) return reject(request.requestId, issue)
    if (bridge === undefined || spare === undefined) return reject(request.requestId, 'unavailable')
    if (sequence >= Number.MAX_SAFE_INTEGER) {
      state = 'invalid'
      return reject(request.requestId, 'capacity')
    }
    const nonce = randomBytes(16).toString('hex')
    const message = {
      c: 'execute',
      id: `${terminal.generation}:${sequence + 1}`,
      nonce,
      script: request.script,
      cwd: request.cwd,
      env: request.env,
      stdin:
        request.stdin === undefined ? undefined : Buffer.from(request.stdin).toString('base64'),
    }
    if (Buffer.byteLength(JSON.stringify(message)) + 1 > settings.maxControlBytes)
      return reject(request.requestId, 'capacity')
    const next = reserveTerminalWindow(policy, capacity)
    if (next === undefined) return reject(request.requestId, 'capacity')
    sequence++
    const current: Leg = {
      id: message.id,
      sequence,
      acknowledged: false,
      started: deferred(),
      outcome: deferred(),
      window: spare,
      next,
      between: undefined,
      sawEnd: false,
      completion: undefined,
      startedAt: now(),
      done: false,
      foregroundCompleted: false,
    }
    leg = current
    spare = undefined
    sentinels = watchSentinels(sentinels, nonce)
    state = 'running'
    if (
      !bridge.send(message) ||
      (await within(current.started.promise, settings.startBoundMs)) !== true
    ) {
      invalidate()
      return { kind: 'unknown', requestId: request.requestId }
    }
    return {
      kind: 'done',
      requestId: request.requestId,
      value: Object.freeze({
        process: Object.freeze({ id: name, generation: terminal.generation }),
        outputMode: 'terminal',
        output: current.window.output,
        outputPolicy: policy,
        result: current.outcome.promise,
        stop: (mode: 'graceful' | 'forced') => stopLeg(current, mode),
      }),
    }
  }
  return Object.freeze({
    terminal,
    resource,
    start() {
      startResult ??= start()
      return startResult
    },
    execute,
    stop,
    information: (): TerminalInformation => ({ terminal, state, observedCwd: cwd }),
  })
}

export function createWindowsRetainedTerminalFactory(input: PlatformInput) {
  const capacity = input.capacity ?? createWindowsTerminalCapacity()
  return (reservation: ReservationInput) =>
    reserve({
      ...input,
      ...reservation,
      capacity,
      request: {
        ...reservation.request,
        env: { ...reservation.request.env },
        ...(reservation.request.geometry === undefined
          ? {}
          : { geometry: { ...reservation.request.geometry } }),
      },
    })
}

export function createWindowsHostTerminals(
  input: PlatformInput & Omit<ReservationInput, 'request' | 'closed'>,
): HostTerminals {
  const capacity = input.capacity ?? createWindowsTerminalCapacity()
  const entries = new Map<string, NonNullable<ReturnType<typeof reserve>>>()
  const pending = new Set<Promise<unknown>>()
  let sealed = false
  const closed = () => sealed || input.ledger.closed.aborted
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work)
    return work.finally(() => {
      pending.delete(work)
    })
  }
  const find = (terminal: TerminalRef) => {
    const entry = entries.get(terminal.id)
    return entry?.terminal.generation === terminal.generation ? entry : undefined
  }
  const resources = () =>
    [...entries.values()]
      .filter(entry => entry.information().state !== 'closed')
      .map(entry => entry.resource)
  const pruneClosed = () => {
    for (const [id, entry] of entries)
      if (entry.information().state === 'closed') entries.delete(id)
  }
  const facility: TerminalFacility<unknown> = {
    create(request) {
      if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
      pruneClosed()
      if (request.retain !== undefined)
        return Promise.resolve(reject(request.requestId, 'unsupported'))
      const entry = reserve({
        ...input,
        request: {
          ...request,
          env: { ...request.env },
          ...(request.geometry === undefined ? {} : { geometry: { ...request.geometry } }),
        },
        closed,
        capacity,
      })
      if (entry === undefined) return Promise.resolve(reject(request.requestId, 'capacity'))
      entries.set(entry.terminal.id, entry)
      return track(
        entry.start().then(answer => {
          if (entry.information().state === 'closed') entries.delete(entry.terminal.id)
          return answer
        }),
      )
    },
    execute(request) {
      if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
      const entry = find(request.terminal)
      if (entry === undefined) return Promise.resolve(reject(request.requestId, 'notFound'))
      return track(
        entry.execute({
          ...request,
          terminal: { ...request.terminal },
          ...(request.env === undefined ? {} : { env: { ...request.env } }),
          ...(request.stdin === undefined ? {} : { stdin: request.stdin.slice() }),
        }),
      )
    },
    close(request) {
      if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
      const entry = find(request.terminal)
      if (entry === undefined) return Promise.resolve(reject(request.requestId, 'notFound'))
      return track(
        entry
          .stop()
          .then(status => ({ kind: 'done', requestId: request.requestId, value: { status } })),
      )
    },
    async list(request) {
      if (closed()) return reject(request.requestId, 'closed')
      return {
        kind: 'done',
        requestId: request.requestId,
        value: [...entries.values()].map(entry => entry.information()),
      }
    },
  }
  return Object.freeze({
    facility,
    seal() {
      sealed = true
    },
    inFlight: () => pending.size,
    settled: () => Promise.allSettled(pending).then(() => undefined),
    async stopAll() {
      await Promise.all([...entries.values()].map(entry => entry.stop()))
      pruneClosed()
      return resources()
    },
    unconfirmed: resources,
  })
}
