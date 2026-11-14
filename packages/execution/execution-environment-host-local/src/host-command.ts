import type { ChildProcess } from 'node:child_process'
import { isAbsolute } from 'node:path'
import type { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommandFacility,
  CommandOutcome,
  FacilityReason,
  FacilityResult,
  ManagedResource,
  OriginRef,
  OutputChunk,
  OutputCount,
  OutputSummary,
  ProcessHandle,
  ProviderAcquireInput,
  ResidueReport,
  ResourceLedger,
  RetainedProcessLedger,
  RetainedProcessRef,
} from '@omne-harness/execution-environment-contract'
import type { HostCommandPrerequisite, PrerequisiteProbe } from './host-probe.ts'
import { createCustodySteps, ownedByAcquisition, type Custody } from './command-custody-steps.ts'
import {
  retentionBindingOf,
  retentionExtension,
  type RetentionBinding,
} from './command-retention.ts'
import type { RetainedProcessIndex, RetainedReservation } from './host-retained-processes.ts'
import { createRetainedTail, type RetainedTail, type TailStream } from './retained-tail.ts'
import {
  forceStopScope,
  launchScope,
  newScopeUnit,
  readBootId,
  scopeDescription,
  scopeReference,
  type ScopeCoordinate,
  type ScopeTools,
  type StopReading,
  type StopStatus,
} from './host-scope.ts'

const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a start and measure a process duration. */ performance.now()

export type ResiduePolicy = 'retain' | 'stop'

export type HostCommandOptions = Readonly<{
  maxBufferedBytes?: number
  maxChunkBytes?: number
  startBoundMs?: number
  graceMs?: number
  stopBoundMs?: number
  probeRetryMs?: number
  residuePolicy?: ResiduePolicy
  retainedPerScope?: number
  retainedPollMs?: number
  retainedOutputBytes?: number
}>

export type CommandSettings = Readonly<Required<HostCommandOptions>>

export const commandDefaults: CommandSettings = Object.freeze({
  maxBufferedBytes: 1024 * 1024,
  maxChunkBytes: 64 * 1024,
  startBoundMs: 10_000,
  graceMs: 5_000,
  stopBoundMs: 10_000,
  probeRetryMs: 60_000,
  residuePolicy: 'retain',
  retainedPerScope: 8,
  retainedPollMs: 1_000,
  retainedOutputBytes: 64 * 1024,
})

type OptionRule = Readonly<{ accepts(value: unknown): boolean; mustBe: string }>

const wholeOneOrMore = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1

const byteRule: OptionRule = {
  accepts: wholeOneOrMore,
  mustBe: 'a whole number of bytes, one or more',
}
const timeRule: OptionRule = {
  accepts: value => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  mustBe: 'a finite number of milliseconds, zero or more',
}
const countRule: OptionRule = { accepts: wholeOneOrMore, mustBe: 'a whole number, one or more' }
const keptBytesRule: OptionRule = {
  accepts: value => Number.isSafeInteger(value) && Number(value) >= 0,
  mustBe: 'a whole number of bytes, zero or more',
}
const policyRule: OptionRule = {
  accepts: value => value === 'retain' || value === 'stop',
  mustBe: "'retain' or 'stop'",
}

const optionRules: Readonly<Record<keyof HostCommandOptions, OptionRule>> = {
  maxBufferedBytes: byteRule,
  maxChunkBytes: byteRule,
  startBoundMs: timeRule,
  graceMs: timeRule,
  stopBoundMs: timeRule,
  probeRetryMs: timeRule,
  retainedPerScope: countRule,
  retainedPollMs: countRule,
  retainedOutputBytes: keptBytesRule,
  residuePolicy: policyRule,
}

export function commandOptionsIssue(
  options: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const [name, rule] of Object.entries(optionRules)) {
    const value = options[name]
    if (value !== undefined && !rule.accepts(value)) return `${name} must be ${rule.mustBe}`
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

export type GateFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'started' }>
  | Readonly<{ kind: 'spawnFailed'; code: string }>
  | Readonly<{ kind: 'data'; stream: 'stdout' | 'stderr'; bytes: Uint8Array }>
  | Readonly<{ kind: 'dropped'; stream: 'stdout' | 'stderr'; count: number }>
  | Readonly<{
      kind: 'exit'
      exit: Extract<CommandOutcome, { kind: 'completed' }>['exit']
      members: number | null
    }>

/** A fault carries the frames this push accepted before the refused line, so the split never matters. */
export type FrameStep =
  | Readonly<{ kind: 'frames'; frames: readonly GateFrame[] }>
  | Readonly<{ kind: 'fault'; fault: string; frames: readonly GateFrame[] }>

type Phase = 'launching' | 'ready' | 'running' | 'exited' | 'ended'

const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function decodeSpawnFailed(value: object): GateFrame | string {
  const code: unknown = Reflect.get(value, 'code')
  return typeof code === 'string' ? { kind: 'spawnFailed', code } : 'a spawn failure has no code'
}

function decodeData(value: object, maxChunkBytes: number): GateFrame | string {
  const stream: unknown = Reflect.get(value, 's')
  const text: unknown = Reflect.get(value, 'b')
  if (stream !== 'stdout' && stream !== 'stderr') return 'a data frame names an unknown stream'
  if (typeof text !== 'string' || !base64.test(text)) return 'a data frame is not base64'
  const bytes = new Uint8Array(Buffer.from(text, 'base64'))
  if (bytes.length > maxChunkBytes) return 'a data frame exceeds the chunk bound'
  return { kind: 'data', stream, bytes }
}

function decodeDropped(value: object): GateFrame | string {
  const stream: unknown = Reflect.get(value, 's')
  const count: unknown = Reflect.get(value, 'n')
  if (stream !== 'stdout' && stream !== 'stderr') return 'a drop frame names an unknown stream'
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0)
    return 'a drop frame has no positive count'
  return { kind: 'dropped', stream, count }
}

function decodeExit(value: object): GateFrame | string {
  const code: unknown = Reflect.get(value, 'code')
  const signal: unknown = Reflect.get(value, 'signal')
  const count: unknown = Reflect.get(value, 'members')
  // An absent or null count is an unread count: the conservative reading, never an empty domain.
  if (count !== undefined && count !== null && !(Number.isSafeInteger(count) && Number(count) >= 0))
    return 'an exit frame has a member count that is not a whole number'
  const members = typeof count === 'number' ? count : null
  if (typeof code === 'number' && Number.isSafeInteger(code))
    return { kind: 'exit', exit: { kind: 'code', code }, members }
  if (typeof signal === 'string') return { kind: 'exit', exit: { kind: 'signal', signal }, members }
  return { kind: 'exit', exit: { kind: 'unknown' }, members }
}

function decodeFrame(value: unknown, maxChunkBytes: number): GateFrame | string {
  if (typeof value !== 'object' || value === null) return 'a frame is not an object'
  const type: unknown = Reflect.get(value, 't')
  switch (type) {
    case 'ready':
    case 'started':
      return { kind: type }
    case 'spawnFailed':
      return decodeSpawnFailed(value)
    case 'data':
      return decodeData(value, maxChunkBytes)
    case 'x':
      return decodeDropped(value)
    case 'exit':
      return decodeExit(value)
    default:
      return 'an unknown frame type'
  }
}

type Transition = Readonly<{ from: readonly Phase[]; to?: Phase; fault: string }>

const transitions: Readonly<Record<GateFrame['kind'], Transition>> = {
  ready: { from: ['launching'], to: 'ready', fault: 'ready out of order' },
  started: { from: ['ready'], to: 'running', fault: 'started out of order' },
  spawnFailed: { from: ['ready'], to: 'ended', fault: 'a spawn failure out of order' },
  data: { from: ['running', 'exited'], fault: 'data outside the running command' },
  dropped: { from: ['exited'], fault: 'a drop frame before the exit' },
  exit: { from: ['running'], to: 'exited', fault: 'an exit out of order' },
}

type PhaseStep = Readonly<{ phase: Phase } | { fault: string }>

function nextPhase(phase: Phase, frame: GateFrame): PhaseStep {
  const rule = transitions[frame.kind]
  if (!rule.from.includes(phase)) return { fault: rule.fault }
  return { phase: rule.to ?? phase }
}

export function createGateReader(input: { maxChunkBytes: number }): Readonly<{
  push(bytes: Uint8Array): FrameStep
}> {
  const maxLine = Math.ceil(input.maxChunkBytes / 3) * 4 + 256
  let pending = Buffer.alloc(0)
  let phase: Phase = 'launching'
  let fault: string | undefined
  const failed = (reason: string, frames: readonly GateFrame[] = []): FrameStep => {
    fault ??= reason
    return { kind: 'fault', fault, frames }
  }
  return Object.freeze({
    push(bytes: Uint8Array): FrameStep {
      if (fault !== undefined) return failed(fault)
      pending = Buffer.concat([pending, bytes])
      const frames: GateFrame[] = []
      for (let at = pending.indexOf(0x0a); at !== -1; at = pending.indexOf(0x0a)) {
        if (at > maxLine) return failed('a frame line exceeds its bound', frames)
        const text = pending.subarray(0, at).toString('utf8')
        pending = pending.subarray(at + 1)
        let value: unknown
        try {
          value = JSON.parse(text)
        } catch {
          return failed('a frame is not JSON', frames)
        }
        const frame = decodeFrame(value, input.maxChunkBytes)
        if (typeof frame === 'string') return failed(frame, frames)
        const step = nextPhase(phase, frame)
        if ('fault' in step) return failed(step.fault, frames)
        phase = step.phase
        frames.push(frame)
      }
      if (pending.length > maxLine) return failed('a frame line exceeds its bound', frames)
      return { kind: 'frames', frames }
    },
  })
}

export type LateOutput = Readonly<{
  observed(): Readonly<Record<TailStream, number>>
  append(stream: TailStream, bytes: Uint8Array): void
  drop(stream: TailStream, count: number): void
  keep(input: { capacity: number; savedFrom: Readonly<Record<TailStream, number>> }): RetainedTail
  close(): void
}>

export function createLateOutput(): LateOutput {
  const observed: Record<TailStream, number> = { stdout: 0, stderr: 0 }
  let tail: RetainedTail | undefined
  let open = true
  return Object.freeze({
    observed: () => ({ ...observed }),
    append(stream, bytes) {
      observed[stream] += bytes.length
      if (tail === undefined) return
      tail.append(stream, bytes)
    },
    drop(stream, count) {
      observed[stream] += count
      if (tail === undefined) return
      tail.drop(stream, count)
    },
    keep(input) {
      tail = createRetainedTail(input)
      if (!open) tail.close()
      return tail
    },
    close() {
      open = false
      if (tail === undefined) return
      tail.close()
    },
  })
}

export type OutputBuffer = Readonly<{
  push(stream: 'stdout' | 'stderr', bytes: Uint8Array): void
  close(): void
  output: AsyncIterable<OutputChunk>
  summary(): Extract<OutputSummary, { mode: 'separate' }>
  bufferedBytes(): number
}>

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

type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]

export type HostCommands = Readonly<{
  facility: CommandFacility<unknown>
  seal(): void
  inFlight(): number
  settled(): Promise<void>
  stopAll(): Promise<readonly ManagedResource[]>
  unconfirmed(): readonly ManagedResource[]
}>

export type HostCommandsInput = Readonly<{
  ledger: ResourceLedger
  provider: string
  scope: ScopeRef
  tenant: TenantId
  settings: CommandSettings
  prerequisites: PrerequisiteProbe
  retention?: ProviderAcquireInput['retention'] | undefined
  retained?: RetainedProcessIndex | undefined
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

const invalidPath = (path: string) => !isAbsolute(path) || hasNul(path)

const invalidVariable = ([name, value]: readonly [string, unknown]) =>
  name === '' || name.includes('=') || hasNul(name) || typeof value !== 'string' || hasNul(value)

const invalidArgument = (arg: unknown) => typeof arg !== 'string' || hasNul(arg)

function requestIssue(request: StartRequest): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (request.outputMode !== 'separate' || request.geometry !== undefined) return 'unsupported'
  if (invalidPath(request.executable) || invalidPath(request.cwd)) return 'invalidInput'
  if (request.args.some(invalidArgument)) return 'invalidInput'
  if (Object.entries(request.env).some(invalidVariable)) return 'invalidInput'
  return undefined
}

type ProcessEntry = {
  readonly resource: ManagedResource
  readonly coordinate: ScopeCoordinate
  readonly origin: OriginRef
  readonly launcher: ChildProcess
  readonly launcherExited: Promise<void>
  readonly buffer: OutputBuffer
  readonly outcome: Promise<CommandOutcome>
  phase: Phase
  custody: Custody
  confirmed: boolean
  startedAt: number | undefined
  exit: Extract<GateFrame, { kind: 'exit' }>['exit'] | undefined
  members: number | null
  readonly late: LateOutput
  /** A stop of this handle was asked for; set before the stop's first wait. */
  stopRequested: boolean
  /** The acquisition released the domain; set before the release's first wait. */
  released: boolean
  stopping: Promise<StopStatus> | undefined
  issued: Promise<StopReading> | undefined
  /** The disposition in flight after the exit frame; a stop waits for it to learn the owner. */
  disposition: Promise<unknown> | undefined
  resolving: Promise<void> | undefined
  signal: ((event: 'ready' | 'started' | 'spawnFailed' | 'ended') => void) | undefined
  closeControl(): void
  sendControl(message: Readonly<Record<string, unknown>>): void
  readonly exited: Promise<void>
}

function controlPipe(launcher: ChildProcess): Writable | undefined {
  const control = launcher.stdio[3]
  return control !== null && control !== undefined && 'write' in control ? control : undefined
}

function deferred<T>(): Readonly<{ promise: Promise<T>; settle(value: T): void }> {
  let settle: (value: T) => void = () => undefined
  const promise = new Promise<T>(resolve => {
    settle = resolve
  })
  return { promise, settle }
}

function launcherExit(launcher: ChildProcess): Promise<void> {
  return new Promise<void>(resolve => {
    launcher.once('exit', () => resolve())
    launcher.once('error', () => resolve())
  })
}

function startMessage(request: StartRequest, maxChunkBytes: number): string {
  return `${JSON.stringify({
    executable: request.executable,
    args: request.args,
    cwd: request.cwd,
    env: request.env,
    stdin: request.stdin === undefined ? null : Buffer.from(request.stdin).toString('base64'),
    maxChunkBytes,
  })}
`
}

function applyFrame(entry: ProcessEntry, frame: GateFrame, exited: () => void): void {
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
      if (entry.exit === undefined) {
        entry.buffer.push(frame.stream, frame.bytes)
        break
      }
      entry.late.append(frame.stream, frame.bytes)
      break
    case 'dropped':
      entry.late.drop(frame.stream, frame.count)
      break
    case 'exit':
      entry.exit = frame.exit
      entry.members = frame.members
      exited()
      break
    default: {
      const exhaustive: never = frame
      return exhaustive
    }
  }
}

function nextEvent(entry: ProcessEntry, deadline: number) {
  return new Promise<'ready' | 'started' | 'spawnFailed' | 'ended' | 'late'>(resolve => {
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
}

type Admitted = Readonly<{ tools: ScopeTools; bootId: string }>

export function createHostCommands(input: HostCommandsInput): HostCommands {
  const { settings, ledger, retained } = input
  const live = new Set<ProcessEntry>()
  const inFlight = new Set<Promise<unknown>>()
  let sealed = false
  const { retention, tenant } = input
  const retentionBinding = retentionBindingOf({ retention, retained, scope: input.scope, tenant })

  /** The stop of the unit itself, once per sequence; it marks the domain interrupted before its first wait. */
  const issueStop = (entry: ProcessEntry, tools: ScopeTools): Promise<StopReading> => {
    entry.issued ??= (async () => {
      entry.stopRequested = true
      entry.closeControl()
      return forceStopScope({
        tools,
        coordinate: entry.coordinate,
        boundMs: settings.stopBoundMs,
        launcherExited: entry.launcherExited,
      })
    })()
    return entry.issued
  }

  const forceStop = (entry: ProcessEntry, tools: ScopeTools): Promise<StopStatus> => {
    if (entry.stopping !== undefined) return entry.stopping
    if (!ownedByAcquisition(entry.custody)) return Promise.resolve('unconfirmed')
    entry.stopping = (async () => {
      const reading = await issueStop(entry, tools)
      await entry.disposition
      if (!ownedByAcquisition(entry.custody)) return reading.status
      let recorded: Awaited<ReturnType<ResourceLedger['stopped']>> = 'unavailable'
      try {
        recorded = await ledger.stopped(entry.resource.key, reading.status)
      } catch {}
      if (reading.status === 'confirmed' && recorded === 'recorded') {
        entry.confirmed = true
        live.delete(entry)
      }
      return reading.status
    })().finally(() => {
      entry.stopping = undefined
      entry.issued = undefined
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
        } catch {}
        return 'unconfirmed'
      }
    }
    return forceStop(entry, tools)
  }

  const handoverDetails = (entry: ProcessEntry, view: RetainedProcessLedger) => ({
    unit: entry.coordinate.unit,
    bootId: entry.coordinate.bootId,
    origin: entry.origin,
    gatePid: entry.launcher.pid,
    members: entry.members,
    ledger: view,
  })

  const keepOutput = (entry: ProcessEntry): RetainedTail | 'unsupported' => {
    const frames = entry.launcher.stdout
    if (settings.retainedOutputBytes === 0 || frames === null) {
      frames?.destroy()
      return 'unsupported'
    }
    const counted = entry.buffer.summary()
    const late = entry.late.observed()
    const tail = entry.late.keep({
      capacity: settings.retainedOutputBytes,
      savedFrom: {
        stdout: counted.stdout.observedBytes + late.stdout,
        stderr: counted.stderr.observedBytes + late.stderr,
      },
    })
    // The open channel must not keep the provider's process alive by itself.
    const unref: unknown = Reflect.get(frames, 'unref')
    if (typeof unref === 'function') Reflect.apply(unref, frames, [])
    return tail
  }

  const enterIndex = async (
    entry: ProcessEntry,
    binding: RetentionBinding,
    reservation: RetainedReservation,
  ): Promise<RetainedProcessRef> => {
    entry.sendControl({ c: 'retain' })
    entry.closeControl()
    const output = keepOutput(entry)
    entry.launcher.stderr?.destroy()
    entry.launcher.unref()
    const handed = await binding.index.commit(reservation, {
      ...handoverDetails(entry, binding.processes),
      output,
    })
    return handed.process
  }

  const enterIndexStopping = (
    entry: ProcessEntry,
    binding: RetentionBinding,
    reservation: RetainedReservation,
  ): void => {
    entry.closeControl()
    void binding.index.commitStopping(reservation, {
      ...handoverDetails(entry, binding.processes),
      issued: entry.issued,
    })
  }

  const custody = createCustodySteps<ProcessEntry, ScopeTools>({
    policy: settings.residuePolicy,
    retention,
    binding: retentionBinding,
    startBoundMs: settings.startBoundMs,
    live,
    forceStop,
    enterIndex,
    enterIndexStopping,
  })

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
    const writable = controlPipe(launcher)
    writable?.on('error', () => undefined)
    launcher.stderr?.resume()
    const outcome = deferred<CommandOutcome>()
    const exitedGate = deferred<void>()
    const launcherExited = launcherExit(launcher)
    const entry: ProcessEntry = {
      resource,
      coordinate,
      origin: request.origin,
      launcher,
      launcherExited,
      buffer,
      outcome: outcome.promise,
      phase: 'launching',
      custody: { kind: 'acquisition' },
      confirmed: false,
      startedAt: undefined,
      exit: undefined,
      members: null,
      late: createLateOutput(),
      stopRequested: false,
      released: false,
      stopping: undefined,
      issued: undefined,
      disposition: undefined,
      resolving: undefined,
      signal: undefined,
      exited: exitedGate.promise,
      closeControl: () => writable?.end(),
      sendControl: message => {
        if (writable !== undefined && !writable.writableEnded)
          writable.write(`${JSON.stringify(message)}\n`)
      },
    }
    const elapsed = () =>
      entry.startedAt === undefined ? 0 : Math.round(monotonicMs() - entry.startedAt)
    let ended = false
    const endOutput = () => {
      if (ended) return
      ended = true
      entry.phase = 'ended'
      buffer.close()
      exitedGate.settle()
      entry.signal?.('ended')
    }
    const onExit = () => {
      const exit = entry.exit
      if (exit === undefined) return
      const durationMs = elapsed()
      endOutput()
      const running = custody
        .dispose(entry, tools)
        .catch((): ResidueReport => ({ kind: 'unknown' }))
        .then(residue => {
          outcome.settle({ kind: 'completed', exit, durationMs, output: buffer.summary(), residue })
        })
      entry.disposition = running
    }
    const end = () => {
      if (ended) return
      endOutput()
      outcome.settle({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: elapsed(),
        output: buffer.summary(),
      })
      if (!entry.confirmed && entry.startedAt !== undefined) void forceStop(entry, tools)
    }
    let reading = true
    launcher.stdout?.on('data', (bytes: Buffer) => {
      if (!reading) return
      const step = reader.push(bytes)
      for (const frame of step.frames) applyFrame(entry, frame, onExit)
      if (step.kind === 'fault') {
        reading = false
        entry.late.close()
        end()
        void forceStop(entry, tools)
      }
    })
    launcher.stdout?.once('close', () => entry.late.close())
    launcher.once('close', end)
    launcher.once('error', end)
    writable?.write(startMessage(request, settings.maxChunkBytes))
    live.add(entry)
    return entry
  }

  const stopHandle = async (
    entry: ProcessEntry,
    tools: ScopeTools,
    mode: 'graceful' | 'forced',
  ): Promise<StopStatus> => {
    if (!(await custody.ownsForStop(entry, tools))) return 'unconfirmed'
    return mode === 'graceful' ? gracefulStop(entry, tools) : forceStop(entry, tools)
  }

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
      stop: (mode: 'graceful' | 'forced') => stopHandle(entry, tools, mode),
    })

  const admit = async (request: StartRequest): Promise<FacilityReason | Admitted> => {
    const issue = requestIssue(request)
    if (issue !== undefined) return issue
    const reading = await input.prerequisites.ready()
    if (reading.kind !== 'satisfied') {
      input.unavailable(reading.kind === 'unsatisfied' ? reading.missing : [])
      return 'unavailable'
    }
    if (sealed) return 'closed'
    const bootId = await readBootId()
    return bootId === undefined ? 'unavailable' : { tools: reading.tools, bootId }
  }

  const planResource = async (resource: ManagedResource) => {
    try {
      return await ledger.plan(resource)
    } catch {
      return 'unavailable' as const
    }
  }

  const permitStart = async (key: string) => {
    try {
      return await ledger.permit(key)
    } catch {
      return 'unavailable' as const
    }
  }

  const start = async (request: StartRequest): Promise<FacilityResult<ProcessHandle>> => {
    const requestId = request.requestId
    const admitted = await admit(request)
    if (typeof admitted === 'string') return rejected(requestId, admitted)
    const { tools, bootId } = admitted
    const { key, unit } = newScopeUnit()
    const coordinate = { unit, bootId }
    const resource: ManagedResource = {
      key,
      provider: input.provider,
      reference: scopeReference(coordinate),
    }
    const planned = await planResource(resource)
    if (planned !== 'recorded') return rejected(requestId, planned)
    const deadline = monotonicMs() + settings.startBoundMs
    const entry = launch(resource, coordinate, request, tools)
    const refuse = async (reason: FacilityReason) => {
      await forceStop(entry, tools)
      return rejected(requestId, sealed ? 'closed' : reason)
    }
    const ready = await nextEvent(entry, deadline)
    if (ready === 'late') {
      entry.closeControl()
      return { kind: 'unknown', requestId }
    }
    if (ready !== 'ready') return refuse('unavailable')
    const permit = await permitStart(key)
    if (permit !== 'confirmed') return refuse(permit)
    if (sealed) return refuse('closed')
    entry.sendControl({ c: 'go' })
    const started = await nextEvent(entry, deadline)
    if (started === 'started') return { kind: 'done', requestId, value: handleOf(entry, tools) }
    if (started === 'spawnFailed') return refuse('unavailable')
    return { kind: 'unknown', requestId }
  }

  const facility: CommandFacility<unknown> = {
    containment: 'sealed',
    start(request) {
      const running = start(request)
      inFlight.add(running)
      return running.finally(() => inFlight.delete(running))
    },
    ...(retentionBinding === undefined
      ? {}
      : { retention: retentionExtension(retentionBinding, () => sealed) }),
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
      for (const entry of entries) entry.released = true
      // A process exists only after a satisfied probe, and a satisfied answer is kept.
      const reading = await input.prerequisites.ready()
      if (reading.kind !== 'satisfied') return [...live].map(entry => entry.resource)
      await Promise.all(entries.map(entry => custody.release(entry, reading.tools)))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
