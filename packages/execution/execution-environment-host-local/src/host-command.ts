import type { ChildProcess } from 'node:child_process'
import { isAbsolute } from 'node:path'
import type { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  CommandFacility,
  CommandOutcome,
  CommandRetention,
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
  ResidueStopReason,
  RetainedOutput,
  ResourceLedger,
  RetainedProcessInformation,
  RetainedProcessLedger,
  RetainedProcessRef,
} from '@omne-harness/execution-environment-contract'
import type { HostCommandPrerequisite, PrerequisiteProbe } from './host-probe.ts'
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

/** Milliseconds on the monotonic clock, for start bounds and process durations. */
const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a start and measure a process duration. */ performance.now()

/** What the provider does with processes a one-shot command left behind, when it may keep them. */
export type ResiduePolicy = 'retain' | 'stop'

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
  /** `retain` hands a domain with leftovers to the retention scope when it may; `stop` never does. Initial `retain`. */
  residuePolicy?: ResiduePolicy
  /** Retained processes one retention scope may hold, reservations and stopping ones included. Initial 8. */
  retainedPerScope?: number
  /** Pause between two readings of the retained units' members. Initial 1000 ms. */
  retainedPollMs?: number
  /** Bytes of output kept per stream of each retained process after the handover; 0 keeps none. Initial 65536. */
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

/** What one option must be: a test of a present value, and the words the issue ends with. */
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

/** Every option's rule, in the order of the checks: bytes, then times, then counts, then the policy. */
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

/** The one check of the command bounds; the provider and the plugin configuration both use it. */
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

// ---------------------------------------------------------------------------------------------
// Gate frames

export type GateFrame =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'started' }>
  | Readonly<{ kind: 'spawnFailed'; code: string }>
  | Readonly<{ kind: 'data'; stream: 'stdout' | 'stderr'; bytes: Uint8Array }>
  /** After the exit frame only: `count` bytes of `stream` the gate read but could not send. */
  | Readonly<{ kind: 'dropped'; stream: 'stdout' | 'stderr'; count: number }>
  | Readonly<{
      kind: 'exit'
      exit: Extract<CommandOutcome, { kind: 'completed' }>['exit']
      /** The unit's members other than the gate when the main process had exited; null when unread. */
      members: number | null
    }>

/** A fault carries the frames this push accepted before the refused line, so the split never matters. */
export type FrameStep =
  | Readonly<{ kind: 'frames'; frames: readonly GateFrame[] }>
  | Readonly<{ kind: 'fault'; fault: string; frames: readonly GateFrame[] }>

/** `exited`: after the exit frame, where the gate still relays what the unit writes; `ended`: no more frames. */
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

/** One frame kind's place in the gate's order: the phases that take it, the phase that follows (absent: the same), and the fault elsewhere. */
type Transition = Readonly<{ from: readonly Phase[]; to?: Phase; fault: string }>

/**
 * The order the gate must keep: ready, then started or a spawn failure, then data, then one exit;
 * after the exit, data and drop frames of what the unit still writes.
 */
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

// ---------------------------------------------------------------------------------------------
// Output after the exit frame

/**
 * What the unit writes after the exit frame: counted per stream from the exit frame on, and saved
 * only once a handover gave the domain a tail. The frames reach it before the handover (in the exit
 * frame's chunk, or while the commit is in flight) and after it alike.
 */
export type LateOutput = Readonly<{
  /** Bytes per stream the gate relayed or dropped after the exit frame. */
  observed(): Readonly<Record<TailStream, number>>
  append(stream: TailStream, bytes: Uint8Array): void
  drop(stream: TailStream, count: number): void
  /** The handover: from now on the bytes go to a tail that saves the newest `capacity` bytes per stream after `savedFrom`. */
  keep(input: { capacity: number; savedFrom: Readonly<Record<TailStream, number>> }): RetainedTail
  /** The frame channel ended or broke: the provider observes the streams no longer, and the tail, kept now or later, is closed. */
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
// Custody: what becomes of a domain after its main process exited

/** The retention binding of one exited command, as the disposition sees it. */
export type CustodyBinding = Readonly<{
  /** The retention scope is closed: its release signal or its ledger's close signal fired. */
  closed(): boolean
  /** Takes a place in the retention scope's index, synchronously; `capacity` when it is full. */
  reserve(): RetainedReservation | 'capacity' | 'unavailable'
  plan(): Promise<Awaited<ReturnType<RetainedProcessLedger['plan']>>>
  adopt(): Promise<Awaited<ReturnType<RetainedProcessLedger['adopt']>>>
}>

export type DispositionInput = Readonly<{
  /** The gate's reading of the unit's other members; null when it could not read them. */
  members: number | null
  /** The binding, or the reason there is none: the policy forbids, or the acquisition is unbound. */
  binding: CustodyBinding | 'policy' | 'unbound'
  /** The monotonic deadline of the whole disposition. */
  deadline: number
  /** True once the acquisition released the domain or a stop was requested; read synchronously. */
  interrupted(): boolean
}>

export type Disposition =
  /** The domain stays with the acquisition and is stopped; `residue` says why. */
  | Readonly<{ kind: 'stop'; residue: Extract<ResidueReport, { kind: 'none' | 'stopping' }> }>
  /** The commit took effect: the retention scope owns the domain. */
  | Readonly<{ kind: 'retained'; reservation: RetainedReservation }>
  /** The commit took effect, but the domain was released, stopped or its scope closed meanwhile. */
  | Readonly<{ kind: 'retainedInterrupted'; reservation: RetainedReservation }>
  /** The commit's result could not be read; the reservation stays until it is. */
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

const stopping = (reason: ResidueStopReason): Disposition => ({
  kind: 'stop',
  residue: { kind: 'stopping', reason },
})

/** Waits for `work` until `deadline`; a late answer or a throw reads as `unavailable`. */
async function bounded<T extends string>(
  work: () => Promise<T>,
  deadline: number,
): Promise<T | 'unavailable'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'unavailable'>(resolve => {
    timer = setTimeout(resolve, Math.max(0, deadline - monotonicMs()), 'unavailable')
  })
  try {
    return await Promise.race([work(), late])
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The commit of a handover, in the command's common order: the reservation is held, `adopt` is
 * asked, and the two rechecks run again after the answer. A confirmed commit whose domain was
 * interrupted or whose scope closed meanwhile belongs to the retention scope but is stopped at once.
 * This reading is the decision's; the facility reads both again in the very step that changes the
 * custody, so an interruption between the two readings is not lost.
 */
async function commitHandover(
  binding: CustodyBinding,
  reservation: RetainedReservation,
  deadline: number,
  interrupted: () => boolean,
): Promise<Disposition> {
  const adopted = await bounded(binding.adopt, deadline)
  if (adopted === 'confirmed')
    return interrupted() || binding.closed()
      ? { kind: 'retainedInterrupted', reservation }
      : { kind: 'retained', reservation }
  if (adopted === 'closed') {
    reservation.abort()
    return stopping('closed')
  }
  return { kind: 'unknown', reservation }
}

/**
 * Decides the disposition of a domain whose main process exited (the contract's table and its five
 * conditions, then the handover). The reservation is taken before the first asynchronous wait, and
 * the scope closure and the interruption are read again right before the commit.
 */
export async function decideDisposition(input: DispositionInput): Promise<Disposition> {
  if (input.members === 0) return { kind: 'stop', residue: { kind: 'none' } }
  const binding = input.binding
  if (typeof binding === 'string') return stopping(binding)
  if (binding.closed()) return stopping('closed')
  if (input.interrupted()) return stopping('closed')
  const reservation = binding.reserve()
  if (reservation === 'capacity') return stopping('capacity')
  if (reservation === 'unavailable') return stopping('policy')
  const planned = await bounded(binding.plan, input.deadline)
  if (planned !== 'recorded') {
    reservation.abort()
    return stopping(planned === 'closed' ? 'closed' : 'unbound')
  }
  if (binding.closed() || input.interrupted()) {
    reservation.abort()
    return stopping('closed')
  }
  return commitHandover(binding, reservation, input.deadline, input.interrupted)
}

/** Asks the commit again with the same reservation, to learn whether an unknown handover took effect. */
export function resolveUnknownHandover(input: {
  binding: CustodyBinding
  reservation: RetainedReservation
  deadline: number
  interrupted(): boolean
}): Promise<Disposition> {
  return commitHandover(input.binding, input.reservation, input.deadline, input.interrupted)
}

// ---------------------------------------------------------------------------------------------
// The facility

type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]
type ListRequest = Parameters<CommandRetention<unknown>['list']>[0]
type StopRetainedRequest = Parameters<NonNullable<CommandRetention<unknown>['stop']>>[0]
type OutputRetainedRequest = Parameters<NonNullable<CommandRetention<unknown>['output']>>[0]

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
  /** The tenant of the acquisition; the retained-process index files its entries by it. */
  tenant: TenantId
  settings: CommandSettings
  prerequisites: PrerequisiteProbe
  /** The retention binding of the acquisition, when the integrator gave one. */
  retention?: ProviderAcquireInput['retention'] | undefined
  /** The retained-process index of the provider's state directory; absent when there is none. */
  retained?: RetainedProcessIndex | undefined
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

const invalidPath = (path: string) => !isAbsolute(path) || hasNul(path)

const invalidVariable = ([name, value]: readonly [string, unknown]) =>
  name === '' || name.includes('=') || hasNul(name) || typeof value !== 'string' || hasNul(value)

const invalidArgument = (arg: unknown) => typeof arg !== 'string' || hasNul(arg)

/** The request checks that need no process, in order; undefined when the request may go on. */
function requestIssue(request: StartRequest): FacilityReason | undefined {
  if (request.binding.kind !== 'host_machine') return 'unsupported'
  if (request.outputMode !== 'separate' || request.geometry !== undefined) return 'unsupported'
  if (invalidPath(request.executable) || invalidPath(request.cwd)) return 'invalidInput'
  if (request.args.some(invalidArgument)) return 'invalidInput'
  if (Object.entries(request.env).some(invalidVariable)) return 'invalidInput'
  return undefined
}

const nonEmptyText = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** A retained process reference is an object whose `id` and `generation` are non-empty text. */
const invalidProcessRef = (value: unknown) =>
  typeof value !== 'object' ||
  value === null ||
  !nonEmptyText(Reflect.get(value, 'id')) ||
  !nonEmptyText(Reflect.get(value, 'generation'))

const outputStreams: readonly string[] = ['stdout', 'stderr', 'terminal']

/** An offset of `from`: a known stream, and a whole number of bytes, zero or more. A stream without an offset has no key. */
const invalidOffset = ([stream, offset]: readonly [string, unknown]) =>
  !outputStreams.includes(stream) || !(Number.isSafeInteger(offset) && Number(offset) >= 0)

const invalidFrom = (value: unknown) =>
  value !== undefined &&
  (typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.entries(value).some(invalidOffset))

/** The shape of a retained-process stop, checked before the index is asked (the contract's `invalidInput`). */
function stopRetainedIssue(request: StopRetainedRequest): FacilityReason | undefined {
  if (invalidProcessRef(request.process)) return 'invalidInput'
  if (request.mode !== 'graceful' && request.mode !== 'forced') return 'invalidInput'
  return undefined
}

/** The shape of a retained-process output request, checked before the index is asked. */
function outputRetainedIssue(request: OutputRetainedRequest): FacilityReason | undefined {
  if (invalidProcessRef(request.process) || invalidFrom(request.from)) return 'invalidInput'
  return undefined
}

/**
 * Who carries the stop duty for the domain. `acquisition` from the start; `reserved` while a
 * handover is being decided and committed (still this acquisition's); `unknown` while the commit's
 * result is unread (the reservation is kept, nothing is stopped); `handedOver` once the commit took
 * effect and the index is taking the domain, running or stopping; `retained` once the index holds
 * it running. Only `acquisition` and `reserved` are this acquisition's: a release, a handle stop or
 * the gate's end act on nothing else. Every transition is synchronous, in the same step as the
 * rechecks that justify it, so a wait that returns reads the custody again before it acts.
 */
type Custody =
  | Readonly<{ kind: 'acquisition' }>
  | Readonly<{ kind: 'reserved' }>
  | Readonly<{ kind: 'handedOver' }>
  | Readonly<{ kind: 'retained'; process: RetainedProcessRef }>
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

const ownedByAcquisition = (custody: Custody) =>
  custody.kind === 'acquisition' || custody.kind === 'reserved'

/** One process in its own scope: the launcher (`systemd-run` turned gate), its frames and its stop. */
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
  /** The gate's reading of the unit's other members at exit; null when it could not read them. */
  members: number | null
  /** What the unit writes after the exit frame; a handover gives it the tail the index reads. */
  readonly late: LateOutput
  /** A stop of this handle was asked for; set before the stop's first wait. */
  stopRequested: boolean
  /** The acquisition released the domain; set before the release's first wait. */
  released: boolean
  /** The stop sequence of this acquisition in flight: the unit's stop, then the record. */
  stopping: Promise<StopStatus> | undefined
  /** The unit's stop itself, while in flight; an interrupted handover gives it to the index. */
  issued: Promise<StopReading> | undefined
  /** The disposition in flight after the exit frame; a stop waits for it to learn the owner. */
  disposition: Promise<unknown> | undefined
  /** The one resolution in flight of an unread handover; concurrent askers join it. */
  resolving: Promise<void> | undefined
  /** Settles a waiting start with what the gate reported. */
  signal: ((event: 'ready' | 'started' | 'spawnFailed' | 'ended') => void) | undefined
  closeControl(): void
  sendControl(message: Readonly<Record<string, unknown>>): void
  /** Resolves once the gate reported the command's exit, or the gate ended. */
  readonly exited: Promise<void>
}

/** The control pipe of the launcher (descriptor 3), when the launcher has one to write. */
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

/** Resolves when the launcher has exited or could not start. */
function launcherExit(launcher: ChildProcess): Promise<void> {
  return new Promise<void>(resolve => {
    launcher.once('exit', () => resolve())
    launcher.once('error', () => resolve())
  })
}

/** The first line on the control pipe: the request, with the bound on the gate's frames. */
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

/** Applies one frame of the gate to the process it belongs to; `exited` tells the exit frame. */
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

/** Waits for the next gate event, or answers `late` once `deadline` passes. */
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
  const processes = retention?.processes
  /** The retention binding this acquisition can use: bound, same scope as the requester, indexed. */
  const retentionBinding =
    retention !== undefined &&
    processes !== undefined &&
    retained !== undefined &&
    retention.scope.ref === input.scope.ref
      ? { scope: retention.scope, released: retention.released, processes, index: retained, tenant }
      : undefined
  if (retentionBinding !== undefined) {
    const { scope, released, processes: view, index } = retentionBinding
    index.watchClosure(released, scope, view)
    index.watchClosure(view.closed, scope, view)
  }

  /** The retention scope is closed: its release signal or its ledger's close signal fired. */
  const scopeClosed = () =>
    retentionBinding !== undefined &&
    (retentionBinding.released.aborted || retentionBinding.processes.closed.aborted)

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

  /**
   * The forced stop of a domain this acquisition owns. One that it does not own is not stopped and
   * answers `unconfirmed`: this acquisition cannot confirm a stop it did not issue. A sequence in
   * flight is joined. The record goes to this acquisition's ledger only when the domain is still
   * its own once the disposition settled; a handover that took effect meanwhile gave the unit's
   * stop to the index, which records it on the retention ledger.
   */
  const forceStop = (entry: ProcessEntry, tools: ScopeTools): Promise<StopStatus> => {
    if (entry.stopping !== undefined) return entry.stopping
    if (!ownedByAcquisition(entry.custody)) return Promise.resolve('unconfirmed')
    entry.stopping = (async () => {
      const reading = await issueStop(entry, tools)
      // The owner is known only once the disposition settled; the stop itself did not wait for it.
      await entry.disposition
      if (!ownedByAcquisition(entry.custody)) return reading.status
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
        } catch {
          /* Unconfirmed either way. */
        }
        return 'unconfirmed'
      }
    }
    return forceStop(entry, tools)
  }

  /** The binding of one exited command, as `decideDisposition` sees it. */
  const bindingOf = (entry: ProcessEntry): CustodyBinding | 'policy' | 'unbound' => {
    if (settings.residuePolicy === 'stop') return 'policy'
    if (processes === undefined) return 'unbound'
    if (retentionBinding === undefined) return 'policy'
    const { scope, processes: view, index } = retentionBinding
    return {
      closed: scopeClosed,
      reserve: () => index.reserve(scope, retentionBinding.tenant, entry.resource.key),
      plan: () => view.plan(entry.resource),
      adopt: () => view.adopt(entry.resource.key),
    }
  }

  /** What the handover records about the domain, for the index. */
  const handoverDetails = (entry: ProcessEntry, view: RetainedProcessLedger) => ({
    unit: entry.coordinate.unit,
    bootId: entry.coordinate.bootId,
    origin: entry.origin,
    gatePid: entry.launcher.pid,
    members: entry.members,
    ledger: view,
  })

  /**
   * The tail of a domain handed over now: it starts saving at what each stream observed so far.
   * Without a capacity the frame channel closes, and the gate discards what the unit writes.
   */
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

  /**
   * The commit took effect and the domain is whole: the gate is told, this acquisition drops the
   * control channel, the frame channel feeds the domain's tail, and the index takes the domain as
   * running. The custody changed already.
   */
  const enterIndex = async (
    entry: ProcessEntry,
    reservation: RetainedReservation,
  ): Promise<RetainedProcessRef> => {
    if (retentionBinding === undefined) throw new Error('a handover without a retention binding')
    entry.sendControl({ c: 'retain' })
    entry.closeControl()
    const output = keepOutput(entry)
    entry.launcher.stderr?.destroy()
    entry.launcher.unref()
    const handed = await retentionBinding.index.commit(reservation, {
      ...handoverDetails(entry, retentionBinding.processes),
      output,
    })
    entry.custody = { kind: 'retained', process: handed.process }
    return handed.process
  }

  /**
   * The commit took effect, but the domain was stopped, released or its scope closed meanwhile: it
   * is the retention scope's, and the index holds it as stopping. A stop this acquisition issued
   * already is the one the index waits for, so the stop is recorded once, on the retention ledger.
   */
  const enterIndexStopping = (entry: ProcessEntry, reservation: RetainedReservation): void => {
    if (retentionBinding === undefined) throw new Error('a handover without a retention binding')
    entry.closeControl()
    void retentionBinding.index.commitStopping(reservation, {
      ...handoverDetails(entry, retentionBinding.processes),
      issued: entry.issued,
    })
  }

  /**
   * Carries out a disposition. The custody changes synchronously, in the same step as the reading
   * of `interrupted` and of the scope's closure that justifies it; the effects follow. A commit that
   * took effect leaves `live` here, so a release that returns from a wait finds nothing to stop.
   */
  const apply = async (
    entry: ProcessEntry,
    tools: ScopeTools,
    decision: Disposition,
    interrupted: () => boolean,
  ): Promise<ResidueReport> => {
    switch (decision.kind) {
      case 'stop':
        if (entry.custody.kind !== 'acquisition') entry.custody = { kind: 'acquisition' }
        void forceStop(entry, tools)
        return decision.residue
      case 'unknown':
        entry.custody = { kind: 'unknown', reservation: decision.reservation }
        return { kind: 'unknown' }
      case 'retained':
      case 'retainedInterrupted': {
        entry.custody = { kind: 'handedOver' }
        live.delete(entry)
        if (decision.kind === 'retainedInterrupted' || interrupted() || scopeClosed()) {
          enterIndexStopping(entry, decision.reservation)
          return { kind: 'stopping', reason: 'closed' }
        }
        const process = await enterIndex(entry, decision.reservation)
        return { kind: 'retained', process, processes: entry.members ?? 'unknown' }
      }
      default: {
        const exhaustive: never = decision
        return exhaustive
      }
    }
  }

  /** The disposition after the exit frame, bounded by the start bound, the index's loading included. */
  const dispose = async (entry: ProcessEntry, tools: ScopeTools): Promise<ResidueReport> => {
    const deadline = monotonicMs() + settings.startBoundMs
    let binding = bindingOf(entry)
    if (typeof binding !== 'string' && retentionBinding !== undefined && entry.members !== 0) {
      const index = retentionBinding.index
      const loaded = await bounded(
        () => index.ready().then(complete => (complete ? 'loaded' : 'incomplete')),
        deadline,
      )
      // Markers not read completely within the bound: no place can be taken, as when there is none.
      if (loaded !== 'loaded') binding = 'policy'
    }
    entry.custody = { kind: 'reserved' }
    const interrupted = () => entry.stopRequested || entry.released
    const decision = await decideDisposition({
      members: entry.members,
      binding,
      deadline,
      interrupted,
    })
    return apply(entry, tools, decision, interrupted)
  }

  /**
   * Asks the commit again for a domain whose handover result is unread. One resolution per domain
   * is in flight; a release, a handle stop or a maintenance that arrives meanwhile joins it. A
   * release does not interrupt it: a commit that took effect hands the domain to its scope. A stop
   * this acquisition issued before the answer was lost still does.
   */
  const resolveUnknown = (entry: ProcessEntry, tools: ScopeTools): Promise<void> => {
    entry.resolving ??= (async () => {
      const custody = entry.custody
      if (custody.kind !== 'unknown') return
      const binding = bindingOf(entry)
      if (typeof binding === 'string') return
      const interrupted = () => entry.stopRequested
      const decision = await resolveUnknownHandover({
        binding,
        reservation: custody.reservation,
        deadline: monotonicMs() + settings.startBoundMs,
        interrupted,
      })
      if (decision.kind === 'unknown' || entry.custody.kind !== 'unknown') return
      const running = apply(entry, tools, decision, interrupted)
      entry.disposition = running
      // The stop a settled answer started under this acquisition is part of this resolution.
      const stopping = entry.stopping
      await running
      await stopping
    })()
      // A resolution that itself failed leaves the custody as it is; the askers are not rejected.
      .catch(() => undefined)
      .finally(() => {
        entry.resolving = undefined
      })
    return entry.resolving
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
    /** The gate sends no more output: close the buffer and release every waiter. */
    const endOutput = () => {
      if (ended) return
      ended = true
      entry.phase = 'ended'
      buffer.close()
      exitedGate.settle()
      entry.signal?.('ended')
    }
    /** The exit frame: the outcome waits for the disposition, which precedes any stop or handover. */
    const onExit = () => {
      const exit = entry.exit
      if (exit === undefined) return
      const durationMs = elapsed()
      endOutput()
      const running = dispose(entry, tools)
        // A disposition that itself failed has no result: the domain stays with the acquisition.
        .catch((): ResidueReport => ({ kind: 'unknown' }))
        .then(residue => {
          outcome.settle({ kind: 'completed', exit, durationMs, output: buffer.summary(), residue })
        })
      entry.disposition = running
    }
    /** The gate went away, or its frames broke, without an exit frame: the outcome is unknown. */
    const end = () => {
      if (ended) return
      endOutput()
      outcome.settle({
        kind: 'failed',
        reason: 'effectUnknown',
        observedDurationMs: elapsed(),
        output: buffer.summary(),
      })
      // What the command left in its scope, or a gate that went away, is cleared by a forced stop.
      if (!entry.confirmed && entry.startedAt !== undefined) void forceStop(entry, tools)
    }
    // Frames are read after the exit frame too: what the unit writes then may go to a retained tail.
    let reading = true
    launcher.stdout?.on('data', (bytes: Buffer) => {
      if (!reading) return
      const step = reader.push(bytes)
      for (const frame of step.frames) applyFrame(entry, frame, onExit)
      if (step.kind === 'fault') {
        // A broken frame stream invalidates the resource: its outcome is unknown, and it is stopped.
        // After the exit frame the outcome stands, and a handed-over domain is not this one's to
        // stop; its tail is closed, since nothing is observed from here on.
        reading = false
        entry.late.close()
        end()
        void forceStop(entry, tools)
      }
    })
    // The frame channel is gone: a tail the handover gave, or gives later, observes nothing more.
    launcher.stdout?.once('close', () => entry.late.close())
    launcher.once('close', end)
    launcher.once('error', end)
    writable?.write(startMessage(request, settings.maxChunkBytes))
    live.add(entry)
    return entry
  }

  /**
   * A stop asked through the handle. It acts only on a domain this acquisition owns: one whose
   * handover is unread is read first, not stopped; one the retention scope owns is left alone and
   * the answer is `unconfirmed`, since this acquisition cannot confirm a stop it did not issue.
   */
  const stopHandle = async (
    entry: ProcessEntry,
    tools: ScopeTools,
    mode: 'graceful' | 'forced',
  ): Promise<StopStatus> => {
    if (entry.custody.kind === 'unknown') await resolveUnknown(entry, tools)
    if (!ownedByAcquisition(entry.custody)) return 'unconfirmed'
    return mode === 'graceful' ? gracefulStop(entry, tools) : forceStop(entry, tools)
  }

  /**
   * The release of one domain, after the release's wait: the custody is read again here, so a
   * handover that took effect meanwhile is left alone. A domain whose handover is unread is asked
   * again, not stopped; the resolution never rejects a release.
   */
  const release = async (entry: ProcessEntry, tools: ScopeTools): Promise<void> => {
    switch (entry.custody.kind) {
      case 'acquisition':
      case 'reserved':
        await forceStop(entry, tools)
        return
      case 'unknown':
        await resolveUnknown(entry, tools)
        return
      case 'handedOver':
      case 'retained':
        return
      default: {
        const exhaustive: never = entry.custody
        return exhaustive
      }
    }
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

  /** The checks before anything exists, in the order of the SPEC: the request, the platform, the facade. */
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
      // No GO is sent from now on; the resource stays for the release or the retirement.
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
    // The image did not start: the contract's reason for that is `unavailable`.
    if (started === 'spawnFailed') return refuse('unavailable')
    // GO went out: the command may have started. The resource stays for the stop.
    return { kind: 'unknown', requestId }
  }

  /** The retained processes of the retention scope, from the index; an unreadable index is not empty. */
  const list = async (
    request: ListRequest,
  ): Promise<FacilityResult<readonly RetainedProcessInformation[]>> => {
    if (sealed || retentionBinding === undefined) return rejected(request.requestId, 'closed')
    const listed = await retentionBinding.index.list(
      retentionBinding.scope,
      retentionBinding.tenant,
    )
    if (listed === 'unavailable') return rejected(request.requestId, 'unavailable')
    return { kind: 'done', requestId: request.requestId, value: listed }
  }

  /**
   * Stops a retained process of the retention scope. Both modes run the forced stop sequence: the
   * main process a graceful stop would signal has exited already.
   */
  const stopRetained = async (
    request: StopRetainedRequest,
  ): Promise<FacilityResult<{ readonly status: 'confirmed' | 'unconfirmed' }>> => {
    const issue = stopRetainedIssue(request)
    if (issue !== undefined) return rejected(request.requestId, issue)
    if (sealed || retentionBinding === undefined) return rejected(request.requestId, 'closed')
    const { index, scope, tenant: owner, processes: view } = retentionBinding
    const answer = await index.stopRef(request.process, scope, owner, view)
    if (answer === 'notFound' || answer === 'unavailable')
      return rejected(request.requestId, answer)
    return { kind: 'done', requestId: request.requestId, value: { status: answer } }
  }

  /** What a retained process of the retention scope wrote after the handover, from its tail. */
  const outputRetained = async (
    request: OutputRetainedRequest,
  ): Promise<FacilityResult<RetainedOutput>> => {
    const issue = outputRetainedIssue(request)
    if (issue !== undefined) return rejected(request.requestId, issue)
    if (sealed || retentionBinding === undefined) return rejected(request.requestId, 'closed')
    const { index, scope, tenant: owner } = retentionBinding
    const answer = await index.output(request.process, scope, owner, request.from)
    if (answer === 'notFound' || answer === 'unavailable')
      return rejected(request.requestId, answer)
    return { kind: 'done', requestId: request.requestId, value: answer }
  }

  const facility: CommandFacility<unknown> = {
    // Every command runs in its own systemd scope, or does not run: no process can leave it.
    containment: 'sealed',
    start(request) {
      const running = start(request)
      inFlight.add(running)
      return running.finally(() => inFlight.delete(running))
    },
    ...(retentionBinding === undefined
      ? {}
      : { retention: { list, stop: stopRetained, output: outputRetained } }),
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
      await Promise.all(entries.map(entry => release(entry, reading.tools)))
      return [...live].map(entry => entry.resource)
    },
    unconfirmed: () => [...live].map(entry => entry.resource),
  })
}
