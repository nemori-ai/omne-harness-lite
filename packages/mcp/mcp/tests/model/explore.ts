// The bounded exhaustive explorer of the connection table and the call port. It drives the real
// `createConnectionTable`, `createCalls` and `createTasks` on the scripted ports of `ports.ts`
// and enumerates, breadth first, every schedule within the scenario's bounds: which client
// operation starts (`ensure`, `release`, `closeAll`, `lose`, `invoke`, `continue`, `cancel`, a
// task operation, `drop`), which caller aborts, which pending port call is answered and how,
// whether a call throws when it is made, and when the oldest bound fires. Between two choices
// every promise reaction runs (one macrotask turn), so a choice is taken only in a quiescent
// state, as on a real event loop.
//
// A state is a run replayed from the start: promises cannot be copied. States are told apart by
// their projection (`projection`); two schedules that reach the same projection are explored once.
// Every state reached is checked against the invariants of `properties.ts`. With `maxDepth`, the
// states at that depth are driven to rest instead (every bound fires, then every port answers
// lawfully, then `closeAll`) and checked on the way. The actions, and the model actions of
// `verification/models/ConnectionTable.tla` and `Calls.tla` they map to, are in
// `verification/README.md`.
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

/** The operations of the call port one key's principal may start (SPEC MC-16, MC-17). */
export type CallBudget = Readonly<{
  /** `invoke` calls, each on the correlation key `c`. */
  invokes?: number
  /** `continueWithInput` calls, each on `c`, at the generation current when the call starts. */
  continues?: number
  /** `cancel` calls on `c`. */
  cancels?: number
  /** Task operations on the task `t1`, one of `taskMethods` each. */
  tasks?: number
}>

/** The bounds of one exploration. */
export type Scenario = Readonly<{
  name: string
  /**
   * On the same holding and revision: `A`, alice of one tenant; `B`, mallory of another tenant;
   * `C`, bob of A's tenant with another peer account; `D`, alice's principal text in B's tenant;
   * `E`, alice of A's tenant on C's peer account (the same principal as A, another connection).
   */
  keys: readonly KeyName[]
  /** `ensure` calls per key, for the keys of `ensurers` (every key when absent). */
  ensures: number
  ensurers?: readonly KeyName[]
  /**
   * A fixed schedule every run starts with, before the exploration branches: a connection that
   * is already there when the operations under test begin. Its steps are not explored and do
   * not count toward the depth; each one must be enabled when its turn comes.
   */
  prelude?: readonly string[]
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
  /**
   * Any bound may fire next, not only the oldest: calls with bounds of different lengths. Off,
   * the bounds fire in the order they started, as bounds of one length do.
   */
  anyBound?: boolean
  /** The call port's operations per key. Given, the store holds a catalog of one action. */
  ops?: Partial<Record<KeyName, CallBudget>>
  /** Caller aborts in total, each on a waiting `invoke` or `continue`. */
  aborts?: number
  /** `drop` calls in total, each losing the current connection of a key. */
  drops?: number
  /** The task operations a `tasks` budget may spend on. */
  taskMethods?: readonly TaskMethod[]
  /** What the peer answers to a sent call: a complete result, or the task `t1`. */
  peer?: PeerReply
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
  /**
   * How the failures of requests on a ready connection ended, sorted (`failureEnding`): the
   * witness that P15 was reached and that a marked failure still loses the connection.
   */
  failureEndings: readonly string[]
}>

/** The same schedule replayed differently: a stop condition of the closure spec. */
export class Nondeterminism extends Error {
  override readonly name = 'Nondeterminism'
}

const contexts = new AsyncLocalStorage<Context>()

/** The connection bound of every key. The explorer fires bounds; it never waits for one. */
const BOUND = millisOf(1000)

/** Lawful steps after which a run driven to rest is taken as not coming to rest. */
const REST_STEPS = 200

/** The one action of the catalog, and the correlation key every call uses. */
const ACTION = actionNameOf('read')
const CORRELATION = correlationKeyOf('c')
const REQUEST_STATE = requestStateOf('s')

/** What `lose` and `drop` report: a broken stream, the mark `connection-unavailable`. */
const STREAM_BROKEN: Lost = { reason: 'stream-broken', mark: 'connection-unavailable' }

/** The task methods a scenario spends its `tasks` budget on unless it names its own. */
const DEFAULT_TASK_METHODS: readonly TaskMethod[] = ['get']

/**
 * The owner of each key. A and B differ in the tenant and the principal; A and C in the principal
 * and the peer account (the credential binding); A and D in the tenant only, with the same
 * principal text; A and E in the peer account only, with the same tenant and principal, so their
 * calls share one place of the in-flight table and their tasks one key of the task table. Every
 * key has its own adoption view, so all of them adopt at the same revision and the connection
 * keys differ in nothing else (SPEC P5).
 */
const KEY_OWNERS = {
  A: { principal: { id: 'alice' }, tenant: home, credential: 'main' },
  B: { principal: { id: 'mallory' }, tenant: tenantOf('t'), credential: 'main' },
  C: { principal: { id: 'bob' }, tenant: home, credential: 'other' },
  D: { principal: { id: 'alice' }, tenant: tenantOf('t'), credential: 'main' },
  E: { principal: { id: 'alice' }, tenant: home, credential: 'other' },
} as const

/** The catalog of one available action, `read`, without an output schema. */
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

/** One stdio endpoint with a process credential per key, adopted and admitted. */
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

/** Lets every promise reaction run: one macrotask turn, after Node reported unhandled rejections. */
function drain(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

const SOURCE_FRAME =
  /at (?:async )?(?:(\S+) \()?(?:file:\/\/)?\S*\/packages\/mcp\/mcp\/src\/(?:internal\/)?([\w.-]+\.ts):\d+:\d+\)?$/

/** Frames enough to reach the code a port call returns to; fewer frames format faster. */
const SITE_FRAMES = 12

/**
 * V8's own text of a stack, as Node prints it when nothing replaces the formatter. A test runner
 * installs a formatter that maps every frame through the source map; `siteOf` runs on every port
 * call, so it formats the frames itself. The names and paths are V8's; only line and column, which
 * a site does not use, may differ from the mapped ones.
 */
function plainStack(error: Error, frames: readonly NodeJS.CallSite[]): string {
  return [String(error), ...frames.map(frame => `    at ${String(frame)}`)].join('\n')
}

/** The functions of `src/` on the stack of the caller, innermost first, as `name@file`. */
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

/** What `wiredName` gives a handle that refuses requests: it reaches no transport. */
const REFUSING = 'refusing'

/** What `wiredName` gives a transport the scripted factory did not open. */
const UNNAMED = 'unnamed'

/** The name the ledger gave the transport a connection handle reaches. */
function wiredName(ledger: Readonly<{ names: WeakMap<object, string> }>, ensured: Ensured): string {
  const wire = ensured.wire()
  return 'ok' in wire ? (ledger.names.get(wire.ok) ?? UNNAMED) : REFUSING
}

/** A generation of a key, as `lostGenerations` holds it. */
function generationText(key: string, generation: number): string {
  return `${key}@${generation}`
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

/** The text of an `invoke` or `continue` answer: the kind, its reason, and a cause if any. */
function summarizeInvoke(result: InvokeResult): string {
  if (result.kind === 'not-sent') return `not-sent ${result.reason.kind}`
  const { outcome } = result
  return outcome.kind === 'unknown' ? `sent unknown ${outcome.cause}` : `sent ${outcome.kind}`
}

/** The text of a task operation's answer. */
function summarizeTask(result: Outcome<unknown, OperationFailure>): string {
  if ('failure' in result)
    return result.failure.kind === 'effect-unknown'
      ? `fail effect-unknown ${result.failure.cause}`
      : `fail ${result.failure.kind}`
  return `ok ${JSON.stringify(result.ok)}`
}

/** A bound of the table, with the client operation it was started for. */
type Timer = Readonly<{ name: string; controller: AbortController; op: string | undefined }>

type PendingCall = {
  readonly call: ScriptedPortCall
  /** The bound the table waits for it under, for a bounded port; a task bound is attached later. */
  bound: string | undefined
  /** Made while a late answer, or a call made after one, was handled: its answer is late too. */
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
  /** The caller's signal of an `invoke` or `continue`. */
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

/** A violation one run found: the step it showed in (1 for the first), and the schedule up to it. */
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

/** What the counting view of the in-flight table tells the run. */
interface ReservationDesk {
  reserved(key: InFlightKey, answer: 'reserved' | 'in-use'): void
  marked(key: InFlightKey): void
  concluded(key: InFlightKey): void
}

/** The real in-flight table, with every reservation, send and conclusion reported to the run (P11, P12). */
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

/** One schedule replayed on a fresh table. */
class Run implements RunView, CallDesk, ReservationDesk {
  readonly ledger: Ledger = emptyLedger()
  readonly ops: Op[] = []
  readonly log: string[] = []
  readonly reports: Report[] = []
  readonly tasksOf = new Set<string>()
  /** How the failures of requests on a ready connection ended (`failureEnding`). */
  readonly failureEndings = new Set<string>()
  shutAsked = false
  /** The `seq` at which the close of each key began: transports opened before it refuse (P16). */
  private readonly closedSince = new Map<string, number>()
  /**
   * The generations the explorer itself lost, by its `lose` and `drop` steps on a current
   * connection (P16). A loss the product reads from a marked answer is not in it.
   */
  private readonly lostGenerations = new Set<string>()
  /** Indices of the calls made during the current step that were allowed to throw. */
  offered: number[] = []
  /** Set when the run is driven to rest: no throws, no deviations from then on. */
  private resting = false
  private readonly keys: readonly ModelKey[]
  private readonly scenario: Scenario
  private readonly table: ConnectionTable<Principal>
  private readonly calls_: ReturnType<typeof createCalls<Principal, string>>
  private readonly tasks_: ReturnType<typeof createTasks<Principal, string>>
  private readonly records: ReservationRecord[] = []
  private readonly open_ = new Map<string, ReservationRecord>()
  private calls: PendingCall[] = []
  /** True while the reactions to a late answer run: the calls they make answer late too. */
  private handlingLate = false
  private timers: Timer[] = []
  private readonly fired = new Set<string>()
  /** Per client operation: how many bounds were started for it, and how many fired. */
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
    // The table's runtime is the explorer's: its bounds fire as steps, and an error of the table
    // that comes after `closeAll` answered is reported like a rejection nobody handled (P7).
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

  /** How many bounds were started for `op`, and how many of them fired. */
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
          current === undefined ? '-' : `${wiredName(this.ledger, current)}@g${current.generation}`,
      }
    })
  }

  /**
   * What decides the future of the run: the table as consumers see it, the pending calls with
   * the code their answers go to, the bounds, the ledger, the in-flight and task tables as the
   * properties see them, and the budget. An answered operation keeps only what `lose` can use and
   * what the properties read at its answer; counts keep only what the properties distinguish.
   */
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

  /** The actions a schedule may take now, in a fixed order. */
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

  /**
   * The table's source of bounds: a bound the explorer fires, named by its kind and the operation
   * it was started for. The calls made after it in the same operation are made under it. A task
   * bound starts after the task request was made (MC-17), so it is attached to that request.
   */
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
    // The peer's answer is a promise the transport handed over, not a method: it cannot throw.
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
          // A task method's `fail` and `fail-usable` are `not-sent` (`ports.ts`): the request did not leave.
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

  /**
   * `conclude`: the one conclusion of the call (MC-16 step 13). The open place of the key is
   * concluded; concluding the place of another operation, or a place nobody holds, is a defect.
   */
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

  /** P11: an operation acts on the place of another operation. */
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
        // A handle that refuses reaches no transport, so P5 has nothing to compare; a transport
        // the factory did not open is P5's to report.
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

  /** A pending `transports.open` whose key began closing after it was called: P16 for what it hands over. */
  private closedOver(call: ScriptedPortCall): boolean {
    const since = this.closedSince.get(call.key)
    return call.port === 'transports.open' && since !== undefined && call.seq < since
  }

  /**
   * The close of `keys` begins now, by `start`: transports opened before it refuse requests from
   * now on, and no connection of the keys takes requests once `start` returned (P16).
   */
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

  /** `lose` on the current connection of a key, as a transport that found it gone reports it. */
  private drop(name: string): void {
    const key = this.keyNamed(name)
    const current = this.table.current(key.connectionKey)
    if (current === undefined) throw new Nondeterminism(`no current connection of ${name} to drop`)
    this.left.drops -= 1
    this.lostGenerations.add(generationText(name, current.generation))
    this.invoke(this.newOp('lose', name), () => loseOn(this.table, current, STREAM_BROKEN), String)
  }

  /** What the properties check when an `invoke` or `continue` answers. */
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
    // The generation the `inputRequired` outcome was issued at: the current one, when there is
    // one; a generation nothing is current at otherwise, so the call is refused as `unknown`.
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

  /** A stop signal fired for the call: by `cancel` or by the caller's abort. */
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

  /** Fires the bound named `name`, or the oldest one. */
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
    // A late answer reaches no operation that still waits: what it changes is P6's.
    const ending = late ? undefined : failureEnding(pending.call, answer, before, after)
    if (ending !== undefined) this.failureEndings.add(ending)
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
 * For the duration of `body`, rejections that nobody handled go to the active run instead of the
 * test runner. The bounds need no hook: each run gives the table its own source of bounds.
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
    // The prelude's reports are collected with the root run only.
    const prefix = path.length === 0 ? 0 : (scenario.prelude?.length ?? 0) + path.length
    collect(run.reports, prefix, fresh)
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
    failureEndings: [...failureEndings].sort(),
  }
}
