// MD-01 and MD-10: the runtime part of `ModelRuntimeLocalPlugin`. It publishes `modelRuntime` from
// the runtime of the provider, next to the host, and it runs the result push of the provider:
// every settled call is frozen once, pushed to the receiver that its consumer owner registered,
// acknowledged through the retained handoff after `saved`, cleaned, and every late account that
// the provider accepts afterwards is pushed to the same owner.
//
// Structural facts:
// - The push learns of results and late accounts from the commands port that the provider writes
//   through: a committed `settle` wakes the call, and a late account is reserved before it is
//   accepted and frozen right after. Nothing here guesses a commit from a read.
// - The ACK takes a `SavedResult`, and only `acceptReceipt` makes one, from a receipt with the
//   original key and an evidence of the frozen consumer owner. There is no other way to reach the
//   handoff.
// - The ledger holds every frozen delivery and its standing until the ACK. It is the one store of
//   the push state and has one writer: the stage that holds its lease. A successor that takes the
//   same ledger goes on with the same keys and payloads.
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelOperationId,
  encodeModelInvocationRef,
  type ConsumerRef,
  type DispatchId,
  type ModelCallId,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelFailure,
  type ModelInvocationRef,
  type ModelOperationId,
  type ModelResultReceiver,
  type ModelRuntime,
  type ModelSavedReceipt,
  type ResultPart,
} from '@omne-harness/model-contract'
import type {
  ExecutionRef,
  ModelCommands,
  ModelHostAuthority,
} from '@omne-harness/model-contract/provider'
import {
  ModelRuntimeService,
  createModelResultReceiverTable,
  type ModelResultReceiverTable,
} from '@omne-harness/model-cordis-contract/cordis'

const DEPENDENCY = 'model-result-push'

type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>
type ResultDelivery = Extract<ModelDelivery, { kind: 'result' }>
type AccountDelivery = Extract<ModelDelivery, { kind: 'account' }>

/** Why a delivery is not saved and will not be pushed again by itself. */
export type DeliveryFailure =
  | Readonly<{ kind: 'rejected'; failure: ModelDeliveryFailure }>
  /** The receipt names another key, or its evidence is not the frozen consumer owner's. */
  | Readonly<{ kind: 'receipt-mismatch' }>

/**
 * What the pushes of one delivery came to. `saved` keeps its first receipt. `unknown` gives way only
 * to `saved`: a later refusal cannot show that the receiver never saved. `waiting` is a delivery
 * that waits for a receiver or for an answer that may change: no receiver, `unavailable`,
 * `backpressured` or `cancelled-before-accept`.
 */
export type DeliveryStanding =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'waiting'; reason: string }>
  | Readonly<{ status: 'saved'; receipt: ModelSavedReceipt }>
  | Readonly<{ status: 'unknown' }>
  | Readonly<{ status: 'failed'; failure: DeliveryFailure }>

export type HeldDelivery<D extends ModelDelivery = ModelDelivery> = Readonly<{
  /** Frozen once; every push and every redelivery sends exactly this value. */
  delivery: D
  standing: DeliveryStanding
  attempts: number
}>

/** A late account that the provider accepted, held until it is saved. */
export type HeldAccount = HeldDelivery<AccountDelivery> & Readonly<{ reservation: string }>

/**
 * The push state of one call. `operations` are fixed when the record is made, so a repeated read
 * or ACK uses the original operation. After the ACK the result body is dropped: `result` keeps
 * its key only.
 */
export type ResultPushRecord = Readonly<{
  tenant: TenantId
  call: ModelCallId
  operations: Readonly<{ read: ModelOperationId; ack: ModelOperationId }>
  /** Known once the result is frozen; late accounts are pushed to the same consumer. */
  origin: Readonly<{ reference: ModelInvocationRef; consumer: ConsumerRef }> | null
  result: HeldDelivery<ResultDelivery> | null
  acknowledgement: 'none' | 'unknown' | 'acknowledged'
  cleanup: 'pending' | 'released'
  /** The account revision of each dispatch that the consumer has, in the result or pushed. */
  delivered: Readonly<Record<string, string | null>>
  /** Accounts accepted after the result was frozen, in arrival order. */
  accounts: readonly HeldAccount[]
}>

/**
 * The store of the push records: the adapter point of a durable store. It has one writer at a time;
 * `claim` refuses a second one. The in-memory ledger keeps the records of one process.
 */
export interface ResultPushLedger {
  /** Takes the writer lease and returns its release. Throws while another writer holds it. */
  claim(): () => void
  read(target: Target): ResultPushRecord | undefined
  write(record: ResultPushRecord): void
  /** Every record, in the order of its first write. */
  records(): readonly ResultPushRecord[]
}

function keyOf(target: Target): string | undefined {
  const text = tenantCodec.encode(target.tenant)
  return text.ok ? JSON.stringify([text.value, target.call]) : undefined
}

/** A ledger in this process. A successor plugin that is given the same ledger resumes from it. */
export function createMemoryResultPushLedger(): ResultPushLedger {
  const records = new Map<string, ResultPushRecord>()
  let held = false
  return {
    claim() {
      if (held) throw new Error('model result push: the ledger already has a writer')
      held = true
      let released = false
      return () => {
        if (released) return
        released = true
        held = false
      }
    },
    read(target) {
      const key = keyOf(target)
      return key === undefined ? undefined : records.get(key)
    },
    write(record) {
      const key = keyOf(record)
      if (key === undefined) throw new TypeError('model result push: the tenant is not minted')
      records.set(key, record)
    },
    records: () => [...records.values()],
  }
}

/** The bounds of the push. Every one is given by the assembly; there is no default. */
export type ResultPushLimits = Readonly<{
  /** Calls whose deliveries are pushed at once. */
  maxConcurrentCalls: number
  /** Pushes of one delivery after `outcome-unknown`, and resends of one ACK after `commit-unknown`, in one round. */
  maxRedeliveries: number
  /** Cleanup steps of one call in one round. */
  maxCleanupSteps: number
  /** Late accounts of one tenant that are accepted and not yet saved. */
  maxPendingAccountsPerTenant: number
  /** Late accounts of all tenants that are accepted and not yet saved. */
  maxPendingAccounts: number
}>

export type ResultPushOptions = Readonly<{
  /** The store of the push records; the assembly owns it, so a successor plugin can take it. */
  ledger: ResultPushLedger
  limits: ResultPushLimits
}>

/** What the push reports to the plugin for a diagnostic: kinds and counts only, no identities. */
export type RuntimeEvent =
  | Readonly<{ kind: 'no-receiver' }>
  | Readonly<{ kind: 'push-waiting'; reason: string }>
  | Readonly<{ kind: 'push-unknown' }>
  | Readonly<{ kind: 'push-failed'; failure: DeliveryFailure['kind'] }>
  | Readonly<{ kind: 'freeze-failed'; step: string }>
  | Readonly<{ kind: 'ack-failed'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'cleanup-pending'; reason: string }>
  | Readonly<{ kind: 'late-account-refused'; pending: number }>
  | Readonly<{ kind: 'blocked'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'work-threw' }>

const LIMIT_NAMES = [
  'maxConcurrentCalls',
  'maxRedeliveries',
  'maxCleanupSteps',
  'maxPendingAccountsPerTenant',
  'maxPendingAccounts',
] as const

function checkedLimits(limits: ResultPushLimits): ResultPushLimits {
  for (const name of LIMIT_NAMES) {
    const value: unknown = limits?.[name]
    const lower = name === 'maxRedeliveries' ? 0 : 1
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < lower)
      throw new RangeError(`model result push: ${name} must be an integer of at least ${lower}`)
  }
  return { ...limits }
}

function newOperation(): ModelOperationId {
  const decoded = decodeModelOperationId(`mop_${randomUUID()}`)
  if ('ok' in decoded) return decoded.ok
  throw new Error('invalid generated Model operation')
}

/** A deep copy that nothing can change afterwards. */
function frozen<T>(value: T): T {
  const copy = structuredClone(value)
  const freeze = (item: unknown): void => {
    if (typeof item !== 'object' || item === null || Object.isFrozen(item)) return
    Object.freeze(item)
    for (const child of Object.values(item)) freeze(child)
  }
  freeze(copy)
  return copy
}

/** Whether a push that came to `next` may replace `standing` as the fact of the delivery. */
function replaces(standing: DeliveryStanding, next: DeliveryStanding): boolean {
  if (standing.status === 'saved') return false
  if (standing.status === 'unknown') return next.status === 'saved'
  return true
}

/** A result whose receipt the Model accepted: the only input of the ACK. */
type SavedResult = Readonly<{
  result: ResultDelivery['key']['result']
  evidence: ModelSavedReceipt['evidence']
}>

/**
 * The receipt counts as `saved` only for the original key and with an evidence of the frozen
 * consumer owner. The evidence itself is checked again by the commands' evidence adapter.
 */
function acceptReceipt(
  delivery: ModelDelivery,
  receipt: ModelSavedReceipt,
): DeliveryStanding & { status: 'saved' | 'failed' } {
  return isDeepStrictEqual(receipt.key, delivery.key) &&
    receipt.evidence.owner === delivery.consumer.owner
    ? { status: 'saved', receipt: frozen(receipt) }
    : { status: 'failed', failure: { kind: 'receipt-mismatch' } }
}

function savedResultOf(record: ResultPushRecord): SavedResult | null {
  const held = record.result
  if (held === null || held.standing.status !== 'saved') return null
  return { result: held.delivery.key.result, evidence: held.standing.receipt.evidence }
}

/** Whether the decimal revision `next` comes after `known`. */
function laterRevision(next: string, known: string): boolean {
  return BigInt(next) > BigInt(known)
}

/** A failure that leaves the write uncommitted for sure; anything else may have committed. */
function definite(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
}

/** A late account frozen at its acceptance, with the origin of its call. */
type Arrival = Readonly<{
  target: Target
  held: HeldAccount
  origin: NonNullable<ResultPushRecord['origin']>
}>

type StageInput = Readonly<{
  /** The commands of the plugin: the push reads, acknowledges and cleans through them. */
  commands: ModelCommands<unknown>
  /** Gives the trusted principal of a call; the push acts as it. */
  authority: ModelHostAuthority<unknown>
  report(event: RuntimeEvent): void
}>

/** The runtime stage of one plugin instance: made before the provider, started after the bind. */
export type RuntimeStage = Readonly<{
  /** The commands to give the provider: its committed settles and late accounts reach the push. */
  commands: ModelCommands<unknown>
  /**
   * Publishes `modelRuntime` in `child` from the provider's runtime and starts the push. Called once,
   * inside the plugin of the contribution. Without push options it publishes nothing.
   */
  contribute(child: Context, runtime: ModelRuntime<unknown> | undefined): void
  /**
   * Stops the push: refuses new late accounts, aborts the pushes in flight, waits for them and for
   * the late accounts being accepted, writes what arrived into the ledger, and releases the ledger.
   */
  stop(): Promise<void>
}>

/** The `modelRuntime` service: the runtime of the provider and its receiver table. */
class RuntimeContribution extends ModelRuntimeService<unknown> {
  readonly calls: ModelRuntime<unknown>['calls']
  readonly consumption: ModelRuntime<unknown>['consumption']
  readonly instances: ModelRuntime<unknown>['instances']

  constructor(
    ctx: Context,
    runtime: ModelRuntime<unknown>,
    table: ModelResultReceiverTable<unknown>,
  ) {
    super(ctx, table)
    // Cordis hands consumers the instance, so the runtime stays in these closures.
    const calls: ModelRuntime<unknown>['calls'] = {
      admit: input => runtime.calls.admit(input),
      inspect: input => runtime.calls.inspect(input),
      dispatches: input => runtime.calls.dispatches(input),
      cancel: input => runtime.calls.cancel(input),
    }
    const consumption: ModelRuntime<unknown>['consumption'] = {
      beginRead: input => runtime.consumption.beginRead(input),
      readNext: input => runtime.consumption.readNext(input),
      closeRead: input => runtime.consumption.closeRead(input),
      acknowledge: input => runtime.consumption.acknowledge(input),
    }
    const instances: ModelRuntime<unknown>['instances'] = {
      connect: input => runtime.instances.connect(input),
    }
    this.calls = Object.freeze(calls)
    this.consumption = Object.freeze(consumption)
    this.instances = Object.freeze(instances)
  }
}

/**
 * Makes the runtime stage. Without `options` the plugin is a host only: the provider gets the
 * commands as they are, and a provider that brings a runtime is refused.
 */
export function createRuntimeStage(
  input: StageInput,
  options: ResultPushOptions | undefined,
): RuntimeStage {
  if (options === undefined)
    return {
      commands: input.commands,
      contribute(_child, runtime) {
        if (runtime !== undefined)
          throw new TypeError('model host: a runtime facade needs the result push options')
      },
      stop: async () => {},
    }
  return createResultPush(input, options.ledger, checkedLimits(options.limits))
}

function createResultPush(
  input: StageInput,
  ledger: ResultPushLedger,
  limits: ResultPushLimits,
): RuntimeStage {
  const { commands, authority, report } = input
  const dirty = new Map<string, Target>()
  const running = new Map<string, Promise<void>>()
  /** Late accounts accepted and not yet saved: reservation → tenant. */
  const reservations = new Map<string, string>()
  /** Late accounts of one call are accepted one after the other. */
  const intake = new Map<string, Promise<unknown>>()
  /**
   * Late accounts frozen at their acceptance, until the work of their call takes them into the
   * record. The work of a call is the one writer of its record.
   */
  const inbox = new Map<string, Arrival[]>()
  const stopping = new AbortController()
  let phase: 'ready' | 'started' | 'stopped' = 'ready'
  let release: (() => void) | undefined

  function wake(target: Target): void {
    const key = keyOf(target)
    if (key === undefined) return
    dirty.set(key, { tenant: target.tenant, call: target.call })
    pump()
  }

  function pump(): void {
    if (phase !== 'started') return
    for (const [key, target] of dirty) {
      if (running.size >= limits.maxConcurrentCalls) return
      if (running.has(key)) continue
      dirty.delete(key)
      // `work` does not reject, so the chained promise needs no handler of its own.
      const task = work(target).finally(() => {
        running.delete(key)
        pump()
      })
      running.set(key, task)
    }
  }

  function save(record: ResultPushRecord): ResultPushRecord {
    ledger.write(record)
    return record
  }

  function fresh(target: Target): ResultPushRecord {
    return save({
      tenant: target.tenant,
      call: target.call,
      operations: { read: newOperation(), ack: newOperation() },
      origin: null,
      result: null,
      acknowledgement: 'none',
      cleanup: 'pending',
      delivered: {},
      accounts: [],
    })
  }

  async function work(target: Target): Promise<void> {
    try {
      const resolved = await authority.resolve(target)
      if ('failure' in resolved) {
        report({ kind: 'blocked', failure: resolved.failure.kind })
        return
      }
      const access = { principal: resolved.ok.principal, tenant: target.tenant }
      let record = receive(ledger.read(target) ?? fresh(target))
      if (record.origin === null || (record.result === null && record.acknowledgement === 'none'))
        record = await freeze(record, access)
      record = await pushResult(record, access)
      record = await acknowledge(record, access)
      record = await clean(record, access)
      await pushAccounts(record, access)
    } catch {
      report({ kind: 'work-threw' })
    }
  }

  type Access = Readonly<{ principal: unknown; tenant: TenantId }>

  /** Takes the late accounts that arrived for the call into its record. */
  function receive(record: ResultPushRecord): ResultPushRecord {
    const key = keyOf(record)
    const arrived = key === undefined ? undefined : inbox.get(key)
    if (key === undefined || arrived === undefined) return record
    inbox.delete(key)
    let next = record
    for (const { held, origin } of arrived) {
      const { dispatch, revision } = held.delivery.key
      const known = next.delivered[dispatch]
      if (known !== undefined && known !== null && !laterRevision(revision, known)) {
        reservations.delete(held.reservation)
        continue
      }
      next = {
        ...next,
        origin: next.origin ?? origin,
        delivered: { ...next.delivered, [dispatch]: revision },
        accounts: [...next.accounts, held],
      }
    }
    return save(next)
  }

  /** Reads the settled call once and freezes its result delivery. */
  async function freeze(record: ResultPushRecord, access: Access): Promise<ResultPushRecord> {
    const call = { ...access, call: record.call }
    const recovery = await commands.loadRecovery(call)
    if ('failure' in recovery) {
      report({ kind: 'freeze-failed', step: 'recovery' })
      return record
    }
    const { state, admission } = recovery.ok
    if (state.phase !== 'settled') return record
    const reference = encodeModelInvocationRef({
      tenant: record.tenant,
      call: record.call,
      admission,
    })
    if ('failure' in reference) {
      report({ kind: 'freeze-failed', step: 'reference' })
      return record
    }
    const origin = frozen({ reference: reference.ok, consumer: state.consumer })
    if (state.custody.kind === 'acknowledged')
      // Acknowledged before this push froze it: there is no result to push, only later accounts.
      return save({ ...record, origin, acknowledgement: 'acknowledged' })
    const dispatches = await commands.dispatches(call)
    if ('failure' in dispatches) {
      report({ kind: 'freeze-failed', step: 'dispatches' })
      return record
    }
    const parts = await readParts(record, access, state.settlement.version)
    if (parts === 'acknowledged')
      return save({ ...record, origin, acknowledgement: 'acknowledged' })
    if (parts === null) return record
    const delivery = frozen<ResultDelivery>({
      kind: 'result',
      key: { kind: 'result', reference: reference.ok, result: state.settlement.version },
      consumer: state.consumer,
      settlement: state.settlement,
      parts,
      accounts: dispatches.ok.map(item => ({ dispatch: item.dispatch, account: item.account })),
    })
    const delivered: Record<string, string | null> = {}
    for (const item of dispatches.ok) delivered[item.dispatch] = item.account?.revision ?? null
    // A late account that the snapshot already holds is not pushed again on its own.
    const accounts = record.accounts.filter(held => {
      const known = delivered[held.delivery.key.dispatch]
      const later =
        known === undefined || known === null || laterRevision(held.delivery.key.revision, known)
      if (!later) reservations.delete(held.reservation)
      return later
    })
    return save({
      ...record,
      origin,
      result: { delivery, standing: { status: 'pending' }, attempts: 0 },
      delivered: { ...record.delivered, ...delivered },
      accounts,
    })
  }

  /** The ordered parts of the settled result, with the record's read operation. */
  async function readParts(
    record: ResultPushRecord,
    access: Access,
    result: ResultDelivery['key']['result'],
  ): Promise<ResultPart[] | 'acknowledged' | null> {
    const call = { ...access, call: record.call }
    const started = await commands.acquireRead({
      ...call,
      operation: record.operations.read,
      result,
    })
    if ('failure' in started) {
      report({ kind: 'freeze-failed', step: 'read' })
      return null
    }
    if (started.ok.kind === 'acknowledged') return 'acknowledged'
    const { read } = started.ok
    const parts: ResultPart[] = []
    let state = started.ok.value
    for (;;) {
      if (state.kind === 'ended') {
        report({ kind: 'freeze-failed', step: `read-${state.reason}` })
        return null
      }
      parts.push(...state.page.parts)
      if (state.page.next === null) break
      const next = await commands.nextRead({ ...call, read, after: state.page.next })
      if ('failure' in next) {
        report({ kind: 'freeze-failed', step: 'read' })
        return null
      }
      state = next.ok
    }
    const closed = await commands.endRead({ ...call, read })
    if ('failure' in closed) report({ kind: 'freeze-failed', step: 'close-read' })
    return parts
  }

  /**
   * Pushes `held` until it is saved, fails, waits, or stays unknown after the redeliveries, and
   * gives the held delivery with what the pushes came to.
   */
  async function push<D extends ModelDelivery>(
    held: HeldDelivery<D>,
    access: Access,
  ): Promise<HeldDelivery<D>> {
    const { delivery } = held
    let { standing, attempts } = held
    const conclude = (next: DeliveryStanding) => {
      if (replaces(standing, next)) standing = next
    }
    const receiver: ModelResultReceiver<unknown> | null = resolveReceiver(delivery.consumer.owner)
    if (receiver === null) {
      report({ kind: 'no-receiver' })
      conclude({ status: 'waiting', reason: 'no-receiver' })
      return { delivery, standing, attempts }
    }
    for (let redeliveries = 0; ; redeliveries += 1) {
      if (stopping.signal.aborted) break
      attempts += 1
      let outcome: Awaited<ReturnType<ModelResultReceiver<unknown>['push']>>
      try {
        outcome = await receiver.push({ access, delivery, signal: stopping.signal })
      } catch {
        // A receiver that throws may have saved: the outcome is unknown.
        outcome = { failure: { kind: 'outcome-unknown' } }
      }
      if ('ok' in outcome) {
        const accepted = acceptReceipt(delivery, outcome.ok)
        if (accepted.status === 'failed')
          report({ kind: 'push-failed', failure: 'receipt-mismatch' })
        conclude(accepted)
        break
      }
      const { failure } = outcome
      if (failure.kind === 'outcome-unknown') {
        conclude({ status: 'unknown' })
        if (redeliveries >= limits.maxRedeliveries) {
          report({ kind: 'push-unknown' })
          break
        }
        continue
      }
      if (
        failure.kind === 'unavailable' ||
        failure.kind === 'backpressured' ||
        failure.kind === 'cancelled-before-accept'
      ) {
        report({ kind: 'push-waiting', reason: failure.kind })
        conclude({ status: 'waiting', reason: failure.kind })
      } else {
        report({ kind: 'push-failed', failure: 'rejected' })
        conclude({ status: 'failed', failure: { kind: 'rejected', failure } })
      }
      break
    }
    return { delivery, standing, attempts }
  }

  let resolveReceiver: (owner: string) => ModelResultReceiver<unknown> | null = () => null

  function due(held: HeldDelivery): boolean {
    const { status } = held.standing
    return status === 'pending' || status === 'waiting' || status === 'unknown'
  }

  async function pushResult(record: ResultPushRecord, access: Access): Promise<ResultPushRecord> {
    const held = record.result
    if (held === null || record.acknowledgement === 'acknowledged' || !due(held)) return record
    return save({ ...record, result: await push(held, access) })
  }

  /** The Model's own ACK: only for a saved result, with its evidence, through the retained handoff. */
  async function acknowledge(record: ResultPushRecord, access: Access): Promise<ResultPushRecord> {
    if (record.acknowledgement === 'acknowledged') return record
    const saved = savedResultOf(record)
    if (saved === null) return record
    return save({ ...record, acknowledgement: await handoff(record, access, saved) })
  }

  async function handoff(
    record: ResultPushRecord,
    access: Access,
    saved: SavedResult,
  ): Promise<ResultPushRecord['acknowledgement']> {
    // The same operation and the same input on every resend: an unknown ACK is recognised, not repeated.
    const ack = {
      ...access,
      call: record.call,
      operation: record.operations.ack,
      result: saved.result,
      evidence: { kind: 'retained', custody: saved.evidence },
    } as const
    for (let resends = 0; ; resends += 1) {
      const reply = await commands.handoff(ack)
      if ('ok' in reply) return 'acknowledged'
      if (reply.failure.kind !== 'commit-unknown') {
        report({ kind: 'ack-failed', failure: reply.failure.kind })
        return record.acknowledgement
      }
      if (resends >= limits.maxRedeliveries || stopping.signal.aborted) {
        report({ kind: 'ack-failed', failure: 'commit-unknown' })
        return 'unknown'
      }
    }
  }

  /** Moves the cleanup of an acknowledged call on. A failure keeps the ACK and tries again later. */
  async function clean(record: ResultPushRecord, access: Access): Promise<ResultPushRecord> {
    if (record.acknowledgement !== 'acknowledged' || record.cleanup === 'released') return record
    const execution = await cleanupExecution(record, access)
    if (execution === null) return record
    if (execution === 'released' || (await advanceCleanup(execution)))
      return save(dropBody({ ...record, cleanup: 'released' }))
    return record
  }

  /**
   * The execution whose cleanup is still to do, `released` when it is done, or null when the
   * cleanup cannot go on now (reported).
   */
  async function cleanupExecution(
    record: ResultPushRecord,
    access: Access,
  ): Promise<ExecutionRef | 'released' | null> {
    const recovery = await commands.loadRecovery({ ...access, call: record.call })
    if ('failure' in recovery) {
      const { failure } = recovery
      if (failure.kind === 'invalid' && failure.reason === 'recovery-material-released')
        return 'released'
      report({ kind: 'cleanup-pending', reason: failure.kind })
      return null
    }
    const { execution, state } = recovery.ok
    if (state.custody.kind === 'acknowledged' && state.custody.cleanup === 'released')
      return 'released'
    if (execution === null) report({ kind: 'cleanup-pending', reason: 'no-execution' })
    return execution
  }

  /** At most `maxCleanupSteps` cleanup steps; true once the cleanup is released. */
  async function advanceCleanup(execution: ExecutionRef): Promise<boolean> {
    for (let step = 0; step < limits.maxCleanupSteps; step += 1) {
      const advanced = await commands.advanceCleanup({ ...execution, operation: newOperation() })
      if ('failure' in advanced) {
        report({ kind: 'cleanup-pending', reason: advanced.failure.kind })
        return false
      }
      if (advanced.ok.kind !== 'acknowledged') continue
      if (advanced.ok.cleanup === 'released') return true
      if (advanced.ok.cleanup === 'blocked') {
        report({ kind: 'cleanup-pending', reason: 'blocked' })
        return false
      }
    }
    report({ kind: 'cleanup-pending', reason: 'steps' })
    return false
  }

  /** After the ACK the receiver holds the result: the producer keeps its key and standing only. */
  function dropBody(record: ResultPushRecord): ResultPushRecord {
    const held = record.result
    if (held === null) return record
    return {
      ...record,
      result: { ...held, delivery: frozen({ ...held.delivery, parts: [], accounts: [] }) },
    }
  }

  /** Pushes the held late accounts in order, once the result is saved or was acknowledged. */
  async function pushAccounts(record: ResultPushRecord, access: Access): Promise<void> {
    const resultDone = record.acknowledgement === 'acknowledged' || savedResultOf(record) !== null
    if (!resultDone || record.origin === null) return
    let current = record
    for (const [index, held] of current.accounts.entries()) {
      if (!due(held)) {
        if (held.standing.status === 'saved') reservations.delete(held.reservation)
        continue
      }
      const pushed = await push(held, access)
      const accounts = current.accounts.with(index, { ...pushed, reservation: held.reservation })
      current = save({ ...current, accounts })
      if (pushed.standing.status !== 'saved') return
      reservations.delete(held.reservation)
    }
  }

  function pendingOf(tenant: string): number {
    let count = 0
    for (const owner of reservations.values()) if (owner === tenant) count += 1
    return count
  }

  /** Refuses a late account before the commands see it; the source keeps its report. */
  function refuse(
    diagnostic: string,
  ): Awaited<ReturnType<ModelCommands<unknown>['recordLateFact']>> {
    return { failure: { kind: 'unavailable', dependency: DEPENDENCY, diagnostic } }
  }

  /**
   * Reserves a place for a late account before the commands accept it, and freezes its delivery
   * right after. A full bound refuses the account; the source keeps its report. A stopped stage
   * refuses every account: nothing would hold it after the ledger is released.
   */
  async function recordLateFact(
    late: Parameters<ModelCommands<unknown>['recordLateFact']>[0],
  ): ReturnType<ModelCommands<unknown>['recordLateFact']> {
    if (late.fact.kind !== 'account') return commands.recordLateFact(late)
    if (phase === 'stopped') return refuse('result-push-stopped')
    const target = { tenant: late.tenant, call: late.call }
    const callKey = keyOf(target)
    const tenantText = tenantCodec.encode(late.tenant)
    if (callKey === undefined || !tenantText.ok) return commands.recordLateFact(late)
    const reservation = JSON.stringify([tenantText.value, late.operation])
    if (!reservations.has(reservation)) {
      const pending = pendingOf(tenantText.value)
      if (
        pending >= limits.maxPendingAccountsPerTenant ||
        reservations.size >= limits.maxPendingAccounts
      ) {
        report({ kind: 'late-account-refused', pending })
        return refuse('late-account-capacity')
      }
      reservations.set(reservation, tenantText.value)
    }
    // The accounts of one call are accepted and frozen one after the other, so a revision that is
    // read right after its commit is the revision that this commit made.
    const previous = intake.get(callKey) ?? Promise.resolve()
    const accepted = previous.then(() => accept(late, target, reservation))
    const settled = accepted.catch(() => undefined)
    intake.set(callKey, settled)
    void settled.finally(() => {
      if (intake.get(callKey) === settled) intake.delete(callKey)
    })
    return accepted
  }

  async function accept(
    late: Parameters<ModelCommands<unknown>['recordLateFact']>[0],
    target: Target,
    reservation: string,
  ): ReturnType<ModelCommands<unknown>['recordLateFact']> {
    const result = await commands.recordLateFact(late)
    if ('failure' in result) {
      if (definite(result.failure)) reservations.delete(reservation)
      return result
    }
    if (late.fact.kind !== 'account') return result
    const held = await hold(target, late.dispatch, late.fact.value.revision, reservation)
    if (!held) reservations.delete(reservation)
    wake(target)
    return result
  }

  /**
   * Freezes the account delivery of the revision that was just accepted and leaves it for the work
   * of its call; false when none is due.
   */
  async function hold(
    target: Target,
    dispatch: DispatchId,
    revision: string,
    reservation: string,
  ): Promise<boolean> {
    const key = keyOf(target)
    if (key === undefined) return false
    const record = ledger.read(target)
    const arrived = inbox.get(key) ?? []
    if (
      record?.accounts.some(item => item.reservation === reservation) === true ||
      arrived.some(item => item.held.reservation === reservation)
    )
      return true
    const known = record?.delivered[dispatch]
    if (known !== undefined && known !== null && !laterRevision(revision, known)) return false
    const resolved = await authority.resolve(target)
    if ('failure' in resolved) {
      report({ kind: 'blocked', failure: resolved.failure.kind })
      return false
    }
    const records = await commands.dispatches({ ...target, principal: resolved.ok.principal })
    if ('failure' in records) {
      report({ kind: 'freeze-failed', step: 'late-account' })
      return false
    }
    const account = records.ok.find(item => item.dispatch === dispatch)?.account ?? null
    if (account === null || account.revision !== revision) {
      report({ kind: 'freeze-failed', step: 'late-account' })
      return false
    }
    const origin = ledger.read(target)?.origin ?? (await originOf(target, resolved.ok.principal))
    if (origin === null) return false
    const delivery = frozen<AccountDelivery>({
      kind: 'account',
      key: { kind: 'account', reference: origin.reference, dispatch, revision },
      consumer: origin.consumer,
      account,
    })
    const held: HeldAccount = {
      delivery,
      standing: { status: 'pending' },
      attempts: 0,
      reservation,
    }
    inbox.set(key, [...(inbox.get(key) ?? []), { target, held, origin }])
    return true
  }

  async function originOf(target: Target, principal: unknown): Promise<ResultPushRecord['origin']> {
    const recovery = await commands.loadRecovery({ ...target, principal })
    if ('failure' in recovery) {
      report({ kind: 'freeze-failed', step: 'late-account-origin' })
      return null
    }
    const reference = encodeModelInvocationRef({ ...target, admission: recovery.ok.admission })
    if ('failure' in reference) return null
    return frozen({ reference: reference.ok, consumer: recovery.ok.state.consumer })
  }

  const wrapped: ModelCommands<unknown> = {
    ...delegatedCommands(commands),
    async settle(settle) {
      const result = await commands.settle(settle)
      if ('ok' in result) wake({ tenant: settle.tenant, call: settle.call })
      return result
    },
    recordLateFact,
  }

  /** Every record that still waits for a push, an ACK, a cleanup or an account. */
  function unfinished(record: ResultPushRecord): boolean {
    return (
      record.acknowledgement !== 'acknowledged' ||
      record.cleanup !== 'released' ||
      record.accounts.some(due)
    )
  }

  function receiverAppeared(owner: string): void {
    for (const record of ledger.records())
      if (unfinished(record) && (record.origin === null || record.origin.consumer.owner === owner))
        wake(record)
  }

  return {
    commands: wrapped,
    contribute(child, runtime) {
      if (runtime === undefined)
        throw new TypeError('model host: the result push options need a runtime facade')
      const inner = createModelResultReceiverTable<unknown>()
      const table: ModelResultReceiverTable<unknown> = {
        register(ctx, owner, receiver) {
          const removal = inner.register(ctx, owner, receiver)
          receiverAppeared(owner)
          return removal
        },
        resolve: owner => inner.resolve(owner),
      }
      resolveReceiver = owner => table.resolve(owner)
      release = ledger.claim()
      new RuntimeContribution(child, runtime, table)
      phase = 'started'
      // What a predecessor left in the ledger goes on here, with its original keys and payloads.
      for (const record of ledger.records()) if (unfinished(record)) wake(record)
      pump()
    },
    async stop() {
      if (phase === 'stopped') return
      phase = 'stopped'
      stopping.abort()
      dirty.clear()
      await Promise.allSettled(running.values())
      // An account that was accepted before the stop is frozen into the inbox by its intake. No
      // intake starts after the stop, so these are the last ones.
      await Promise.allSettled(intake.values())
      // What arrived and was not yet taken in stays owed: the successor finds it in the ledger.
      // Deleting the entry in hand while a Map is iterated is safe.
      for (const [first] of inbox.values())
        if (first !== undefined) receive(ledger.read(first.target) ?? fresh(first.target))
      release?.()
      release = undefined
    },
  }
}

/**
 * Every method of `commands`, called on it. A Service may keep its methods on its prototype, so the
 * object is not spread.
 */
function delegatedCommands(commands: ModelCommands<unknown>): ModelCommands<unknown> {
  return {
    admit: input => commands.admit(input),
    recall: input => commands.recall(input),
    scanPending: input => commands.scanPending(input),
    loadRecovery: input => commands.loadRecovery(input),
    claim: input => commands.claim(input),
    prepareDispatch: input => commands.prepareDispatch(input),
    recordMaterialization: input => commands.recordMaterialization(input),
    recordSend: input => commands.recordSend(input),
    openReceiveWindow: input => commands.openReceiveWindow(input),
    preserve: input => commands.preserve(input),
    recordLateFact: input => commands.recordLateFact(input),
    prepareRetry: input => commands.prepareRetry(input),
    decideRetry: input => commands.decideRetry(input),
    settle: input => commands.settle(input),
    control: input => commands.control(input),
    acquireRead: input => commands.acquireRead(input),
    nextRead: input => commands.nextRead(input),
    endRead: input => commands.endRead(input),
    handoff: input => commands.handoff(input),
    advanceCleanup: input => commands.advanceCleanup(input),
    query: input => commands.query(input),
    dispatches: input => commands.dispatches(input),
  }
}

/** Logs a runtime event as the host logs its own: kinds and counts only. */
export function reportRuntimeEvent(ctx: Context, event: RuntimeEvent): void {
  switch (event.kind) {
    case 'no-receiver':
      ctx.logger.info('model result push: no receiver is registered for the consumer owner')
      return
    case 'push-waiting':
      ctx.logger.info(`model result push: a delivery waits (${event.reason})`)
      return
    case 'push-unknown':
      ctx.logger.warn('model result push: a delivery stays unknown after its redeliveries')
      return
    case 'push-failed':
      ctx.logger.warn(`model result push: a delivery failed (${event.failure})`)
      return
    case 'freeze-failed':
      ctx.logger.warn(`model result push: a delivery could not be frozen (${event.step})`)
      return
    case 'ack-failed':
      ctx.logger.warn(`model result push: the acknowledgement did not complete (${event.failure})`)
      return
    case 'cleanup-pending':
      ctx.logger.warn(`model result push: the cleanup stays pending (${event.reason})`)
      return
    case 'late-account-refused':
      ctx.logger.warn(
        `model result push: a late account was refused, ${event.pending} accounts of the tenant are pending`,
      )
      return
    case 'blocked':
      ctx.logger.warn(`model result push: no trusted principal for a call (${event.failure})`)
      return
    case 'work-threw':
      ctx.logger.warn('model result push: the work of a call threw')
      return
  }
}
