import type { ChildProcess } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  OutputChunk,
  OutputCount,
  OutputSummary,
  ProcessHandle,
  ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import type { HostCommandPrerequisite, PrerequisiteProbe } from './host-probe.ts'
import {
  forceStopScope,
  launchScope,
  newScopeUnit,
  readBootId,
  scopeDescription,
  scopeReference,
  type ScopeCoordinate,
  type ScopeTools,
  type StopStatus,
} from './host-scope.ts'

/** Milliseconds on the monotonic clock, for start bounds and process durations. */
const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a start and measure a process duration. */ performance.now()

/** Bounds of the host command facility. Every value is configuration; the code holds initial values. */
export type HostCommandOptions = Readonly<{
  /** Bytes both output streams of one process may hold before a reader takes them. Initial 1 MiB. */
  maxBufferedBytes?: number
  /** Largest chunk the gate sends. Initial 64 KiB; never more than `maxBufferedBytes`. */
  maxChunkBytes?: number
  /** How long a start waits for the gate to report ready and then started. Initial 10000 ms. */
  startBoundMs?: number
  /** How long a graceful stop waits for the command to exit after SIGTERM. Initial 5000 ms. */
  graceMs?: number
  /** How long one forced stop sequence may take before it answers unconfirmed. Initial 10000 ms. */
  stopBoundMs?: number
  /** How long an unsatisfied probe answer is kept before a start probes again. Initial 60000 ms. */
  probeRetryMs?: number
}>

export type CommandSettings = Readonly<Required<HostCommandOptions>>

export const commandDefaults: CommandSettings = Object.freeze({
  maxBufferedBytes: 1024 * 1024,
  maxChunkBytes: 64 * 1024,
  startBoundMs: 10_000,
  graceMs: 5_000,
  stopBoundMs: 10_000,
  probeRetryMs: 60_000,
})

const byteBounds = ['maxBufferedBytes', 'maxChunkBytes'] as const
const timeBounds = ['startBoundMs', 'graceMs', 'stopBoundMs', 'probeRetryMs'] as const

/** The one check of the command bounds; the provider and the plugin configuration both use it. */
export function commandOptionsIssue(
  options: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const name of byteBounds) {
    const value = options[name]
    if (value !== undefined && !(Number.isSafeInteger(value) && Number(value) >= 1))
      return `${name} must be a whole number of bytes, one or more`
  }
  for (const name of timeBounds) {
    const value = options[name]
    if (value !== undefined && !(typeof value === 'number' && Number.isFinite(value) && value >= 0))
      return `${name} must be a finite number of milliseconds, zero or more`
  }
  const buffered = options['maxBufferedBytes'] ?? commandDefaults.maxBufferedBytes
  const chunk = options['maxChunkBytes'] ?? commandDefaults.maxChunkBytes
  if (Number(chunk) > Number(buffered)) return 'maxChunkBytes must not exceed maxBufferedBytes'
  return undefined
}

export function commandSettings(options: HostCommandOptions = {}): CommandSettings {
  const issue = commandOptionsIssue(options)
  if (issue !== undefined) throw new RangeError(issue)
  return Object.freeze({ ...commandDefaults, ...options })
}

// ---------------------------------------------------------------------------------------------
// Gate frames

export type GateFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'started' }>
  | Readonly<{ kind: 'spawnFailed'; code: string }>
  | Readonly<{ kind: 'data'; stream: 'stdout' | 'stderr'; bytes: Uint8Array }>
  | Readonly<{ kind: 'exit'; exit: Extract<CommandOutcome, { kind: 'completed' }>['exit'] }>

export type FrameStep =
  | Readonly<{ kind: 'frames'; frames: readonly GateFrame[] }>
  | Readonly<{ kind: 'fault'; fault: string }>

type Phase = 'launching' | 'ready' | 'running' | 'ended'

const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function decodeFrame(value: unknown, maxChunkBytes: number): GateFrame | string {
  if (typeof value !== 'object' || value === null) return 'a frame is not an object'
  const type: unknown = Reflect.get(value, 't')
  switch (type) {
    case 'ready':
    case 'started':
      return { kind: type }
    case 'spawnFailed': {
      const code: unknown = Reflect.get(value, 'code')
      return typeof code === 'string'
        ? { kind: 'spawnFailed', code }
        : 'a spawn failure has no code'
    }
    case 'data': {
      const stream: unknown = Reflect.get(value, 's')
      const text: unknown = Reflect.get(value, 'b')
      if (stream !== 'stdout' && stream !== 'stderr') return 'a data frame names an unknown stream'
      if (typeof text !== 'string' || !base64.test(text)) return 'a data frame is not base64'
      const bytes = new Uint8Array(Buffer.from(text, 'base64'))
      if (bytes.length > maxChunkBytes) return 'a data frame exceeds the chunk bound'
      return { kind: 'data', stream, bytes }
    }
    case 'exit': {
      const code: unknown = Reflect.get(value, 'code')
      const signal: unknown = Reflect.get(value, 'signal')
      if (typeof code === 'number' && Number.isSafeInteger(code))
        return { kind: 'exit', exit: { kind: 'code', code } }
      if (typeof signal === 'string') return { kind: 'exit', exit: { kind: 'signal', signal } }
      return { kind: 'exit', exit: { kind: 'unknown' } }
    }
    default:
      return 'an unknown frame type'
  }
}

/** The order the gate must keep: ready, then started or a spawn failure, then data, then one exit. */
function nextPhase(phase: Phase, frame: GateFrame): Phase | string {
  switch (frame.kind) {
    case 'ready':
      return phase === 'launching' ? 'ready' : 'ready out of order'
    case 'started':
      return phase === 'ready' ? 'running' : 'started out of order'
    case 'spawnFailed':
      return phase === 'ready' ? 'ended' : 'a spawn failure out of order'
    case 'data':
      return phase === 'running' ? 'running' : 'data outside the running command'
    case 'exit':
      return phase === 'running' ? 'ended' : 'an exit out of order'
    default: {
      const exhaustive: never = frame
      return exhaustive
    }
  }
}

/**
 * Reads the gate's frame stream. A line has an upper bound (the base64 length of one chunk plus a
 * margin); an overlong line, malformed JSON, an unknown frame, a frame out of order or bytes over the
 * chunk bound are a fault, and the reader stays faulted.
 */
export function createGateReader(input: { maxChunkBytes: number }): Readonly<{
  push(bytes: Uint8Array): FrameStep
}> {
  const maxLine = Math.ceil(input.maxChunkBytes / 3) * 4 + 256
  let pending = Buffer.alloc(0)
  let phase: Phase = 'launching'
  let fault: string | undefined
  const failed = (reason: string): FrameStep => {
    fault ??= reason
    return { kind: 'fault', fault }
  }
  return Object.freeze({
    push(bytes: Uint8Array): FrameStep {
      if (fault !== undefined) return failed(fault)
      pending = Buffer.concat([pending, bytes])
      const frames: GateFrame[] = []
      for (let at = pending.indexOf(0x0a); at !== -1; at = pending.indexOf(0x0a)) {
        if (at > maxLine) return failed('a frame line exceeds its bound')
        const text = pending.subarray(0, at).toString('utf8')
        pending = pending.subarray(at + 1)
        let value: unknown
        try {
          value = JSON.parse(text)
        } catch {
          return failed('a frame is not JSON')
        }
        const frame = decodeFrame(value, input.maxChunkBytes)
        if (typeof frame === 'string') return failed(frame)
        const next = nextPhase(phase, frame)
        if (next !== 'launching' && next !== 'ready' && next !== 'running' && next !== 'ended')
          return failed(next)
        phase = next
        frames.push(frame)
      }
      if (pending.length > maxLine) return failed('a frame line exceeds its bound')
      return { kind: 'frames', frames }
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Bounded output

export type OutputBuffer = Readonly<{
  push(stream: 'stdout' | 'stderr', bytes: Uint8Array): void
  close(): void
  output: AsyncIterable<OutputChunk>
  summary(): Extract<OutputSummary, { mode: 'separate' }>
  bufferedBytes(): number
}>

/**
 * Both streams share one buffer of `maxBufferedBytes`. A chunk that does not fit is dropped whole
 * and counted; the next delivered chunk's `observedOffset` shows the gap. One reader only; after it
 * gives up, every byte, the buffered ones included, counts as discarded.
 */
export function createOutputBuffer(input: { maxBufferedBytes: number }): OutputBuffer {
  type Count = { observedBytes: number; discardedBytes: number }
  const counts: Record<'stdout' | 'stderr', Count> = {
    stdout: { observedBytes: 0, discardedBytes: 0 },
    stderr: { observedBytes: 0, discardedBytes: 0 },
  }
  const queue: OutputChunk[] = []
  let buffered = 0
  let reader: 'none' | 'taken' | 'abandoned' = 'none'
  let closed = false
  let wake: (() => void) | undefined
  const notify = () => {
    const resolve = wake
    wake = undefined
    resolve?.()
  }
  const discardQueued = () => {
    for (const chunk of queue.splice(0))
      if (chunk.stream !== 'terminal') counts[chunk.stream].discardedBytes += chunk.data.length
    buffered = 0
  }
  const done = (): IteratorResult<OutputChunk> => ({ done: true, value: undefined })
  const iterator: AsyncIterator<OutputChunk> = {
    async next() {
      for (;;) {
        const chunk = queue.shift()
        if (chunk !== undefined) {
          buffered -= chunk.data.length
          return { done: false, value: chunk }
        }
        if (closed || reader === 'abandoned') return done()
        await new Promise<void>(resolve => {
          wake = resolve
        })
      }
    },
    async return() {
      reader = 'abandoned'
      discardQueued()
      notify()
      return done()
    },
  }
  const refused: AsyncIterator<OutputChunk> = {
    next: () => Promise.reject(new TypeError('the command output has one reader only')),
    return: async () => done(),
  }
  const count = (stream: 'stdout' | 'stderr'): OutputCount => ({ ...counts[stream] })
  return Object.freeze({
    push(stream, bytes) {
      const observedOffset = counts[stream].observedBytes
      counts[stream].observedBytes += bytes.length
      if (reader === 'abandoned' || buffered + bytes.length > input.maxBufferedBytes) {
        counts[stream].discardedBytes += bytes.length
        return
      }
      queue.push({ stream, data: bytes, observedOffset })
      buffered += bytes.length
      notify()
    },
    close() {
      closed = true
      notify()
    },
    output: {
      [Symbol.asyncIterator]() {
        if (reader !== 'none') return refused
        reader = 'taken'
        return iterator
      },
    },
    summary: () => ({
      mode: 'separate' as const,
      stdout: count('stdout'),
      stderr: count('stderr'),
    }),
    bufferedBytes: () => buffered,
  })
}

// ---------------------------------------------------------------------------------------------
// The facility

type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]

/** The command side of one acquisition: its facility, its admission and its running processes. */
export type HostCommands = Readonly<{
  facility: CommandFacility<unknown>
  /** Admits no new start from now on; running processes go on until they are stopped. */
  seal(): void
  inFlight(): number
  settled(): Promise<void>
  /** Force-stops every process whose stop is not confirmed; answers the resources still unconfirmed. */
  stopAll(): Promise<readonly ManagedResource[]>
  unconfirmed(): readonly ManagedResource[]
}>

export type HostCommandsInput = Readonly<{
  ledger: ResourceLedger
  provider: string
  /** The requester scope of the acquisition; the scope unit's description records it for the listing. */
  scope: ScopeRef
  settings: CommandSettings
  prerequisites: PrerequisiteProbe
  /** Called when a start is refused because a prerequisite is missing. */
  unavailable(missing: readonly HostCommandPrerequisite[]): void
}>

const gateScript = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './command-gate.ts' : './command-gate.js',
    import.meta.url,
  ),
)

function rejected(requestId: string, reason: FacilityReason): FacilityResult<never> {
  return { kind: 'rejected', requestId, reason }
}

const hasNul = (text: string) => text.includes('\u0000')

/** The request checks that need no process, in order; undefined when the request may go on. */
function requestIssue(request: StartRequest): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (request.outputMode !== 'separate' || request.geometry !== undefined) return 'unsupported'
  if (!isAbsolute(request.executable) || hasNul(request.executable)) return 'invalidInput'
  if (!isAbsolute(request.cwd) || hasNul(request.cwd)) return 'invalidInput'
  if (request.args.some(arg => typeof arg !== 'string' || hasNul(arg))) return 'invalidInput'
  for (const [name, value] of Object.entries(request.env))
    if (
      name === '' ||
      name.includes('=') ||
      hasNul(name) ||
      typeof value !== 'string' ||
      hasNul(value)
    )
      return 'invalidInput'
  return undefined
}

/** One process in its own scope: the launcher (`systemd-run` turned gate), its frames and its stop. */
type ProcessEntry = {
  readonly resource: ManagedResource
  readonly coordinate: ScopeCoordinate
  readonly launcher: ChildProcess
  readonly launcherExited: Promise<void>
  readonly buffer: OutputBuffer
  readonly outcome: Promise<CommandOutcome>
  phase: Phase
  confirmed: boolean
  startedAt: number | undefined
  exit: Extract<GateFrame, { kind: 'exit' }>['exit'] | undefined
  stopping: Promise<StopStatus> | undefined
  /** Settles a waiting start with what the gate reported. */
  signal: ((event: 'ready' | 'started' | 'spawnFailed' | 'ended') => void) | undefined
  closeControl(): void
  sendControl(message: Readonly<Record<string, unknown>>): void
  /** Resolves once the gate reported the command's exit, or the gate ended. */
  readonly exited: Promise<void>
}

export function createHostCommands(input: HostCommandsInput): HostCommands {
  const { settings, ledger } = input
  const live = new Set<ProcessEntry>()
  const inFlight = new Set<Promise<unknown>>()
  let sealed = false

  const forceStop = (entry: ProcessEntry, tools: ScopeTools): Promise<StopStatus> => {
    entry.stopping ??= (async () => {
      entry.closeControl()
      const reading = await forceStopScope({
        tools,
        coordinate: entry.coordinate,
        boundMs: settings.stopBoundMs,
        launcherExited: entry.launcherExited,
      })
      let recorded: Awaited<ReturnType<ResourceLedger['stopped']>> = 'unavailable'
      try {
        recorded = await ledger.stopped(entry.resource.key, reading.status)
      } catch {
        /* The ledger did not record it: the stop responsibility stays open. */
      }
      if (reading.status === 'confirmed' && recorded === 'recorded') {
        entry.confirmed = true
        live.delete(entry)
      }
      return reading.status
    })().finally(() => {
      entry.stopping = undefined
    })
    return entry.stopping
  }

  const gracefulStop = async (entry: ProcessEntry, tools: ScopeTools): Promise<StopStatus> => {
    if (entry.exit === undefined && entry.phase !== 'ended') {
      entry.sendControl({ c: 'term' })
      const exited = await Promise.race([
        entry.exited.then(() => true),
        new Promise<false>(resolve => setTimeout(resolve, settings.graceMs, false)),
      ])
      if (!exited) {
        try {
          await ledger.stopped(entry.resource.key, 'unconfirmed')
        } catch {
          /* Unconfirmed either way. */
        }
        return 'unconfirmed'
      }
    }
    return forceStop(entry, tools)
  }

  const launch = (
    resource: ManagedResource,
    coordinate: ScopeCoordinate,
    request: StartRequest,
    tools: ScopeTools,
  ): ProcessEntry => {
    const launcher = launchScope({
      tools,
      unit: coordinate.unit,
      description: scopeDescription(input.scope, resource.key),
      command: process.execPath,
      args: [gateScript, coordinate.unit],
    })
    const buffer = createOutputBuffer({ maxBufferedBytes: settings.maxBufferedBytes })
    const reader = createGateReader({ maxChunkBytes: settings.maxChunkBytes })
    const control = launcher.stdio[3]
    const writable =
      control !== null && control !== undefined && 'write' in control ? control : undefined
    writable?.on('error', () => undefined)
    launcher.stderr?.resume()
    let settleOutcome: (outcome: CommandOutcome) => void = () => undefined
    const outcome = new Promise<CommandOutcome>(resolve => {
      settleOutcome = resolve
    })
    let markExited: () => void = () => undefined
    const exited = new Promise<void>(resolve => {
      markExited = resolve
    })
    const launcherExited = new Promise<void>(resolve => {
      launcher.once('exit', () => resolve())
      launcher.once('error', () => resolve())
    })
    const entry: ProcessEntry = {
      resource,
      coordinate,
      launcher,
      launcherExited,
      buffer,
      outcome,
      phase: 'launching',
      confirmed: false,
      startedAt: undefined,
      exit: undefined,
      stopping: undefined,
      signal: undefined,
      exited,
      closeControl: () => writable?.end(),
      sendControl: message => {
        if (writable !== undefined && !writable.writableEnded)
          writable.write(`${JSON.stringify(message)}\n`)
      },
    }
    const elapsed = () =>
      entry.startedAt === undefined ? 0 : Math.round(monotonicMs() - entry.startedAt)
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      entry.phase = 'ended'
      buffer.close()
      markExited()
      entry.signal?.('ended')
      const exit = entry.exit
      settleOutcome(
        exit === undefined
          ? {
              kind: 'failed',
              reason: 'effectUnknown',
              observedDurationMs: elapsed(),
              output: buffer.summary(),
            }
          : { kind: 'completed', exit, durationMs: elapsed(), output: buffer.summary() },
      )
      // What the command left in its scope, or a gate that went away, is cleared by a forced stop.
      if (!entry.confirmed && entry.startedAt !== undefined) void forceStop(entry, tools)
    }
    launcher.stdout?.on('data', (bytes: Buffer) => {
      if (ended) return
      const step = reader.push(bytes)
      if (step.kind === 'fault') {
        // A broken frame stream invalidates the resource: its outcome is unknown, and it is stopped.
        end()
        void forceStop(entry, tools)
        return
      }
      for (const frame of step.frames) {
        switch (frame.kind) {
          case 'ready':
            entry.phase = 'ready'
            entry.signal?.('ready')
            break
          case 'started':
            entry.phase = 'running'
            entry.startedAt = monotonicMs()
            entry.signal?.('started')
            break
          case 'spawnFailed':
            entry.signal?.('spawnFailed')
            break
          case 'data':
            buffer.push(frame.stream, frame.bytes)
            break
          case 'exit':
            entry.exit = frame.exit
            markExited()
            break
          default: {
            const exhaustive: never = frame
            return exhaustive
          }
        }
      }
    })
    launcher.once('close', end)
    launcher.once('error', end)
    writable?.write(
      `${JSON.stringify({
        executable: request.executable,
        args: request.args,
        cwd: request.cwd,
        env: request.env,
        stdin: request.stdin === undefined ? null : Buffer.from(request.stdin).toString('base64'),
        maxChunkBytes: settings.maxChunkBytes,
      })}\n`,
    )
    live.add(entry)
    return entry
  }

  /** Waits for the next gate event, or answers `late` once `deadline` passes. */
  const nextEvent = (entry: ProcessEntry, deadline: number) =>
    new Promise<'ready' | 'started' | 'spawnFailed' | 'ended' | 'late'>(resolve => {
      if (entry.phase === 'ended') return resolve('ended')
      const timer = setTimeout(
        () => {
          entry.signal = undefined
          resolve('late')
        },
        Math.max(0, deadline - monotonicMs()),
      )
      entry.signal = event => {
        clearTimeout(timer)
        entry.signal = undefined
        resolve(event)
      }
    })

  const handleOf = (entry: ProcessEntry, tools: ScopeTools): ProcessHandle =>
    Object.freeze({
      process: Object.freeze({ id: entry.coordinate.unit, generation: entry.coordinate.bootId }),
      outputMode: 'separate',
      output: entry.buffer.output,
      outputPolicy: Object.freeze({
        maxBufferedBytes: settings.maxBufferedBytes,
        maxChunkBytes: settings.maxChunkBytes,
        overflow: 'discard',
      }),
      result: entry.outcome,
      stop: (mode: 'graceful' | 'forced') =>
        mode === 'graceful' ? gracefulStop(entry, tools) : forceStop(entry, tools),
    })

  const start = async (request: StartRequest): Promise<FacilityResult<ProcessHandle>> => {
    const requestId = request.requestId
    const issue = requestIssue(request)
    if (issue !== undefined) return rejected(requestId, issue)
    const reading = await input.prerequisites.ready()
    if (reading.kind !== 'satisfied') {
      input.unavailable(reading.kind === 'unsatisfied' ? reading.missing : [])
      return rejected(requestId, 'unavailable')
    }
    const tools = reading.tools
    if (sealed) return rejected(requestId, 'closed')
    const bootId = await readBootId()
    if (bootId === undefined) return rejected(requestId, 'unavailable')
    const { key, unit } = newScopeUnit()
    const coordinate = { unit, bootId }
    const resource: ManagedResource = {
      key,
      provider: input.provider,
      reference: scopeReference(coordinate),
    }
    let planned: Awaited<ReturnType<ResourceLedger['plan']>>
    try {
      planned = await ledger.plan(resource)
    } catch {
      planned = 'unavailable'
    }
    if (planned !== 'recorded') return rejected(requestId, planned)
    const deadline = monotonicMs() + settings.startBoundMs
    const entry = launch(resource, coordinate, request, tools)
    const refuse = async (reason: FacilityReason) => {
      await forceStop(entry, tools)
      return rejected(requestId, sealed ? 'closed' : reason)
    }
    const ready = await nextEvent(entry, deadline)
    if (ready === 'late') {
      // No GO is sent from now on; the resource stays for the release or the retirement.
      entry.closeControl()
      return { kind: 'unknown', requestId }
    }
    if (ready !== 'ready') return refuse('unavailable')
    let permit: Awaited<ReturnType<ResourceLedger['permit']>>
    try {
      permit = await ledger.permit(key)
    } catch {
      permit = 'unavailable'
    }
    if (permit !== 'confirmed') return refuse(permit)
    if (sealed) return refuse('closed')
    entry.sendControl({ c: 'go' })
    const started = await nextEvent(entry, deadline)
    switch (started) {
      case 'started':
        return { kind: 'done', requestId, value: handleOf(entry, tools) }
      case 'spawnFailed':
        // The image did not start: the contract's reason for that is `unavailable`.
        return refuse('unavailable')
      case 'ready':
      case 'ended':
      case 'late':
        // GO went out: the command may have started. The resource stays for the stop.
        return { kind: 'unknown', requestId }
      default: {
        const exhaustive: never = started
        return exhaustive
      }
    }
  }

  const facility: CommandFacility<unknown> = {
    start(request) {
      if (sealed) return Promise.resolve(rejected(request.requestId, 'closed'))
      const running = start(request)
      inFlight.add(running)
      return running.finally(() => inFlight.delete(running))
    },
  }

  return Object.freeze({
    facility,
    seal() {
      sealed = true
    },
    inFlight: () => inFlight.size,
    settled: () => Promise.allSettled(inFlight).then(() => undefined),
    async stopAll() {
      const entries = [...live]
      if (entries.length === 0) return []
      // A process exists only after a satisfied probe, and a satisfied answer is kept.
      const reading = await input.prerequisites.ready()
      if (reading.kind !== 'satisfied') return entries.map(entry => entry.resource)
      await Promise.all(entries.map(entry => forceStop(entry, reading.tools)))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
