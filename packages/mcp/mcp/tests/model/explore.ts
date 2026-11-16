import { AsyncLocalStorage } from 'node:async_hooks'
import { access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  completeListing,
  connectionKeyOf,
  mergeListing,
  type ActionCatalogRecord,
  type CancelAnswer,
  type ConnectionState,
  type InvokeResult,
  type OperationFailure,
  type ReleaseReport,
} from '@omne-harness/mcp-contract'
import {
  createMemoryAdoptionView,
  createMemoryUseEligibility,
} from '@omne-harness/mcp-contract/testing'
import { createCalls } from '../../src/calls.ts'
import { admit } from '../../src/internal/gate.ts'
import { InFlightCalls, type InFlightKey, type Reservation } from '../../src/internal/in-flight.ts'
import { loseOn, type Lost } from '../../src/internal/lost.ts'
import type { BoundKind } from '../../src/internal/port.ts'
import { prepareSettings } from '../../src/internal/settings.ts'
import {
  createConnectionTable,
  type ClosedEndpoint,
  type ConnectionTable,
  type Ensured,
  type EnsureFailure,
} from '../../src/internal/table.ts'
import { TaskTable } from '../../src/internal/task-table.ts'
import { catalogKeyTextOf, tenantTextOf } from '../../src/internal/text.ts'
import { createTasks } from '../../src/tasks.ts'
import { CONFIG, VALUE, settingsOf } from '../doubles/world.ts'
import {
  actionNameOf,
  correlationKeyOf,
  credentialBindingOf,
  generationOf,
  jsonOf,
  millisOf,
  endpointRefOf,
  peerIdentityOf,
  requestStateOf,
  taskIdOf,
} from '@omne-harness/mcp-contract/testing'
import { home, principalKey, tenantOf, type Principal } from '../doubles/identities.ts'
import {
  CALL_OPS,
  answeredOtherwiseAfterShutdown,
  answeredWithReservation,
  askedByIsolated,
  cancelledOtherwise,
  closeWaitsUnbounded,
  connectedAfterShutdown,
  connectsAfterShutdown,
  crossesKeys,
  describeReason,
  failureEnding,
  foreignTransport,
  internalError,
  lateChanged,
  lostOnUsableFailure,
  sendsAfterShutdown,
  sendsOnRefusing,
  closeNotAtOnce,
  sentAfterShutdown,
  sentMismatch,
  staleLoseChanged,
  stateViolations,
  stoppedForeignCall,
  taskAnsweredForeign,
  unhandledRejection,
  unstoppedAtShutdown,
  type Found,
  type KeyObservation,
  type OpKind,
  type OpView,
  type ReservationView,
  type RunView,
} from './properties.ts'
import {
  BOUNDED_PORTS,
  PORT_ANSWERS,
  PortFault,
  TASK_ID,
  TASK_METHODS,
  TASK_PORTS,
  USABLE_FAILURE,
  emptyLedger,
  scriptedPorts,
  type Answer,
  type CallDesk,
  type CallRequest,
  type Context,
  type Deviation,
  type Ledger,
  type ModelKey,
  type PeerReply,
  type ScriptedPortCall,
  type TaskMethod,
} from './ports.ts'

export type KeyName = 'A' | 'B' | 'C' | 'D' | 'E'

export type CallBudget = Readonly<{
  invokes?: number
  continues?: number
  cancels?: number
  tasks?: number
}>

export type Scenario = Readonly<{
  name: string
  keys: readonly KeyName[]
  ensures: number
  ensurers?: readonly KeyName[]
  prelude?: readonly string[]
  releases: number
  closeAll: boolean
  loses: number
  deviations: readonly Deviation[]
  budget: number
  maxDepth?: number
  exhaustivePaths?: boolean
  anyBound?: boolean
  ops?: Partial<Record<KeyName, CallBudget>>
  aborts?: number
  drops?: number
  taskMethods?: readonly TaskMethod[]
  peer?: PeerReply
}>

export type Step = Readonly<{ act: string; throws: readonly number[] }>

export type Violation = Found & Readonly<{ trace: readonly string[]; depth: number; seen: number }>

export type Exploration = Readonly<{
  scenario: Scenario
  states: number
  runs: number
  depth: number
  frontier: number
  elapsedMs: number
  violations: readonly Violation[]
  closeWaits: readonly string[] | undefined
  failureEndings: readonly string[]
}>

export class Nondeterminism extends Error {
  override readonly name = 'Nondeterminism'
}

const contexts = new AsyncLocalStorage<Context>()

const BOUND = millisOf(1000)

const REST_STEPS = 200

const ACTION = actionNameOf('read')
const CORRELATION = correlationKeyOf('c')
const REQUEST_STATE = requestStateOf('s')

const STREAM_BROKEN: Lost = { reason: 'stream-broken', mark: 'connection-unavailable' }

const DEFAULT_TASK_METHODS: readonly TaskMethod[] = ['get']

const KEY_OWNERS = {
  A: { principal: { id: 'alice' }, tenant: home, credential: 'main' },
  B: { principal: { id: 'mallory' }, tenant: tenantOf('t'), credential: 'main' },
  C: { principal: { id: 'bob' }, tenant: home, credential: 'other' },
  D: { principal: { id: 'alice' }, tenant: tenantOf('t'), credential: 'main' },
  E: { principal: { id: 'alice' }, tenant: home, credential: 'other' },
} as const

function catalogRecord(): ActionCatalogRecord {
  const listing = completeListing({
    basedOn: 'absent',
    pages: [{ ok: { tools: [jsonOf({ name: 'read', inputSchema: { type: 'object' } })] } }],
    basis: {
      generation: generationOf(1),
      protocolVersion: peerIdentityOf().protocolVersion,
      capabilities: jsonOf({ tools: {} }),
    },
    acquiredAt: '2026-11-05T00:00:00Z',
    limits: { maxPages: 1, maxActions: 1 },
  })
  if ('failure' in listing) throw new TypeError(listing.failure)
  const merged = mergeListing({ kind: 'not-acquired' }, listing.ok)
  if ('failure' in merged) throw new TypeError(merged.failure)
  return merged.ok
}

export async function modelKeys(
  names: readonly KeyName[],
): Promise<Readonly<{ keys: readonly ModelKey[]; catalog: ActionCatalogRecord }>> {
  const eligibility = createMemoryUseEligibility<Principal>({ principalKey })
  const endpoint = endpointRefOf('files')
  const catalog = catalogRecord()
  const digest = catalog.actions[0]?.definitionDigest
  if (digest === undefined) throw new TypeError('the catalog has no action')
  const keys: ModelKey[] = []
  for (const name of names) {
    const owner = KEY_OWNERS[name]
    const asking = access<Principal>(owner.principal, owner.tenant)
    const adoption = createMemoryAdoptionView<Principal, string>({ scopeKey: scope => scope })
    const adopted = adoption.adopt({
      tenant: owner.tenant,
      scope: 'ws',
      ref: endpoint,
      body: jsonOf({
        name: endpoint.name,
        transport: 'stdio',
        auth: 'static',
        launch: {
          command: 'mcp-files',
          env: [{ name: 'TOKEN', source: 'credential' }],
          facilities: [],
        },
      }),
      settings: settingsOf({
        credential: VALUE(credentialBindingOf(owner.credential)),
        connectTimeout: VALUE(BOUND),
      }),
    })
    eligibility.grant(asking, endpoint)
    const decision = await admit({ adoption, eligibility }, asking, endpoint)
    if (decision.kind !== 'admitted') throw new TypeError(`key ${name} is not admitted`)
    const prepared = prepareSettings(decision.endpoint, undefined)
    if ('failure' in prepared) throw new TypeError(`key ${name} has a setting defect`)
    const { account } = prepared.ok
    keys.push({
      name,
      access: asking,
      holding: endpoint.holding,
      adopted,
      admitted: decision.endpoint,
      connectionKey: connectionKeyOf(owner.tenant, decision.endpoint, account),
      catalogKeyText: catalogKeyTextOf(catalogKeyOf(owner.tenant, decision.endpoint, account)),
      digest,
    })
  }
  return { keys, catalog }
}

function drain(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

const SOURCE_FRAME =
  /at (?:async )?(?:(\S+) \()?(?:file:\/\/)?\S*\/packages\/mcp\/mcp\/src\/(?:internal\/)?([\w.-]+\.ts):\d+:\d+\)?$/

const SITE_FRAMES = 12

function plainStack(error: Error, frames: readonly NodeJS.CallSite[]): string {
  return [String(error), ...frames.map(frame => `    at ${String(frame)}`)].join('\n')
}

function siteOf(): string {
  const { prepareStackTrace, stackTraceLimit } = Error
  Error.stackTraceLimit = SITE_FRAMES
  Error.prepareStackTrace = plainStack
  let stack: string
  try {
    stack = new Error('site').stack ?? ''
  } finally {
    Error.prepareStackTrace = prepareStackTrace
    Error.stackTraceLimit = stackTraceLimit
  }
  const frames: string[] = []
  for (const line of stack.split('\n')) {
    const match = SOURCE_FRAME.exec(line.trim())
    if (match !== null) frames.push(`${match[1] ?? '<anonymous>'}@${match[2] ?? '?'}`)
  }
  return frames.join(' < ')
}

const REFUSING = 'refusing'

const UNNAMED = 'unnamed'

function wiredName(ledger: Readonly<{ names: WeakMap<object, string> }>, ensured: Ensured): string {
  const wire = ensured.wire()
  return 'ok' in wire ? (ledger.names.get(wire.ok) ?? UNNAMED) : REFUSING
}

function generationText(key: string, generation: number): string {
  return `${key}@${generation}`
}

function coreOf(state: ConnectionState): string {
  if (state.kind === 'lost' && state.reason === 'close-unconfirmed') return '{"kind":"none"}'
  return JSON.stringify(state, (name, value: unknown) => (name === 'residual' ? undefined : value))
}

function summarizeInvoke(result: InvokeResult): string {
  if (result.kind === 'not-sent') return `not-sent ${result.reason.kind}`
  const { outcome } = result
  return outcome.kind === 'unknown' ? `sent unknown ${outcome.cause}` : `sent ${outcome.kind}`
}

function summarizeTask(result: Outcome<unknown, OperationFailure>): string {
  if ('failure' in result)
    return result.failure.kind === 'effect-unknown'
      ? `fail effect-unknown ${result.failure.cause}`
      : `fail ${result.failure.kind}`
  return `ok ${JSON.stringify(result.ok)}`
}

type Timer = Readonly<{ name: string; controller: AbortController; op: string | undefined }>

type PendingCall = {
  readonly call: ScriptedPortCall
  bound: string | undefined
  readonly lateBorn: boolean
  readonly settle: (answer: Answer) => void
}

type Op = {
  readonly name: string
  readonly kind: OpKind
  readonly key: string | undefined
  status: OpView['status']
  result: string
  ensured: Ensured | undefined
  readonly controller: AbortController | undefined
  aborted: boolean
  stopped: boolean
  stoppedBeforeSend: boolean
  readonly afterShut: boolean
  sends: number
  sentOk: number
  cancelRequests: number
  taskRequests: number
  taskUnsent: number
}

type ReservationRecord = {
  readonly text: string
  readonly key: string
  readonly op: string
  phase: ReservationView['phase']
  endings: number
}

type Budget = {
  ensures: Map<string, number>
  releases: Map<string, number>
  invokes: Map<string, number>
  continues: Map<string, number>
  cancels: Map<string, number>
  tasks: Map<string, number>
  closeAll: number
  loses: number
  aborts: number
  drops: number
  deviations: number
}

type Report = Found & Readonly<{ step: number; trace: readonly string[] }>

const OP_LETTER: Readonly<Record<OpKind, string>> = {
  ensure: 'e',
  release: 'r',
  closeAll: 'c',
  lose: 'l',
  invoke: 'i',
  continue: 'n',
  cancel: 'x',
  task: 't',
}

function reservationTextOf(key: InFlightKey): string {
  return `${tenantTextOf(key.tenant)}|${key.principalKey}|${key.correlationKey}`
}

interface ReservationDesk {
  reserved(key: InFlightKey, answer: 'reserved' | 'in-use'): void
  marked(key: InFlightKey): void
  concluded(key: InFlightKey): void
}

class CountedInFlight extends InFlightCalls {
  readonly #desk: ReservationDesk

  constructor(desk: ReservationDesk) {
    super()
    this.#desk = desk
  }

  override reserve(key: InFlightKey, signal: AbortSignal): Reservation | 'in-use' {
    const place = super.reserve(key, signal)
    this.#desk.reserved(key, place === 'in-use' ? 'in-use' : 'reserved')
    if (place === 'in-use') return place
    return {
      stop: place.stop,
      recordSent: (connection, generation) => {
        place.recordSent(connection, generation)
        this.#desk.marked(key)
      },
      conclude: () => {
        place.conclude()
        this.#desk.concluded(key)
      },
    }
  }
}

class Run implements RunView, CallDesk, ReservationDesk {
  readonly ledger: Ledger = emptyLedger()
  readonly ops: Op[] = []
  readonly log: string[] = []
  readonly reports: Report[] = []
  readonly tasksOf = new Set<string>()
  readonly failureEndings = new Set<string>()
  shutAsked = false
  private readonly closedSince = new Map<string, number>()
  private readonly lostGenerations = new Set<string>()
  offered: number[] = []
  private resting = false
  private readonly keys: readonly ModelKey[]
  private readonly scenario: Scenario
  private readonly table: ConnectionTable<Principal>
  private readonly calls_: ReturnType<typeof createCalls<Principal, string>>
  private readonly tasks_: ReturnType<typeof createTasks<Principal, string>>
  private readonly records: ReservationRecord[] = []
  private readonly open_ = new Map<string, ReservationRecord>()
  private calls: PendingCall[] = []
  private handlingLate = false
  private timers: Timer[] = []
  private readonly fired = new Set<string>()
  private readonly opBounds = new Map<string, { started: number; fired: number }>()
  private readonly builds = new Map<string, number>()
  private readonly reported = new Set<string>()
  private readonly unhandled: unknown[] = []
  private readonly left: Budget
  private seq = 0
  private steps = 0
  private stepThrows: ReadonlySet<number> = new Set()
  private stepCalls = 0
  private closeWaitsSeen = false

  constructor(scenario: Scenario, keys: readonly ModelKey[], catalog: ActionCatalogRecord) {
    this.scenario = scenario
    this.keys = keys
    const budgets = new Map<string, CallBudget | undefined>(Object.entries(scenario.ops ?? {}))
    const budgetOf = (pick: (budget: CallBudget) => number | undefined) =>
      new Map(keys.map(key => [key.name, pick(budgets.get(key.name) ?? {}) ?? 0]))
    this.left = {
      ensures: new Map(
        keys.map(key => [
          key.name,
          scenario.ensurers === undefined || scenario.ensurers.some(name => name === key.name)
            ? scenario.ensures
            : 0,
        ]),
      ),
      releases: new Map(keys.map(key => [key.name, scenario.releases])),
      invokes: budgetOf(budget => budget.invokes),
      continues: budgetOf(budget => budget.continues),
      cancels: budgetOf(budget => budget.cancels),
      tasks: budgetOf(budget => budget.tasks),
      closeAll: scenario.closeAll ? 1 : 0,
      loses: scenario.loses,
      aborts: scenario.aborts ?? 0,
      drops: scenario.drops ?? 0,
      deviations: scenario.budget,
    }
    const ports = scriptedPorts(this, keys, this.ledger, {
      ...(scenario.ops === undefined ? {} : { catalog }),
      ...(scenario.peer === undefined ? {} : { peer: scenario.peer }),
    })
    this.table = createConnectionTable(ports, CONFIG, {
      startBound: (_milliseconds, kind) => this.startBound(kind),
      afterExit: error => this.rejectedUnhandled(error),
    })
    const deps = {
      ports,
      config: CONFIG,
      table: this.table,
      inFlight: new CountedInFlight(this),
      tasks: new TaskTable(),
    }
    this.calls_ = createCalls(deps)
    this.tasks_ = createTasks(deps)
  }

  boundsOf(op: string): Readonly<{ started: number; fired: number }> {
    return this.opBounds.get(op) ?? { started: 0, fired: 0 }
  }

  get pending(): readonly ScriptedPortCall[] {
    return this.calls.map(item => item.call)
  }

  get bounds(): number {
    return this.timers.length
  }

  get reservations(): readonly ReservationView[] {
    return this.records
  }

  get closeWaits(): boolean {
    return this.closeWaitsSeen
  }

  observe(): readonly KeyObservation[] {
    return this.keys.map(key => {
      const state = this.table.stateOf(key.access.tenant, key.holding)
      const current = this.table.current(key.connectionKey)
      return {
        key: key.name,
        state: JSON.stringify(state),
        core: coreOf(state),
        current:
          current === undefined ? '-' : `${wiredName(this.ledger, current)}@g${current.generation}`,
      }
    })
  }

  projection(): string {
    const { handles, processes, transports, requests } = this.ledger
    return JSON.stringify({
      ops: this.ops.map(op =>
        [
          op.name,
          op.status,
          op.ensured === undefined ? '' : op.result,
          op.stopped ? 's' : '',
          op.aborted ? 'a' : '',
          op.stoppedBeforeSend ? 'b' : '',
          op.afterShut ? 'h' : '',
          Math.min(op.sends, 2),
          op.sentOk,
          Math.min(op.cancelRequests, 2),
          Math.min(op.taskRequests, 2),
          Math.min(op.taskUnsent, 2),
        ].join(' '),
      ),
      calls: this.calls
        .map(pending =>
          [
            pending.call.port,
            pending.call.subject,
            pending.call.context?.op,
            pending.bound,
            pending.call.site,
            this.isLate(pending) ? 'late' : '',
            this.closedOver(pending.call) ? 'closed' : '',
          ].join('|'),
        )
        .sort(),
      timers: this.timers.map(timer => timer.name),
      handles: handles.map(item => `${item.name}:${Math.min(item.releases, 2)}`),
      processes: processes.map(item => `${item.name}:${Math.min(item.stops, 1)}:${item.lastStop}`),
      transports: transports.map(
        item => `${item.name}:${Math.min(item.closes, 1)}:${this.refuses(item.name) ? 'r' : ''}`,
      ),
      requests: requests.map(item => `${item.id}:${Math.min(item.cancels, 2)}`),
      reservations: this.records.map(
        item => `${item.op}:${item.phase}:${Math.min(item.endings, 2)}`,
      ),
      tasksOf: [...this.tasksOf].sort(),
      keys: this.observe(),
      left: [
        [...this.left.ensures],
        [...this.left.releases],
        [...this.left.invokes],
        [...this.left.continues],
        [...this.left.cancels],
        [...this.left.tasks],
        this.left.closeAll,
        this.left.loses,
        this.left.aborts,
        this.left.drops,
        this.left.deviations,
      ],
      shut: this.shutAsked,
    })
  }

  enabled(): string[] {
    const acts: string[] = []
    const withBudget = (budget: Map<string, number>, verb: string) => {
      for (const key of this.keys)
        if ((budget.get(key.name) ?? 0) > 0) acts.push(`${verb} ${key.name}`)
    }
    withBudget(this.left.ensures, 'ensure')
    withBudget(this.left.releases, 'release')
    if (this.left.closeAll > 0) acts.push('closeAll')
    if (this.left.loses > 0)
      for (const op of this.ops) if (op.ensured !== undefined) acts.push(`lose ${op.name}`)
    withBudget(this.left.invokes, 'invoke')
    withBudget(this.left.continues, 'continue')
    withBudget(this.left.cancels, 'cancel')
    if (this.left.aborts > 0)
      for (const op of this.ops)
        if (CALL_OPS.has(op.kind) && op.status === 'waiting' && !op.aborted)
          acts.push(`abort ${op.name}`)
    for (const key of this.keys)
      if ((this.left.tasks.get(key.name) ?? 0) > 0)
        for (const method of this.scenario.taskMethods ?? DEFAULT_TASK_METHODS)
          acts.push(`task ${key.name} ${method}`)
    if (this.left.drops > 0)
      for (const key of this.keys)
        if (this.table.current(key.connectionKey) !== undefined) acts.push(`drop ${key.name}`)
    const fireable = this.scenario.anyBound === true ? this.timers : this.timers.slice(0, 1)
    for (const timer of fireable) acts.push(`fire ${timer.name}`)
    for (const [label, { call }] of this.labelled())
      for (const answer of PORT_ANSWERS[call.port])
        if (answer === 'ok' || this.mayDeviate(answer)) acts.push(`answer ${label} ${answer}`)
    return acts
  }

  async perform(step: Step): Promise<void> {
    this.stepThrows = new Set(step.throws)
    this.stepCalls = 0
    this.offered = []
    this.steps += 1
    this.log.push(step.act)
    const [verb = '', first = '', second = ''] = step.act.split(' ')
    switch (verb) {
      case 'ensure':
        this.ensure(first)
        break
      case 'release':
        this.release(first)
        break
      case 'closeAll':
        this.left.closeAll -= 1
        this.closeAll()
        break
      case 'lose':
        await this.lose(first)
        return
      case 'invoke':
        this.invokeCall(first)
        break
      case 'continue':
        this.continueCall(first)
        break
      case 'cancel':
        this.cancel(first)
        break
      case 'abort':
        this.abort(first)
        break
      case 'task':
        this.task(first, second)
        break
      case 'drop':
        this.drop(first)
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

  async rest(): Promise<void> {
    this.resting = true
    this.log.push('-- driven to rest: every bound fires, no port answers')
    while (this.timers[0] !== undefined) await this.fireOldest()
    this.log.push('-- every port answers lawfully')
    await this.settleAll()
    if (!this.ops.some(op => op.kind === 'closeAll')) {
      this.log.push('-- closeAll')
      this.closeAll()
      await drain()
      this.afterStep()
      await this.settleAll()
    }
  }

  private startBound(kind: BoundKind): AbortSignal {
    const store = contexts.getStore()
    const op = store?.op
    const name = this.boundName(kind, op)
    const controller = new AbortController()
    this.timers.push({ name, controller, op })
    if (op !== undefined) {
      const counts = this.boundsOf(op)
      this.opBounds.set(op, { started: counts.started + 1, fired: counts.fired })
    }
    if (kind === 'task')
      for (const pending of this.calls)
        if (
          pending.bound === undefined &&
          pending.call.context?.op === op &&
          TASK_PORTS.has(pending.call.port)
        )
          pending.bound = name
    if (store !== undefined) contexts.enterWith({ ...store, timer: name })
    return controller.signal
  }

  private boundName(kind: BoundKind, op: string | undefined): string {
    switch (kind) {
      case 'build': {
        const key = this.ops.find(item => item.name === op)?.key ?? '?'
        const count = (this.builds.get(key) ?? 0) + 1
        this.builds.set(key, count)
        return `T(b${key}${count})`
      }
      case 'join':
        return `T(j${op ?? '?'})`
      case 'task':
        return `T(k${op ?? '?'})`
      case 'section':
      case 'listing':
        return `T(${op ?? '?'})`
      default: {
        const exhaustive: never = kind
        return exhaustive
      }
    }
  }

  rejectedUnhandled(reason: unknown): void {
    this.unhandled.push(reason)
  }

  open<T>(request: CallRequest<T>): Promise<T> {
    const call: ScriptedPortCall = {
      seq: this.seq,
      port: request.port,
      key: request.key,
      subject: request.subject,
      context: request.context ?? contexts.getStore(),
      site: siteOf(),
      transport: request.transport,
    }
    this.seq += 1
    this.report(connectsAfterShutdown(this, call))
    this.report(sendsAfterShutdown(this, call))
    this.report(sendsOnRefusing(this, call))
    const op = this.ops.find(item => item.name === call.context?.op)
    this.report(crossesKeys(this, call, op?.key))
    if (op !== undefined) {
      this.report(askedByIsolated(this, call, op))
      if (call.port === 'transport.call') op.sends += 1
      if (call.port === 'transport.cancelRequest') op.cancelRequests += 1
      if (TASK_PORTS.has(call.port)) op.taskRequests += 1
    }
    const index = this.stepCalls
    this.stepCalls += 1
    if (this.mayDeviate('throw') && call.port !== 'transport.answer') this.offered.push(index)
    if (this.stepThrows.has(index)) {
      this.left.deviations -= 1
      this.log.push(`  ${call.port} ${call.subject} throws when called (at ${call.site})`)
      request.ended?.('throw')
      throw new PortFault(call, 'threw')
    }
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    this.calls.push({
      call,
      bound: BOUNDED_PORTS.has(call.port) ? call.context?.timer : undefined,
      lateBorn: this.handlingLate,
      settle: answer => {
        request.ended?.(answer)
        if (answer === 'reject') reject(new PortFault(call, 'rejected'))
        else {
          if (call.port === 'transport.call' && answer === 'ok' && op !== undefined) op.sentOk += 1
          if (
            TASK_PORTS.has(call.port) &&
            (answer === 'fail' || answer === USABLE_FAILURE) &&
            op !== undefined
          )
            op.taskUnsent += 1
          resolve(request.value(answer, call))
        }
      },
    })
    return promise
  }

  reserved(key: InFlightKey, answer: 'reserved' | 'in-use'): void {
    const text = reservationTextOf(key)
    const op = this.currentOp()
    const holder = this.open_.get(text)
    if (answer === 'reserved') {
      if (holder !== undefined)
        this.report([
          {
            property: 'P11',
            signature: 'P11-double-reservation',
            detail: `${op?.name ?? '?'} reserved the place ${holder.op} holds`,
          },
        ])
      const record: ReservationRecord = {
        text,
        key: op?.key ?? '?',
        op: op?.name ?? '?',
        phase: 'reserved',
        endings: 0,
      }
      this.records.push(record)
      this.open_.set(text, record)
      return
    }
    if (holder !== undefined) return
    const foreign = [...this.open_.values()].find(item => item.key !== op?.key)
    this.report([
      foreign === undefined
        ? {
            property: 'P11',
            signature: 'P11-in-use-without-holder',
            detail: `${op?.name ?? '?'} answered in-use while nobody holds its place`,
          }
        : {
            property: 'P12',
            signature: 'P12-in-use-foreign',
            detail: `${op?.name ?? '?'} answered in-use because ${foreign.op} of key ${foreign.key} holds a place`,
          },
    ])
  }

  marked(key: InFlightKey): void {
    const record = this.open_.get(reservationTextOf(key))
    if (record === undefined) return
    this.report(this.foreignReservation(record, 'marked sent'))
    record.phase = 'sent'
  }

  concluded(key: InFlightKey): void {
    const text = reservationTextOf(key)
    const open = this.open_.get(text)
    if (open !== undefined) {
      this.report(this.foreignReservation(open, 'concluded'))
      this.closeReservation(open)
      return
    }
    this.report([
      {
        property: 'P11',
        signature: 'P11-concluded-nothing',
        detail: `${this.currentOp()?.name ?? '?'} concluded a place nobody holds`,
      },
    ])
  }

  private foreignReservation(record: ReservationRecord, how: string): Found[] {
    const op = this.currentOp()
    if (op === undefined || op.name === record.op) return []
    return [
      {
        property: 'P11',
        signature: 'P11-foreign-reservation',
        detail: `${op.name} ${how} the place ${record.op} holds`,
      },
    ]
  }

  private closeReservation(record: ReservationRecord): void {
    record.phase = 'closed'
    record.endings += 1
    this.open_.delete(record.text)
  }

  private currentOp(): Op | undefined {
    const name = contexts.getStore()?.op
    return this.ops.find(item => item.name === name)
  }

  private mayDeviate(deviation: Deviation): boolean {
    return !this.resting && this.left.deviations > 0 && this.scenario.deviations.includes(deviation)
  }

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

  private newOp(kind: OpKind, key: string | undefined, controller?: AbortController): Op {
    const count = this.ops.filter(op => op.kind === kind && op.key === key).length + 1
    const op: Op = {
      name: `${OP_LETTER[kind]}${key ?? ''}${count}`,
      kind,
      key,
      status: 'waiting',
      result: '',
      ensured: undefined,
      controller,
      aborted: false,
      stopped: false,
      stoppedBeforeSend: false,
      afterShut: this.shutAsked,
      sends: 0,
      sentOk: 0,
      cancelRequests: 0,
      taskRequests: 0,
      taskUnsent: 0,
    }
    this.ops.push(op)
    return op
  }

  private invoke<T>(op: Op, start: () => Promise<T>, summary: (value: T) => string): void {
    const answer = contexts.run({ op: op.name }, start)
    answer.then(
      value => {
        op.status = 'answered'
        op.result = summary(value)
        this.report(unstoppedAtShutdown(this, op))
      },
      (error: unknown) => {
        op.status = 'rejected'
        op.result = describeReason(error)
        this.report(internalError(op, error))
      },
    )
  }

  private keyNamed(name: string): ModelKey {
    const key = this.keys.find(item => item.name === name)
    if (key === undefined) throw new Nondeterminism(`no key ${name}`)
    return key
  }

  private spend(budget: Map<string, number>, name: string): void {
    budget.set(name, (budget.get(name) ?? 0) - 1)
  }

  private ensure(name: string): void {
    const key = this.keyNamed(name)
    this.spend(this.left.ensures, name)
    const op = this.newOp('ensure', name)
    this.invoke(
      op,
      () => this.table.ensure(key.admitted, key.access),
      (outcome: Outcome<Ensured, EnsureFailure>) => {
        if ('failure' in outcome) {
          const failure = outcome.failure
          return failure.stage === 'settings'
            ? `fail settings ${failure.reason.kind}`
            : `fail connect ${failure.reason.kind} ${failure.catalog}`
        }
        op.ensured = outcome.ok
        const transport = wiredName(this.ledger, outcome.ok)
        const record = this.ledger.transports.find(item => item.name === transport)
        if (transport !== REFUSING) this.report(foreignTransport(op, record?.key ?? UNNAMED))
        this.report(connectedAfterShutdown(this, op))
        return `ok ${transport}@g${outcome.ok.generation}`
      },
    )
  }

  refuses(transport: string): boolean {
    const record = this.ledger.transports.find(item => item.name === transport)
    if (record === undefined) return false
    const since = this.closedSince.get(record.key)
    return (
      (since !== undefined && record.opened < since) ||
      this.lostGenerations.has(generationText(record.key, record.generation))
    )
  }

  private closedOver(call: ScriptedPortCall): boolean {
    const since = this.closedSince.get(call.key)
    return call.port === 'transports.open' && since !== undefined && call.seq < since
  }

  private close<T>(
    op: Op,
    keys: readonly ModelKey[],
    start: () => Promise<T>,
    summary: (value: T) => string,
  ): void {
    for (const key of keys) this.closedSince.set(key.name, this.seq)
    this.invoke(op, start, summary)
    this.report(closeNotAtOnce(op, this.observe(), new Set(keys.map(key => key.name))))
  }

  private release(name: string): void {
    const key = this.keyNamed(name)
    this.spend(this.left.releases, name)
    this.close(
      this.newOp('release', name),
      this.keys.filter(
        other => other.access.tenant === key.access.tenant && other.holding === key.holding,
      ),
      () => this.table.close(key.access.tenant, key.holding),
      (report: ReleaseReport) => JSON.stringify(report),
    )
  }

  private closeAll(): void {
    this.shutAsked = true
    this.close(
      this.newOp('closeAll', undefined),
      this.keys,
      () => this.table.closeAll(),
      (closed: readonly ClosedEndpoint[]) => JSON.stringify(closed.map(item => item.process)),
    )
  }

  private async lose(target: string): Promise<void> {
    const answered = this.ops.find(op => op.name === target)
    const ensured = answered?.ensured
    if (ensured === undefined) throw new Nondeterminism(`no answer of ${target} to lose`)
    this.left.loses -= 1
    const stale = !ensured.connection.isCurrent(ensured.generation)
    const before = this.observe()
    const op = this.newOp('lose', answered?.key)
    if (!stale && answered?.key !== undefined)
      this.lostGenerations.add(generationText(answered.key, ensured.generation))
    this.invoke(op, () => loseOn(this.table, ensured, STREAM_BROKEN), String)
    await drain()
    if (stale) this.report(staleLoseChanged(op, before, this.observe()))
    this.afterStep()
  }

  private drop(name: string): void {
    const key = this.keyNamed(name)
    const current = this.table.current(key.connectionKey)
    if (current === undefined) throw new Nondeterminism(`no current connection of ${name} to drop`)
    this.left.drops -= 1
    this.lostGenerations.add(generationText(name, current.generation))
    this.invoke(this.newOp('lose', name), () => loseOn(this.table, current, STREAM_BROKEN), String)
  }

  private callAnswered(op: Op, key: ModelKey, result: InvokeResult): string {
    const summary = summarizeInvoke(result)
    op.result = summary
    if (result.kind === 'sent' && result.outcome.kind === 'task') this.tasksOf.add(key.name)
    this.report([
      ...sentMismatch(op),
      ...cancelledOtherwise(op),
      ...answeredWithReservation(this, op),
      ...sentAfterShutdown(op),
      ...answeredOtherwiseAfterShutdown(this, op),
    ])
    return summary
  }

  private invokeCall(name: string): void {
    const key = this.keyNamed(name)
    this.spend(this.left.invokes, name)
    const controller = new AbortController()
    const op = this.newOp('invoke', name, controller)
    this.invoke(
      op,
      () =>
        this.calls_.invoke(key.access, {
          ref: key.adopted.ref,
          action: ACTION,
          args: jsonOf({}),
          expectedDefinition: key.digest,
          correlationKey: CORRELATION,
          signal: controller.signal,
        }),
      result => this.callAnswered(op, key, result),
    )
  }

  private continueCall(name: string): void {
    const key = this.keyNamed(name)
    this.spend(this.left.continues, name)
    const controller = new AbortController()
    const op = this.newOp('continue', name, controller)
    const issuedAt = this.table.current(key.connectionKey)?.generation ?? generationOf(1)
    this.invoke(
      op,
      () =>
        this.calls_.continueWithInput(key.access, {
          ref: key.adopted.ref,
          action: ACTION,
          args: jsonOf({}),
          requestState: REQUEST_STATE,
          issuedAt,
          correlationKey: CORRELATION,
          signal: controller.signal,
        }),
      result => this.callAnswered(op, key, result),
    )
  }

  private cancel(name: string): void {
    const key = this.keyNamed(name)
    this.spend(this.left.cancels, name)
    const op = this.newOp('cancel', name)
    // The call the cancel may stop, read before the cancel: the reactions to the stop signal run
    // before the cancel's own answer is read, and may end the place by then.
    const target = this.ops.find(
      item =>
        CALL_OPS.has(item.kind) &&
        item.key === name &&
        item.status === 'waiting' &&
        this.records.some(record => record.op === item.name && record.phase !== 'closed'),
    )
    const sendsBefore = target?.sends ?? 0
    this.invoke(
      op,
      () => this.calls_.cancel(key.access, CORRELATION),
      (answer: CancelAnswer) => {
        op.result = answer
        if (answer === 'signalled' && target !== undefined) this.stop(target, sendsBefore)
        this.report(stoppedForeignCall(op, target))
        return answer
      },
    )
  }

  private stop(op: Op, sendsBefore: number): void {
    op.stopped = true
    if (sendsBefore === 0) op.stoppedBeforeSend = true
  }

  private abort(target: string): void {
    const op = this.ops.find(item => item.name === target)
    if (op?.controller === undefined || op.aborted)
      throw new Nondeterminism(`no waiting call ${target} to abort`)
    this.left.aborts -= 1
    op.aborted = true
    this.stop(op, op.sends)
    op.controller.abort()
  }

  private task(name: string, method: string): void {
    const key = this.keyNamed(name)
    if (!Object.hasOwn(TASK_METHODS, method))
      throw new Nondeterminism(`unknown task method ${method}`)
    this.spend(this.left.tasks, name)
    const op = this.newOp('task', name)
    const task = { ref: key.adopted.ref, taskId: taskIdOf(TASK_ID), issuedAt: generationOf(1) }
    const operation = (): Promise<Outcome<unknown, OperationFailure>> => {
      switch (method) {
        case 'get':
          return this.tasks_.queryTask(key.access, task)
        case 'result':
          return this.tasks_.taskResult(key.access, task)
        case 'input':
          return this.tasks_.provideTaskInput(key.access, task, jsonOf({}))
        default:
          return this.tasks_.cancelTask(key.access, task)
      }
    }
    this.invoke(op, operation, result => {
      op.result = summarizeTask(result)
      this.report([...taskAnsweredForeign(this, op), ...answeredOtherwiseAfterShutdown(this, op)])
      return op.result
    })
  }

  private fire(name?: string): void {
    const index = name === undefined ? 0 : this.timers.findIndex(timer => timer.name === name)
    const timer = this.timers[index]
    if (timer === undefined) throw new Nondeterminism(`no bound ${name ?? ''} to fire`)
    this.timers.splice(index, 1)
    this.fired.add(timer.name)
    if (timer.op !== undefined) {
      const counts = this.boundsOf(timer.op)
      this.opBounds.set(timer.op, { started: counts.started, fired: counts.fired + 1 })
    }
    timer.controller.abort()
  }

  private async fireOldest(): Promise<void> {
    this.log.push(`fire ${this.timers[0]?.name ?? '?'}`)
    this.fire()
    await drain()
    this.afterStep()
  }

  private async answer(label: string, answer: string): Promise<void> {
    const pending = this.labelled().get(label)
    const lawful = PORT_ANSWERS[pending?.call.port ?? 'store.read'].find(item => item === answer)
    if (pending === undefined || lawful === undefined)
      throw new Nondeterminism(`no pending call ${label} to answer ${answer}`)
    await this.settle(pending, lawful)
  }

  private async settle(pending: PendingCall, answer: Answer): Promise<void> {
    this.calls = this.calls.filter(item => item !== pending)
    if (answer !== 'ok') this.left.deviations -= 1
    const late = this.isLate(pending)
    const before = this.observe()
    const firstMade = this.seq
    this.handlingLate = late
    pending.settle(answer)
    await drain()
    this.handlingLate = false
    const after = this.observe()
    if (late) this.report(lateChanged(pending.call, before, after))
    const made = this.pending.filter(call => call.seq >= firstMade)
    this.report(lostOnUsableFailure(pending.call, answer, before, after, made))
    const ending = late ? undefined : failureEnding(pending.call, answer, before, after)
    if (ending !== undefined) this.failureEndings.add(ending)
    this.afterStep()
  }

  private isLate(pending: PendingCall): boolean {
    return pending.lateBorn || (pending.bound !== undefined && this.fired.has(pending.bound))
  }

  private async settleAll(): Promise<void> {
    for (let count = 0; count < REST_STEPS; count += 1) {
      const oldest = this.calls[0]
      if (oldest !== undefined) {
        this.log.push(`answer ${oldest.call.port}:${oldest.call.subject} ok`)
        await this.settle(oldest, 'ok')
      } else if (this.timers[0] !== undefined) await this.fireOldest()
      else return
    }
    this.report([
      {
        property: 'P8',
        signature: 'P8-T1-no-rest',
        detail: `still busy after ${REST_STEPS} lawful steps`,
      },
    ])
  }

  private afterStep(): void {
    for (const reason of this.unhandled.splice(0)) this.report([unhandledRejection(reason)])
    this.report(stateViolations(this))
    if (closeWaitsUnbounded(this)) this.closeWaitsSeen = true
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

type Visit = Readonly<{
  projection: string
  fresh: boolean
  enabled: readonly string[]
  offered: readonly number[]
}>

type Queued = Readonly<{ path: readonly Step[]; parent: string | undefined }>

let active: Run | undefined

const stray: unknown[] = []

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

function stepLabel(step: Step): string {
  return step.throws.length === 0 ? step.act : `${step.act} [throws: ${step.throws.join(',')}]`
}

export async function explore(
  scenario: Scenario,
  progress: (states: number, runs: number, depth: number) => void = () => undefined,
): Promise<Exploration> {
  const { keys, catalog } = await modelKeys(scenario.keys)
  const started = performance.now()
  const seen = new Set<string>()
  const found = new Map<string, Violation>()
  let closeWaits: readonly string[] | undefined
  const failureEndings = new Set<string>()
  let runs = 0
  let depth = 0
  let states = 0
  let frontier = 0

  async function visit(queued: Queued): Promise<Visit> {
    const run = new Run(scenario, keys, catalog)
    active = run
    for (const act of scenario.prelude ?? []) {
      if (!run.enabled().includes(act))
        throw new Nondeterminism(`prelude step ${act} is not enabled`)
      await run.perform({ act, throws: [] })
    }
    const { path, parent } = queued
    for (const [index, step] of path.entries()) {
      if (index === path.length - 1 && parent !== undefined && run.projection() !== parent)
        throw new Nondeterminism(
          `replay of ${path.map(stepLabel).join(' / ')} left the recorded state`,
        )
      if (!run.enabled().includes(step.act))
        throw new Nondeterminism(`${step.act} is not enabled on replay at step ${index + 1}`)
      await run.perform(step)
    }
    runs += 1
    for (const ending of run.failureEndings) failureEndings.add(ending)
    const projection = run.projection()
    const fresh = scenario.exhaustivePaths === true || !seen.has(projection)
    const visited: Visit = { projection, fresh, enabled: run.enabled(), offered: [...run.offered] }
    if (fresh) {
      seen.add(projection)
      states += 1
      depth = Math.max(depth, path.length)
      if (states % 5000 === 0) progress(states, runs, depth)
      if (closeWaits === undefined && run.closeWaits) closeWaits = [...run.log]
      if (path.length === scenario.maxDepth) {
        frontier += 1
        await run.rest()
      }
    }
    const prefix = path.length === 0 ? 0 : (scenario.prelude?.length ?? 0) + path.length
    collect(run.reports, prefix, fresh)
    return visited
  }

  function collect(reports: readonly Report[], length: number, fresh: boolean): void {
    for (const report of reports) {
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
      const last = next.path.at(-1)
      if (last !== undefined) {
        const after = Math.max(-1, ...last.throws)
        for (const index of result.offered.filter(item => item > after))
          queue.push({
            path: [...next.path.slice(0, -1), { act: last.act, throws: [...last.throws, index] }],
            parent: next.parent,
          })
      }
      if (!result.fresh || next.path.length === scenario.maxDepth) continue
      for (const act of result.enabled)
        queue.push({ path: [...next.path, { act, throws: [] }], parent: result.projection })
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
    closeWaits,
    failureEndings: [...failureEndings].sort(),
  }
}
