// The bounded exhaustive explorer of the session. It drives the real `Session` on the ports of
// `ports.ts` and enumerates, breadth first, every schedule within the scenario's bounds: which
// client operation starts (`discover`, `call`, `listActions`, `updateTask`, `cancelRequest`,
// `close`), when a call's signal fires, which pending port call is answered and how, which event
// the shared stream delivers, and when a probe timer fires. Between two choices every promise
// reaction runs (one macrotask turn), so a choice is taken only in a quiescent state, as on a
// real event loop.
//
// A state is a run replayed from the start: promises cannot be copied. States are told apart by
// their projection (`projection`); two schedules that reach the same projection are explored once.
// Every state reached is checked against the invariants of `properties.ts`. With `maxDepth`, the
// states at that depth are driven to rest instead (every timer fires, then every port answers
// lawfully, then `close()`) and checked on the way. The actions, and the model actions of
// `verification/models/TransportSession.tla` they map to, are in `verification/README.md`.
//
// The engine is the one of `packages/mcp/mcp/tests/model/explore.ts` (the connection table),
// written again here for the session's ports; what the two share is listed in the mapping.
import type { Outcome } from '@omne-harness/operation-result'
import { isConnectionTarget, type PeerAnswer, type PeerIdentity } from '@omne-harness/mcp-contract'
import type {
  ListingPage,
  ProcessHandle,
  SentCall,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import { actionNameOf, generationOf, jsonOf, taskIdOf } from '@omne-harness/mcp-contract/testing'
import { Session } from '../../src/session.ts'
import {
  callAfterSettled,
  closeOrder,
  closeReachesLine,
  contextLabel,
  credentialAfterClose,
  describeReason,
  operationRejected,
  phaseOf,
  rejectionsBounded,
  resendBounded,
  stopAnswers,
  unhandledRejection,
  unsettledAfterStop,
  type Found,
  type LineEndCause,
  type OpKind,
  type OpView,
  type Phase,
  type RunView,
} from './properties.ts'
import {
  BREACHES,
  ExplorerLine,
  HANG,
  PORT_ANSWERS,
  PortFault,
  TARGET,
  WIRE_FAULTS,
  contexts,
  emptyLedger,
  explorerCredential,
  explorerMetadataFetch,
  explorerScheduler,
  type Answer,
  type CallDesk,
  type CallRequest,
  type Ledger,
  type PortCall,
  type PortName,
  type Timer,
} from './ports.ts'

/** The material a scenario drives the session on. `http-bare` is Streamable HTTP without a handle. */
export type Material = 'stdio' | 'http' | 'http-bare'

export type LineEnd = 'ended' | 'exited' | 'broken'

/** The bounds of one exploration. */
export type Scenario = Readonly<{
  name: string
  material: Material
  /** Whether the line offers the GET of the legacy HTTP+SSE fallback. */
  withGet?: boolean
  discovers: number
  calls: number
  lists: number
  updates?: number
  /** `cancelRequest` calls, each on a sent call. */
  cancels?: number
  close: boolean
  /** Whether a call's signal may fire. */
  signals?: boolean
  /** Peer `ping` requests on the shared stream (stdio, or the SSE mode). */
  pings?: number
  /** How the shared stream may end, at most once. */
  lineEnds?: readonly LineEnd[]
  /** The answers the explorer may choose per port; a port not listed answers lawfully only. */
  answers: Partial<Readonly<Record<PortName, readonly Answer[]>>>
  /** How many port breaches (`reject`, `fail`) one schedule may take in total. */
  breaches: number
  /** How many wire faults (statuses, broken streams, unsent, aborted, ping) one schedule may take. */
  wireFaults: number
  /** Schedules longer than this are not extended; their last states are driven to rest. */
  maxDepth?: number
  /** Explore every schedule, without merging states of equal projection (a cross-check). */
  exhaustivePaths?: boolean
}>

/** One choice of a schedule. */
export type Step = Readonly<{ act: string }>

/** A violation, with the shortest schedule that showed it and in how many states it was seen. */
export type Violation = Found & Readonly<{ trace: readonly string[]; depth: number; seen: number }>

export type Exploration = Readonly<{
  scenario: Scenario
  /** Distinct projected states reached (schedules, with `exhaustivePaths`). */
  states: number
  /** Schedules replayed, each one on a fresh session. */
  runs: number
  /** Length of the longest schedule explored. */
  depth: number
  /** States at `maxDepth` that were driven to rest instead of extended. */
  frontier: number
  elapsedMs: number
  violations: readonly Violation[]
  /** Every distinct action some schedule took, sorted: what the bounds actually reached. */
  actions: readonly string[]
}>

/** The same schedule replayed differently: a stop condition of the closure spec. */
export class Nondeterminism extends Error {
  override readonly name = 'Nondeterminism'
}

/** Lawful steps after which a run driven to rest is taken as not coming to rest. */
const REST_STEPS = 100

/** The probe time: the explorer fires the timer; the value never elapses. */
const PROBE_TIMEOUT_MS = 1000

const VERSIONS = ['2026-07-28'] as const

const target = (() => {
  if (!isConnectionTarget(TARGET)) throw new TypeError('bad target')
  return TARGET
})()

const echo = { action: actionNameOf('echo'), args: jsonOf({}) }
const taskId = taskIdOf('task-1')

function idleProcess(): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>(),
    stdout: new ReadableStream<Uint8Array>(),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: () => Promise.resolve('tree-confirmed'),
  }
}

/** Lets every promise reaction run: one macrotask turn, after Node reported unhandled rejections. */
function drain(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

const SOURCE_FRAME =
  /at (?:async )?(?:(\S+) \()?(?:file:\/\/)?\S*\/packages\/mcp\/mcp-host-local\/src\/([\w.-]+\.ts):\d+:\d+\)?$/

/** Frames enough to reach the code a port call returns to; fewer frames format faster. */
const SITE_FRAMES = 12

/** The functions of `src/` on the stack of the caller, innermost first, as `name@file`. */
function siteOf(): string {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = SITE_FRAMES
  const stack = new Error('site').stack ?? ''
  Error.stackTraceLimit = limit
  const frames: string[] = []
  for (const line of stack.split('\n')) {
    const match = SOURCE_FRAME.exec(line.trim())
    if (match !== null) frames.push(`${match[1] ?? '<anonymous>'}@${match[2] ?? '?'}`)
  }
  return frames.join(' < ')
}

function failureLabel(failure: TransportFailure): string {
  switch (failure.kind) {
    case 'not-sent':
      return `not-sent/${failure.cause}`
    case 'no-answer':
      return `no-answer/${failure.cause}`
    case 'error-answer':
      return 'error-answer'
    case 'answer-malformed':
      return `answer-malformed/${failure.what}`
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

function outcomeLabel<T>(outcome: Outcome<T, TransportFailure>, ok: (value: T) => string): string {
  return 'failure' in outcome ? failureLabel(outcome.failure) : ok(outcome.ok)
}

function answerLabel(answer: PeerAnswer): string {
  return answer.kind === 'no-answer' ? `no-answer/${answer.cause}` : answer.kind
}

type PendingCall = Readonly<{ call: PortCall; settle: (answer: Answer) => void }>

type Op = {
  readonly name: string
  readonly kind: OpKind
  status: OpView['status']
  result: string
  signalled: boolean
  readonly requests: string[]
  readonly controller: AbortController
  /** The request id `call()` handed out, for `cancelRequest`. */
  requestId: string | undefined
  cancelled: boolean
}

type Budget = {
  discovers: number
  calls: number
  lists: number
  updates: number
  cancels: number
  close: number
  pings: number
  lineEnd: number
  breaches: number
  wireFaults: number
}

/** A violation one run found: the step it showed in (1 for the first), and the schedule up to it. */
type Report = Found & Readonly<{ step: number; trace: readonly string[] }>

const OP_LETTER: Readonly<Record<OpKind, string>> = {
  discover: 'd',
  call: 'c',
  list: 'l',
  update: 'u',
  cancel: 'x',
  close: 'k',
}

/** One schedule replayed on a fresh session. */
class Run implements RunView, CallDesk {
  readonly ledger: Ledger = emptyLedger()
  readonly ops: Op[] = []
  readonly log: string[] = []
  readonly reports: Report[] = []
  closeCalled = false
  closeReturned = false
  lineCloseAnswered = false
  phasesAtClose: Map<string, Phase> | undefined
  readonly phasesAtSignal = new Map<string, Phase>()
  lineEnd: Readonly<{ cause: LineEndCause; phases: Map<string, Phase> }> | undefined
  /** Set when the run is driven to rest: no breaches, no wire faults from then on. */
  private resting = false
  private readonly scenario: Scenario
  private readonly session: Session
  private readonly line: ExplorerLine
  private readonly hasHandle: boolean
  /** The port calls the explorer may still answer. */
  private calls: PendingCall[] = []
  /** The port calls answered `hang`: pending for ever, not answered even at rest. */
  private readonly hung: PendingCall[] = []
  private readonly timerList: Timer[] = []
  /** The requests whose answer the explorer delivered as a result. */
  private readonly delivered = new Set<string>()
  /** The streams that delivered their result; their lawful next answer is `end`. */
  private readonly streamsAnswered = new Set<string>()
  private readonly reported = new Set<string>()
  private readonly unhandled: unknown[] = []
  private readonly left: Budget
  private refusals = 0
  private seq = 0
  private steps = 0

  constructor(scenario: Scenario) {
    this.scenario = scenario
    this.hasHandle = scenario.material === 'http'
    this.left = {
      discovers: scenario.discovers,
      calls: scenario.calls,
      lists: scenario.lists,
      updates: scenario.updates ?? 0,
      cancels: scenario.cancels ?? 0,
      close: scenario.close ? 1 : 0,
      pings: scenario.pings ?? 0,
      lineEnd: (scenario.lineEnds ?? []).length > 0 ? 1 : 0,
      breaches: scenario.breaches,
      wireFaults: scenario.wireFaults,
    }
    const kind = scenario.material === 'stdio' ? 'stdio' : 'streamable-http'
    this.line = new ExplorerLine(kind, this, scenario.withGet === true)
    const generation = generationOf(1)
    const material: TransportMaterial =
      kind === 'stdio'
        ? { kind, process: idleProcess(), generation, instructionsByteLimit: 4096 }
        : {
            kind,
            target,
            generation,
            instructionsByteLimit: 4096,
            ...(this.hasHandle
              ? { credential: explorerCredential(this, () => this.closeReturned) }
              : {}),
          }
    this.session = new Session(this.line, material, {
      clientInfo: { name: 'explorer', version: '1' },
      versions: VERSIONS,
      probeTimeoutMs: PROBE_TIMEOUT_MS,
      fetchMetadata: explorerMetadataFetch(this),
      schedule: explorerScheduler(this.timerList),
      // A defect of the session is a violation: it is reported like a rejection nobody handled.
      reportDefect: defect => this.rejectedUnhandled(defect),
    })
  }

  get pending(): readonly PortCall[] {
    return [...this.calls, ...this.hung].map(item => item.call)
  }

  get timers(): number {
    return this.timerList.length
  }

  /**
   * What decides the future of the run: the operations as their callers see them, the pending
   * calls with the code their answers go to, the streams, the timers, the ledger and the budget.
   */
  projection(): string {
    return JSON.stringify({
      ops: this.ops.map(
        op =>
          `${op.name} ${op.status} ${op.result} ${op.signalled ? 'S' : ''}${op.cancelled ? 'X' : ''} ${op.requests.join(',')}`,
      ),
      calls: this.calls
        .map(({ call }) =>
          [
            call.port,
            call.subject,
            contextLabel(call.context),
            call.site,
            call.signal?.aborted === true ? 'aborted' : '',
          ].join('|'),
        )
        .sort(),
      hung: this.hung
        .map(({ call }) => [call.port, call.subject, contextLabel(call.context)].join('|'))
        .sort(),
      streams: [...this.line.streams].map(
        ([id, stream]) =>
          `${id}:${stream.aborted ? 'aborted' : 'open'}:${this.streamsAnswered.has(id) ? 'answered' : ''}`,
      ),
      timers: this.timerList.map(timer => timer.name),
      ledger: {
        sent: this.ledger.sent.map(
          item =>
            `${item.method}:${item.id ?? ''}:${item.session ? 's' : ''}${item.authorized ? 'a' : ''}:${item.cancels ?? ''}`,
        ),
        authorizations: this.ledger.authorizations,
        rejections: this.ledger.rejections,
        afterClose: this.ledger.credentialCallsAfterClose,
        abortedStreams: this.ledger.abortedStreams,
        lineCloses: this.ledger.lineCloses,
        events: this.ledger.events,
        get: [this.ledger.getEntered, this.ledger.getDiscarded],
      },
      flags: [this.closeCalled, this.closeReturned, this.lineCloseAnswered, this.refusals],
      atClose: this.phasesAtClose === undefined ? undefined : [...this.phasesAtClose],
      atSignal: [...this.phasesAtSignal],
      atLineEnd:
        this.lineEnd === undefined ? undefined : [this.lineEnd.cause, [...this.lineEnd.phases]],
      delivered: [...this.delivered],
      left: this.left,
    })
  }

  /** The actions a schedule may take now, in a fixed order. */
  enabled(): string[] {
    const acts: string[] = []
    if (this.left.discovers > 0) acts.push('discover')
    if (this.left.calls > 0) acts.push('call')
    if (this.left.lists > 0) acts.push('list')
    if (this.left.updates > 0) acts.push('update')
    if (this.left.close > 0) acts.push('close')
    for (const op of this.ops) {
      if (op.kind !== 'call') continue
      if (this.scenario.signals === true && !op.signalled && op.status !== 'answered')
        acts.push(`signal ${op.name}`)
      if (this.left.cancels > 0 && !op.cancelled && op.status === 'sent')
        acts.push(`cancel ${op.name}`)
    }
    if (this.left.pings > 0 && this.shared) acts.push('ping')
    if (this.left.lineEnd > 0 && this.shared)
      for (const end of this.scenario.lineEnds ?? []) acts.push(`event ${end}`)
    for (const timer of this.timerList) acts.push(`fire ${timer.name}`)
    for (const [label, pending] of this.labelled())
      for (const answer of this.answersOf(pending.call)) acts.push(`answer ${label} ${answer}`)
    return acts
  }

  /** Whether the line has a shared stream the peer writes on: stdio, or the SSE mode. */
  private get shared(): boolean {
    return this.line.kind === 'stdio' || this.line.inSseMode
  }

  /** The answers the explorer may give one pending call now, within the scenario's menus. */
  private answersOf(call: PortCall): readonly Answer[] {
    const menu: readonly Answer[] = this.scenario.answers[call.port] ?? [PORT_ANSWERS[call.port][0]]
    const lawful: readonly Answer[] = [...new Set([PORT_ANSWERS[call.port][0], ...menu])]
    return lawful.filter(answer => this.mayAnswer(call, answer))
  }

  private mayAnswer(call: PortCall, answer: Answer): boolean {
    if (!this.lineAllows(call, answer)) return false
    if (BREACHES.has(answer)) return !this.resting && this.left.breaches > 0
    if (WIRE_FAULTS.has(answer)) return !this.resting && this.left.wireFaults > 0
    return true
  }

  /** What the line kind and the state of the exchange allow: a status only on HTTP, and so on. */
  private lineAllows(call: PortCall, answer: Answer): boolean {
    const aborted = call.signal?.aborted === true
    switch (call.port) {
      case 'line.send': {
        if (answer === 'sent') return this.shared
        if (answer === 'stream' || answer === 'empty') return !this.shared
        if (answer === '404+session') {
          const sent = this.ledger.sent.find(item => item.id === call.subject)
          return !this.shared && sent?.session === true
        }
        if (answer === 'aborted') return !this.shared || aborted
        if (answer.endsWith('xx') || answer.startsWith('40')) return !this.shared
        // After the signal ended the exchange, the line reports `aborted` or answers late.
        if (aborted) return answer === 'answer' || answer === 'reject'
        return true
      }
      case 'stream.next': {
        const stream = this.line.streams.get(call.subject)
        if (stream?.aborted === true) return answer === 'break'
        if (answer === 'result') return !this.streamsAnswered.has(call.subject)
        return true
      }
      default:
        return true
    }
  }

  async perform(step: Step): Promise<void> {
    this.steps += 1
    this.log.push(step.act)
    const [verb = '', first = '', second = ''] = step.act.split(' ')
    switch (verb) {
      case 'discover':
        this.left.discovers -= 1
        this.discover()
        break
      case 'call':
        this.left.calls -= 1
        this.call()
        break
      case 'list':
        this.left.lists -= 1
        this.list()
        break
      case 'update':
        this.left.updates -= 1
        this.update()
        break
      case 'close':
        this.left.close -= 1
        this.close()
        break
      case 'signal':
        this.signal(first)
        break
      case 'cancel':
        this.left.cancels -= 1
        this.cancel(first)
        break
      case 'ping':
        this.left.pings -= 1
        this.line.pushPing()
        break
      case 'event':
        this.left.lineEnd -= 1
        this.event(first)
        break
      case 'fire':
        this.fire(first)
        break
      case 'answer':
        await this.answer(first, second)
        return
      default:
        throw new Nondeterminism(`unknown action ${step.act}`)
    }
    await drain()
    this.afterStep()
  }

  /**
   * Drives the run to rest, for a state at the depth bound: every timer fires with no port
   * answering, then every port answers lawfully, then `close()`, and every port again.
   */
  async rest(): Promise<void> {
    this.resting = true
    this.log.push('-- driven to rest: every timer fires, no port answers')
    while (this.timerList[0] !== undefined) await this.fireFirst()
    this.log.push('-- every port answers lawfully')
    await this.settleAll()
    if (!this.closeCalled) {
      this.log.push('-- close')
      this.close()
      await drain()
      this.afterStep()
      await this.settleAll()
    }
    const waiting = this.ops.filter(op => op.status === 'waiting' || op.status === 'sent')
    if (waiting.length > 0)
      this.report([
        {
          property: 'V4',
          signature: 'V4-no-rest',
          detail: `${waiting.map(op => op.name).join(', ')} still waiting after every port answered lawfully; hung: ${this.hung.map(item => `${item.call.port} ${item.call.subject}`).join(', ') || 'none'}`,
        },
      ])
  }

  rejectedUnhandled(reason: unknown): void {
    this.unhandled.push(reason)
  }

  open<T>(request: CallRequest<T>): Promise<T> {
    const context = contexts.getStore()
    const call: PortCall = {
      seq: this.seq,
      port: request.port,
      subject: request.subject,
      context,
      signal: request.signal,
      site: siteOf(),
    }
    this.seq += 1
    // A closed line settles its outstanding I/O at once: both real lines abort their writes,
    // streams and GET inside `close()`, so a send or a stream read no longer hangs behind it.
    if (request.port === 'line.close') this.settleLineCalls()
    const op = this.ops.find(item => item.name === context?.op)
    if (op !== undefined) {
      if (request.port === 'line.send') {
        const sent = this.ledger.sent.at(-1)
        if (sent?.id !== undefined) op.requests.push(sent.id)
      }
      if (op.status === 'answered') this.report(callAfterSettled(call, new Set(op.requests)))
    }
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    const pending: PendingCall = {
      call,
      settle: answer => {
        if (answer === 'reject') reject(new PortFault(call))
        else if (answer === 'break') reject(new Error(`the stream of ${call.subject} broke`))
        else resolve(request.value(answer))
      },
    }
    this.calls.push(pending)
    // A signal-bearing port honours an abort at once, as the real lines and `fetch` do (`line.ts`:
    // the signal ends the wait), unless the explorer answered it `hang` first: a hung call left
    // the answerable calls and stays pending. A port with no signal (the credential handle, a
    // stream read) is answered by the explorer, left pending, or hung.
    if (request.signal !== undefined) {
      const honour = () => this.honourAbort(pending)
      if (request.signal.aborted) queueMicrotask(honour)
      else request.signal.addEventListener('abort', honour, { once: true })
    }
    return promise
  }

  /** A lawful port answers an abort at once: what the real lines and `fetch` do. */
  private honourAbort(pending: PendingCall): void {
    if (!this.calls.includes(pending)) return
    this.calls = this.calls.filter(item => item !== pending)
    const answer: Answer =
      pending.call.port === 'line.send'
        ? 'aborted'
        : pending.call.port === 'line.openGet'
          ? 'unavailable'
          : 'reject'
    this.log.push(`  ${pending.call.port} ${pending.call.subject} honours the abort: ${answer}`)
    this.account(pending.call, answer)
    pending.settle(answer)
  }

  /** The pending calls by label: port and subject, numbered when two are alike. */
  private labelled(): Map<string, PendingCall> {
    const labelled = new Map<string, PendingCall>()
    for (const pending of this.calls) {
      const base = `${pending.call.port}:${pending.call.subject}`
      let label = base
      for (let count = 2; labelled.has(label); count += 1) label = `${base}#${count}`
      labelled.set(label, pending)
    }
    return labelled
  }

  private newOp(kind: OpKind): Op {
    const count = this.ops.filter(op => op.kind === kind).length + 1
    const op: Op = {
      name: `${OP_LETTER[kind]}${count}`,
      kind,
      status: 'waiting',
      result: '',
      signalled: false,
      requests: [],
      controller: new AbortController(),
      requestId: undefined,
      cancelled: false,
    }
    this.ops.push(op)
    return op
  }

  private invoke<T>(op: Op, start: () => Promise<T>, summary: (value: T) => string): void {
    const answer = contexts.run({ op: op.name }, start)
    answer.then(
      value => {
        op.result = summary(value)
        if (op.status !== 'sent') op.status = 'answered'
      },
      (error: unknown) => {
        op.status = 'rejected'
        op.result = describeReason(error)
        this.report([operationRejected(op, error)])
      },
    )
  }

  private opNamed(name: string): Op {
    const op = this.ops.find(item => item.name === name)
    if (op === undefined) throw new Nondeterminism(`no operation ${name}`)
    return op
  }

  private discover(): void {
    this.invoke(
      this.newOp('discover'),
      () => this.session.discover(),
      (outcome: Outcome<PeerIdentity, TransportFailure>) =>
        outcomeLabel(outcome, identity => `ok ${identity.protocolVersion}`),
    )
  }

  private list(): void {
    this.invoke(
      this.newOp('list'),
      () => this.session.listActions(),
      (outcome: Outcome<ListingPage, TransportFailure>) => outcomeLabel(outcome, () => 'ok'),
    )
  }

  private update(): void {
    this.invoke(
      this.newOp('update'),
      () => this.session.updateTask(taskId, jsonOf({})),
      (outcome: Outcome<'accepted', TransportFailure>) => outcomeLabel(outcome, value => value),
    )
  }

  private call(): void {
    const op = this.newOp('call')
    this.invoke(
      op,
      () => this.session.call(echo, op.controller.signal),
      (outcome: Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>) => {
        if ('failure' in outcome) return failureLabel(outcome.failure)
        op.status = 'sent'
        op.requestId = outcome.ok.requestId
        outcome.ok.answer.then(
          answer => {
            op.status = 'answered'
            op.result = `sent ${answerLabel(answer)}`
          },
          (error: unknown) => {
            op.status = 'rejected'
            op.result = describeReason(error)
            this.report([operationRejected(op, error)])
          },
        )
        return `sent ${outcome.ok.requestId}`
      },
    )
  }

  /**
   * Whether `discover` read the answer to `initialize`: the authorization it waits on after that
   * is the one of `notifications/initialized`, which is not a request and has no settlement.
   */
  private initialized(op: Op): boolean {
    return (
      op.kind === 'discover' &&
      this.ledger.sent.some(
        sent =>
          sent.method === 'initialize' &&
          sent.id !== undefined &&
          op.requests.includes(sent.id) &&
          this.delivered.has(sent.id),
      )
    )
  }

  /**
   * The phase of the operation's request when a stop comes, for V6; `none` when the request was
   * settled already by a line end (S01–S04: not in flight any more), when what the operation
   * waits on is no request, or when it waits on no port.
   */
  private phaseAtStop(op: Op): Phase {
    if (op.status !== 'waiting' && op.status !== 'sent') return 'none'
    const lineEnded = this.ledger.events.some(event => event === 'ended' || event === 'broken')
    const phase = phaseOf(this.pending, op.name)
    if (lineEnded && phase === 'sent') return 'none'
    return phase === 'authorizing' && this.initialized(op) ? 'none' : phase
  }

  private close(): void {
    this.closeCalled = true
    const phases = new Map<string, Phase>()
    for (const op of this.ops) {
      if (op.kind === 'close' || op.kind === 'cancel') continue
      // A call whose signal fired is settled by the signal, not by close() (T5: first come).
      if (op.signalled) continue
      const phase = this.phaseAtStop(op)
      if (phase !== 'none') phases.set(op.name, phase)
    }
    this.phasesAtClose = phases
    this.invoke(
      this.newOp('close'),
      () => this.session.close(),
      () => {
        this.closeReturned = true
        return 'closed'
      },
    )
  }

  private signal(name: string): void {
    const op = this.opNamed(name)
    if (op.signalled) throw new Nondeterminism(`${name} was signalled already`)
    op.signalled = true
    const phase = this.phaseAtStop(op)
    if (phase !== 'none') this.phasesAtSignal.set(op.name, phase)
    contexts.run({ op: op.name }, () => op.controller.abort())
  }

  private cancel(name: string): void {
    const target = this.opNamed(name)
    const requestId = target.requestId
    if (requestId === undefined) throw new Nondeterminism(`${name} has no request id to cancel`)
    target.cancelled = true
    this.invoke(
      this.newOp('cancel'),
      () => this.session.cancelRequest(requestId),
      () => `cancelled ${requestId}`,
    )
  }

  /**
   * The phase of the operation's request when the shared stream goes away, for V6: `none` when
   * the operation is settled, waits on no request, or still waits on the line's `send` (then the
   * explorer's own settlement of that send decides, see `settleGoneLineIo`); `sent` when the line
   * took its request and the answer is still to come on the shared stream.
   */
  private phaseAtLineEnd(op: Op): Phase {
    if (op.status !== 'waiting' && op.status !== 'sent') return 'none'
    const phase = phaseOf(this.pending, op.name)
    if (phase === 'authorizing') return this.initialized(op) ? 'none' : 'authorizing'
    if (phase !== 'none') return phase === 'sent' ? 'none' : phase
    const last = op.requests.at(-1)
    return last !== undefined && !this.delivered.has(last) ? 'sent' : 'none'
  }

  private event(end: string): void {
    const phases = new Map<string, Phase>()
    for (const op of this.ops) {
      if (op.kind === 'close' || op.kind === 'cancel') continue
      const phase = this.phaseAtLineEnd(op)
      if (phase !== 'none') phases.set(op.name, phase)
    }
    switch (end) {
      case 'ended':
        this.lineEnd = { cause: 'stream-broken', phases }
        this.line.push({ kind: 'ended', stdoutEndedAt: 0 })
        break
      case 'exited':
        this.lineEnd = { cause: 'process-exited', phases }
        this.line.push({ kind: 'ended', stdoutEndedAt: 0, exitedAt: 0 })
        break
      case 'broken':
        this.lineEnd = { cause: 'stream-broken', phases }
        this.line.push({ kind: 'broken' })
        break
      default:
        throw new Nondeterminism(`unknown line end ${end}`)
    }
    // The shared stream is gone: a write to a broken pipe fails, a read of it breaks. The write a
    // caller can no longer reach is carried by the line and aborted on `close()` (SPEC V4); the
    // common case a gone process shows is the pipe breaking, which the explorer takes here.
    this.settleGoneLineIo()
  }

  /** Settles the stdio line's outstanding I/O after the shared stream is gone. */
  private settleGoneLineIo(): void {
    for (const pending of this.calls.slice()) {
      const answer: Answer | undefined =
        pending.call.port === 'line.send'
          ? 'unsent'
          : pending.call.port === 'stream.next'
            ? 'break'
            : undefined
      if (answer === undefined) continue
      this.calls = this.calls.filter(item => item !== pending)
      this.account(pending.call, answer)
      pending.settle(answer)
    }
  }

  private fire(name: string): void {
    const index = this.timerList.findIndex(timer => timer.name === name)
    const timer = this.timerList[index]
    if (timer === undefined) throw new Nondeterminism(`no timer ${name} to fire`)
    this.timerList.splice(index, 1)
    if (timer.context === undefined) timer.fire()
    else contexts.run(timer.context, () => timer.fire())
  }

  private async fireFirst(): Promise<void> {
    const name = this.timerList[0]?.name ?? '?'
    this.log.push(`fire ${name}`)
    this.fire(name)
    await drain()
    this.afterStep()
  }

  private async answer(label: string, answer: string): Promise<void> {
    const pending = this.labelled().get(label)
    const lawful =
      pending === undefined ? undefined : this.answersOf(pending.call).find(item => item === answer)
    if (pending === undefined || lawful === undefined)
      throw new Nondeterminism(`no pending call ${label} to answer ${answer}`)
    await this.settle(pending, lawful)
  }

  private async settle(pending: PendingCall, answer: Answer): Promise<void> {
    this.calls = this.calls.filter(item => item !== pending)
    if (BREACHES.has(answer)) this.left.breaches -= 1
    else if (WIRE_FAULTS.has(answer)) this.left.wireFaults -= 1
    // A hung call never settles: it is kept so the properties still see what it waits for.
    if (answer === HANG) this.hung.push(pending)
    else {
      this.account(pending.call, answer)
      pending.settle(answer)
    }
    await drain()
    this.afterStep()
  }

  /** Settles the line's outstanding I/O as a closed line does: writes abort, streams break. */
  private settleLineCalls(): void {
    for (const pending of this.calls.slice()) {
      const answer: Answer | undefined =
        pending.call.port === 'line.send'
          ? 'aborted'
          : pending.call.port === 'stream.next'
            ? 'break'
            : pending.call.port === 'line.openGet'
              ? 'unavailable'
              : undefined
      if (answer === undefined) continue
      this.calls = this.calls.filter(item => item !== pending)
      this.account(pending.call, answer)
      pending.settle(answer)
    }
  }

  /** What the explorer delivered: refusals the handle may hear of, results, line closes. */
  private account(call: PortCall, answer: Answer): void {
    if (call.port === 'line.send' || call.port === 'line.openGet') {
      if (answer === '401' || answer === '403+scope') {
        const sent = this.ledger.sent.find(item => item.id === call.subject)
        const authorized = call.port === 'line.openGet' ? this.hasHandle : sent?.authorized === true
        if (authorized) this.refusals += 1
      }
      if (answer === 'answer') this.delivered.add(call.subject)
    }
    if (call.port === 'stream.next' && answer === 'result') {
      this.streamsAnswered.add(call.subject)
      this.delivered.add(call.subject)
    }
    if (call.port === 'line.close' && answer === 'ok') this.lineCloseAnswered = true
  }

  /** Answers every pending call lawfully, oldest first, then fires the timers left. */
  private async settleAll(): Promise<void> {
    for (let count = 0; count < REST_STEPS; count += 1) {
      const oldest = this.calls[0]
      if (oldest !== undefined) {
        const answer = this.lawfulAnswerOf(oldest.call)
        this.log.push(`answer ${oldest.call.port}:${oldest.call.subject} ${answer}`)
        await this.settle(oldest, answer)
      } else if (this.timerList[0] !== undefined) await this.fireFirst()
      else return
    }
    this.report([
      {
        property: 'V4',
        signature: 'V4-no-rest',
        detail: `still busy after ${REST_STEPS} lawful steps`,
      },
    ])
  }

  /** The lawful answer of a call at rest: what a well-behaved port and peer do next. */
  private lawfulAnswerOf(call: PortCall): Answer {
    switch (call.port) {
      case 'line.send':
        return call.signal?.aborted === true ? 'aborted' : this.shared ? 'answer' : 'answer'
      case 'stream.next': {
        const stream = this.line.streams.get(call.subject)
        if (stream?.aborted === true) return 'break'
        return this.streamsAnswered.has(call.subject) ? 'end' : 'result'
      }
      case 'line.openGet':
        return 'unavailable'
      case 'fetchMetadata':
        return 'none'
      default:
        return PORT_ANSWERS[call.port][0]
    }
  }

  private afterStep(): void {
    for (const reason of this.unhandled.splice(0)) this.report([unhandledRejection(reason)])
    this.report(credentialAfterClose(this))
    this.report(rejectionsBounded(this, this.refusals, this.hasHandle))
    this.report(unsettledAfterStop(this))
    this.report(closeOrder(this))
    this.report(closeReachesLine(this))
    this.report(resendBounded(this))
    this.report(stopAnswers(this))
  }

  private report(found: readonly Found[]): void {
    for (const item of found) {
      const id = `${item.property}|${item.signature}|${item.detail}`
      if (this.reported.has(id)) continue
      this.reported.add(id)
      this.reports.push({ ...item, step: this.steps, trace: [...this.log] })
    }
  }
}

/** What one replayed schedule found out about the state it ends in. */
type Visit = Readonly<{
  projection: string
  /** False when an earlier schedule reached the same projection. */
  fresh: boolean
  enabled: readonly string[]
}>

type Queued = Readonly<{ path: readonly Step[]; parent: string | undefined }>

let active: Run | undefined

/** Rejections nobody handled while no run was active: a defect of the explorer. */
const stray: unknown[] = []

/**
 * For the duration of `body`, rejections that nobody handled go to the active run instead of the
 * test runner.
 */
async function withHooks<T>(body: () => Promise<T>): Promise<T> {
  const listeners = process.listeners('unhandledRejection')
  const onUnhandled = (reason: unknown) => {
    if (active === undefined) stray.push(reason)
    else active.rejectedUnhandled(reason)
  }
  process.removeAllListeners('unhandledRejection')
  process.on('unhandledRejection', onUnhandled)
  try {
    return await body()
  } finally {
    active = undefined
    process.off('unhandledRejection', onUnhandled)
    for (const listener of listeners) process.on('unhandledRejection', listener)
  }
}

/**
 * Explores every schedule of `scenario` breadth first, so the first schedule that shows a
 * violation is a shortest one. Throws `Nondeterminism` when a replay leaves the recorded path.
 */
export async function explore(
  scenario: Scenario,
  progress: (states: number, runs: number, depth: number) => void = () => undefined,
): Promise<Exploration> {
  const started = performance.now()
  const seen = new Set<string>()
  const found = new Map<string, Violation>()
  const actions = new Set<string>()
  let runs = 0
  let depth = 0
  let states = 0
  let frontier = 0

  async function visit(queued: Queued): Promise<Visit> {
    const run = new Run(scenario)
    active = run
    const { path, parent } = queued
    for (const [index, step] of path.entries()) {
      if (index === path.length - 1 && parent !== undefined && run.projection() !== parent)
        throw new Nondeterminism(
          `replay of ${path.map(item => item.act).join(' / ')} left the recorded state`,
        )
      if (!run.enabled().includes(step.act))
        throw new Nondeterminism(`${step.act} is not enabled on replay at step ${index + 1}`)
      await run.perform(step)
    }
    runs += 1
    const projection = run.projection()
    const fresh = scenario.exhaustivePaths === true || !seen.has(projection)
    const visited: Visit = { projection, fresh, enabled: run.enabled() }
    if (fresh) {
      seen.add(projection)
      states += 1
      depth = Math.max(depth, path.length)
      if (states % 5000 === 0) progress(states, runs, depth)
      if (path.length === scenario.maxDepth) {
        frontier += 1
        await run.rest()
      }
    }
    collect(run.reports, path.length, fresh)
    return visited
  }

  function collect(reports: readonly Report[], length: number, fresh: boolean): void {
    for (const report of reports) {
      // A report made while the prefix replayed was collected when the prefix was new.
      if (report.step < length) continue
      const id = `${report.property}|${report.signature}`
      const known = found.get(id)
      const { step: _step, ...violation } = report
      if (known === undefined) found.set(id, { ...violation, depth: length, seen: 1 })
      else if (fresh) found.set(id, { ...known, seen: known.seen + 1 })
    }
  }

  await withHooks(async () => {
    const queue: Queued[] = [{ path: [], parent: undefined }]
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const result = await visit(next)
      if (!result.fresh || next.path.length === scenario.maxDepth) continue
      for (const act of result.enabled) {
        actions.add(act)
        queue.push({ path: [...next.path, { act }], parent: result.projection })
      }
    }
  })
  if (stray.length > 0)
    throw new Nondeterminism(
      `rejections outside any run: ${stray.splice(0).map(describeReason).join('; ')}`,
    )

  return {
    scenario,
    states,
    runs,
    depth,
    frontier,
    elapsedMs: Math.round(performance.now() - started),
    violations: [...found.values()],
    actions: [...actions].sort(),
  }
}
