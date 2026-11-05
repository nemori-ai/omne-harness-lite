// The bounded exhaustive explorer of the connection table. It drives the real
// `createConnectionTable` on the scripted ports of `ports.ts` and enumerates, breadth first, every
// schedule within the scenario's bounds: which client operation starts (`ensure`, `release`,
// `closeAll`, `lose`), which pending port call is answered and how, whether a call throws when it
// is made, and when the oldest bound fires. Between two choices every promise reaction runs (one
// macrotask turn), so a choice is taken only in a quiescent state, as on a real event loop.
//
// A state is a run replayed from the start: promises cannot be copied. States are told apart by
// their projection (`projection`); two schedules that reach the same projection are explored once.
// Every state reached is checked against the invariants of `properties.ts`. With `maxDepth`, the
// states at that depth are driven to rest instead (every bound fires, then every port answers
// lawfully, then `closeAll`) and checked on the way. The actions, and the model actions of
// `verification/models/ConnectionTable.tla` they map to, are in `verification/README.md`.
import { AsyncLocalStorage } from 'node:async_hooks'
import { access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  catalogKeyOf,
  connectionKeyOf,
  type ConnectionState,
  type ReleaseReport,
} from '@omne-harness/mcp-contract'
import {
  createMemoryAdoptionView,
  createMemoryUseEligibility,
} from '@omne-harness/mcp-contract/testing'
import { admit } from '../../src/internal/gate.ts'
import { prepareSettings } from '../../src/internal/settings.ts'
import {
  createConnectionTable,
  type ClosedEndpoint,
  type ConnectionTable,
  type Ensured,
  type EnsureFailure,
} from '../../src/internal/table.ts'
import { catalogKeyTextOf } from '../../src/internal/text.ts'
import { CONFIG, VALUE, settingsOf } from '../doubles/world.ts'
import {
  binding,
  home,
  json,
  millis,
  principalKey,
  ref,
  tenantOf,
  type Principal,
} from '../doubles/values.ts'
import {
  closeWaitsUnbounded,
  connectedAfterShutdown,
  connectsAfterShutdown,
  crossesKeys,
  describeReason,
  foreignTransport,
  internalError,
  lateChanged,
  staleLoseChanged,
  stateViolations,
  unhandledRejection,
  unstoppedAtShutdown,
  type Found,
  type KeyObservation,
  type OpKind,
  type OpView,
  type RunView,
} from './properties.ts'
import {
  BOUNDED_PORTS,
  PORT_ANSWERS,
  PortFault,
  emptyLedger,
  scriptedPorts,
  type Answer,
  type CallDesk,
  type CallRequest,
  type Context,
  type Deviation,
  type Ledger,
  type ModelKey,
  type ScriptedPortCall,
} from './ports.ts'

export type KeyName = 'A' | 'B' | 'C'

/** The bounds of one exploration. */
export type Scenario = Readonly<{
  name: string
  /**
   * On the same holding and revision: `A`, alice of one tenant; `B`, mallory of another tenant;
   * `C`, bob of A's tenant with another peer account.
   */
  keys: readonly KeyName[]
  /** `ensure` calls per key. */
  ensures: number
  /** `release` calls per key. */
  releases: number
  /** Whether the scenario calls `closeAll` once. */
  closeAll: boolean
  /** `lose` calls in total, each on the answer of an earlier `ensure`. */
  loses: number
  /** The ways a port call may go other than its lawful answer. */
  deviations: readonly Deviation[]
  /** How many deviations one schedule may take in total. */
  budget: number
  /** Schedules longer than this are not extended; their last states are driven to rest. */
  maxDepth?: number
  /** Explore every schedule, without merging states of equal projection (a cross-check). */
  exhaustivePaths?: boolean
}>

/** One choice of a schedule: the action, and which calls made during it throw when called. */
export type Step = Readonly<{ act: string; throws: readonly number[] }>

/** A violation, with the shortest schedule that showed it and in how many states it was seen. */
export type Violation = Found & Readonly<{ trace: readonly string[]; depth: number; seen: number }>

export type Exploration = Readonly<{
  scenario: Scenario
  /** Distinct projected states reached (schedules, with `exhaustivePaths`). */
  states: number
  /** Schedules replayed, each one on a fresh table. */
  runs: number
  /** Length of the longest schedule explored. */
  depth: number
  /** States at `maxDepth` that were driven to rest instead of extended. */
  frontier: number
  elapsedMs: number
  violations: readonly Violation[]
  /** The shortest schedule after which a `release` or `closeAll` still waits once every bound fired (A1). */
  closeWaits: readonly string[] | undefined
}>

/** The same schedule replayed differently: a stop condition of the closure spec. */
export class Nondeterminism extends Error {
  override readonly name = 'Nondeterminism'
}

const contexts = new AsyncLocalStorage<Context>()

/** The connection bound of every key. The explorer fires bounds; it never waits for one. */
const BOUND = millis(1000)

/** Lawful steps after which a run driven to rest is taken as not coming to rest. */
const REST_STEPS = 200

/**
 * The owner of each key. A and B differ in the tenant only; A and C in the peer account only (the
 * credential binding). Every key has its own adoption view, so all of them adopt at the same
 * revision and the connection keys differ in nothing else (SPEC P5).
 */
const KEY_OWNERS = {
  A: { principal: { id: 'alice' }, tenant: home, credential: 'main' },
  B: { principal: { id: 'mallory' }, tenant: tenantOf('t'), credential: 'main' },
  C: { principal: { id: 'bob' }, tenant: home, credential: 'other' },
} as const

/** One stdio endpoint with a process credential per key, adopted and admitted. */
export async function modelKeys(names: readonly KeyName[]): Promise<readonly ModelKey[]> {
  const eligibility = createMemoryUseEligibility<Principal>({ principalKey })
  const endpoint = ref('files')
  const keys: ModelKey[] = []
  for (const name of names) {
    const owner = KEY_OWNERS[name]
    const asking = access<Principal>(owner.principal, owner.tenant)
    const adoption = createMemoryAdoptionView<Principal, string>({ scopeKey: scope => scope })
    const adopted = adoption.adopt({
      tenant: owner.tenant,
      scope: 'ws',
      ref: endpoint,
      body: json({
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
        credential: VALUE(binding(owner.credential)),
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
    })
  }
  return keys
}

/** Lets every promise reaction run: one macrotask turn, after Node reported unhandled rejections. */
function drain(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

const SOURCE_FRAME =
  /at (?:async )?(?:(\S+) \()?(?:file:\/\/)?\S*\/packages\/mcp\/mcp\/src\/(?:internal\/)?([\w.-]+\.ts):\d+:\d+\)?$/

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

/**
 * The state without the residual: what P6 compares across a late answer. A closed entry that
 * keeps only processes whose stop was not confirmed reports `lost` (`close-unconfirmed`) to carry
 * its residual (SPEC MC-9); without the residual it is `none`.
 */
function coreOf(state: ConnectionState): string {
  if (state.kind === 'lost' && state.reason === 'close-unconfirmed') return '{"kind":"none"}'
  return JSON.stringify(state, (name, value: unknown) => (name === 'residual' ? undefined : value))
}

type Timer = Readonly<{ name: string; controller: AbortController }>

type PendingCall = Readonly<{
  call: ScriptedPortCall
  /** The bound the table waits for it under, for a bounded port. */
  bound: string | undefined
  /** Made while a late answer, or a call made after one, was handled: its answer is late too. */
  lateBorn: boolean
  settle: (answer: Answer) => void
}>

type Op = {
  readonly name: string
  readonly kind: OpKind
  readonly key: string | undefined
  status: OpView['status']
  result: string
  ensured: Ensured | undefined
}

type Budget = {
  ensures: Map<string, number>
  releases: Map<string, number>
  closeAll: number
  loses: number
  deviations: number
}

/** A violation one run found: the step it showed in (1 for the first), and the schedule up to it. */
type Report = Found & Readonly<{ step: number; trace: readonly string[] }>

const OP_LETTER: Readonly<Record<OpKind, string>> = {
  ensure: 'e',
  release: 'r',
  closeAll: 'c',
  lose: 'l',
}

/** One schedule replayed on a fresh table. */
class Run implements RunView, CallDesk {
  readonly ledger: Ledger = emptyLedger()
  readonly ops: Op[] = []
  readonly log: string[] = []
  readonly reports: Report[] = []
  shutAsked = false
  /** Indices of the calls made during the current step that were allowed to throw. */
  offered: number[] = []
  /** Set when the run is driven to rest: no throws, no deviations from then on. */
  private resting = false
  private readonly keys: readonly ModelKey[]
  private readonly scenario: Scenario
  private readonly table: ConnectionTable<Principal>
  private calls: PendingCall[] = []
  /** True while the reactions to a late answer run: the calls they make answer late too. */
  private handlingLate = false
  private timers: Timer[] = []
  private readonly fired = new Set<string>()
  private readonly builds = new Map<string, number>()
  private readonly reported = new Set<string>()
  private readonly unhandled: unknown[] = []
  private readonly left: Budget
  private seq = 0
  private steps = 0
  private stepThrows: ReadonlySet<number> = new Set()
  private stepCalls = 0
  private closeWaitsSeen = false

  constructor(scenario: Scenario, keys: readonly ModelKey[]) {
    this.scenario = scenario
    this.keys = keys
    this.left = {
      ensures: new Map(keys.map(key => [key.name, scenario.ensures])),
      releases: new Map(keys.map(key => [key.name, scenario.releases])),
      closeAll: scenario.closeAll ? 1 : 0,
      loses: scenario.loses,
      deviations: scenario.budget,
    }
    this.table = createConnectionTable(scriptedPorts(this, keys, this.ledger), CONFIG)
  }

  get pending(): readonly ScriptedPortCall[] {
    return this.calls.map(item => item.call)
  }

  get bounds(): number {
    return this.timers.length
  }

  /** Whether the schedule so far showed a `release` or `closeAll` waiting with every bound fired. */
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
          current === undefined
            ? '-'
            : `${this.ledger.names.get(current.transport) ?? '?'}@g${current.generation}`,
      }
    })
  }

  /**
   * What decides the future of the run: the table as consumers see it, the pending calls with
   * the code their answers go to, the bounds, the ledger and the budget. An answered operation
   * keeps only what `lose` can use; counts keep only what the properties distinguish.
   */
  projection(): string {
    const { handles, processes, transports } = this.ledger
    return JSON.stringify({
      ops: this.ops.map(op =>
        op.ensured === undefined
          ? `${op.name} ${op.status}`
          : `${op.name} ${op.status} ${op.result}`,
      ),
      calls: this.calls
        .map(pending =>
          [
            pending.call.port,
            pending.call.subject,
            pending.call.context?.op,
            pending.call.context?.timer,
            pending.call.site,
            this.isLate(pending) ? 'late' : '',
          ].join('|'),
        )
        .sort(),
      timers: this.timers.map(timer => timer.name),
      handles: handles.map(item => `${item.name}:${Math.min(item.releases, 2)}`),
      processes: processes.map(item => `${item.name}:${Math.min(item.stops, 1)}:${item.lastStop}`),
      transports: transports.map(item => `${item.name}:${Math.min(item.closes, 1)}`),
      keys: this.observe(),
      left: [
        [...this.left.ensures],
        [...this.left.releases],
        this.left.closeAll,
        this.left.loses,
        this.left.deviations,
      ],
      shut: this.shutAsked,
    })
  }

  /** The actions a schedule may take now, in a fixed order. */
  enabled(): string[] {
    const acts: string[] = []
    for (const key of this.keys)
      if ((this.left.ensures.get(key.name) ?? 0) > 0) acts.push(`ensure ${key.name}`)
    for (const key of this.keys)
      if ((this.left.releases.get(key.name) ?? 0) > 0) acts.push(`release ${key.name}`)
    if (this.left.closeAll > 0) acts.push('closeAll')
    if (this.left.loses > 0)
      for (const op of this.ops) if (op.ensured !== undefined) acts.push(`lose ${op.name}`)
    const oldest = this.timers[0]
    if (oldest !== undefined) acts.push(`fire ${oldest.name}`)
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
      case 'fire':
        this.fire()
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
   * Drives the run to rest, for a state at the depth bound: every bound fires with no port
   * answering, then every port answers lawfully, then `closeAll`, and every port again.
   */
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

  /** Called by the replaced `AbortSignal.timeout` inside the table: a bound the explorer fires. */
  timeout(): AbortSignal {
    const store = contexts.getStore()
    let name = `T(${store?.op ?? '?'})`
    if (store?.timer !== undefined) {
      const key = this.ops.find(op => op.name === store.op)?.key ?? '?'
      const count = (this.builds.get(key) ?? 0) + 1
      this.builds.set(key, count)
      name = `T(b${key}${count})`
    }
    const controller = new AbortController()
    this.timers.push({ name, controller })
    if (store !== undefined) contexts.enterWith({ ...store, timer: name })
    return controller.signal
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
      context: contexts.getStore(),
      site: siteOf(),
    }
    this.seq += 1
    this.report(connectsAfterShutdown(this, call))
    const opKey = this.ops.find(op => op.name === call.context?.op)?.key
    this.report(crossesKeys(this, call, opKey))
    const index = this.stepCalls
    this.stepCalls += 1
    if (this.mayDeviate('throw')) this.offered.push(index)
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
        else resolve(request.value(answer))
      },
    })
    return promise
  }

  private mayDeviate(deviation: Deviation): boolean {
    return !this.resting && this.left.deviations > 0 && this.scenario.deviations.includes(deviation)
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

  private newOp(kind: OpKind, key: string | undefined): Op {
    const count = this.ops.filter(op => op.kind === kind && op.key === key).length + 1
    const op: Op = {
      name: `${OP_LETTER[kind]}${key ?? ''}${count}`,
      kind,
      key,
      status: 'waiting',
      result: '',
      ensured: undefined,
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

  private ensure(name: string): void {
    const key = this.keyNamed(name)
    this.left.ensures.set(name, (this.left.ensures.get(name) ?? 0) - 1)
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
        const transport = this.ledger.names.get(outcome.ok.transport)
        const record = this.ledger.transports.find(item => item.name === transport)
        this.report(foreignTransport(op, record?.key))
        this.report(connectedAfterShutdown(this, op))
        return `ok ${transport ?? '?'}@g${outcome.ok.generation}`
      },
    )
  }

  private release(name: string): void {
    const key = this.keyNamed(name)
    this.left.releases.set(name, (this.left.releases.get(name) ?? 0) - 1)
    this.invoke(
      this.newOp('release', name),
      () => this.table.close(key.access.tenant, key.holding),
      (report: ReleaseReport) => JSON.stringify(report),
    )
  }

  private closeAll(): void {
    this.shutAsked = true
    this.invoke(
      this.newOp('closeAll', undefined),
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
    this.invoke(
      op,
      () =>
        this.table.lose(
          ensured.connection,
          ensured.generation,
          'stream-broken',
          'connection-unavailable',
        ),
      String,
    )
    await drain()
    if (stale) this.report(staleLoseChanged(op, before, this.observe()))
    this.afterStep()
  }

  private fire(): void {
    const timer = this.timers.shift()
    if (timer === undefined) throw new Nondeterminism('no bound to fire')
    this.fired.add(timer.name)
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
    this.handlingLate = late
    pending.settle(answer)
    await drain()
    this.handlingLate = false
    if (late) this.report(lateChanged(pending.call, before, this.observe()))
    this.afterStep()
  }

  /** A late answer: its bound fired, or the call was made in the wake of a late answer (P6). */
  private isLate(pending: PendingCall): boolean {
    return pending.lateBorn || (pending.bound !== undefined && this.fired.has(pending.bound))
  }

  /** Answers every pending call lawfully, oldest first, then fires the bounds left. */
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

/** What one replayed schedule found out about the state it ends in. */
type Visit = Readonly<{
  projection: string
  /** False when an earlier schedule reached the same projection. */
  fresh: boolean
  enabled: readonly string[]
  /** The calls of the last step that could also have thrown. */
  offered: readonly number[]
}>

type Queued = Readonly<{ path: readonly Step[]; parent: string | undefined }>

let active: Run | undefined

/** Rejections nobody handled while no run was active: a defect of the explorer. */
const stray: unknown[] = []

/**
 * Replaces, for the duration of `body`, what makes a run deterministic and observable:
 * `AbortSignal.timeout` inside the table becomes a bound the explorer fires, and rejections that
 * nobody handled go to the active run instead of the test runner.
 */
async function withHooks<T>(body: () => Promise<T>): Promise<T> {
  const timeout = AbortSignal.timeout
  const listeners = process.listeners('unhandledRejection')
  const onUnhandled = (reason: unknown) => {
    if (active === undefined) stray.push(reason)
    else active.rejectedUnhandled(reason)
  }
  AbortSignal.timeout = (milliseconds: number) =>
    active !== undefined && contexts.getStore() !== undefined
      ? active.timeout()
      : timeout.call(AbortSignal, milliseconds)
  process.removeAllListeners('unhandledRejection')
  process.on('unhandledRejection', onUnhandled)
  try {
    return await body()
  } finally {
    active = undefined
    AbortSignal.timeout = timeout
    process.off('unhandledRejection', onUnhandled)
    for (const listener of listeners) process.on('unhandledRejection', listener)
  }
}

function stepLabel(step: Step): string {
  return step.throws.length === 0 ? step.act : `${step.act} [throws: ${step.throws.join(',')}]`
}

/**
 * Explores every schedule of `scenario` breadth first, so the first schedule that shows a
 * violation is a shortest one. Throws `Nondeterminism` when a replay leaves the recorded path.
 */
export async function explore(
  scenario: Scenario,
  progress: (states: number, runs: number, depth: number) => void = () => undefined,
): Promise<Exploration> {
  const keys = await modelKeys(scenario.keys)
  const started = performance.now()
  const seen = new Set<string>()
  const found = new Map<string, Violation>()
  let closeWaits: readonly string[] | undefined
  let runs = 0
  let depth = 0
  let states = 0
  let frontier = 0

  async function visit(queued: Queued): Promise<Visit> {
    const run = new Run(scenario, keys)
    active = run
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
      const last = next.path.at(-1)
      if (last !== undefined) {
        // The same action with one more call throwing: a sibling transition of the parent state.
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
  }
}
