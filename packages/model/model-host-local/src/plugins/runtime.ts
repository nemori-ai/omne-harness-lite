import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelOperationId,
  encodeModelInvocationRef,
  type Access,
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
  type Reply,
  type ResultPart,
} from '@omne-harness/model-contract'
import type {
  ExecutionRef,
  ModelClock,
  ModelCommands,
  ModelHostAuthority,
} from '@omne-harness/model-contract/provider'
import {
  ModelRuntimeService,
  createModelResultReceiverTable,
  type ModelResultReceiverTable,
} from '@omne-harness/model-cordis-contract/cordis'
import { delegatedCommands } from './delegated-commands.ts'
import { awaitsReceiver, definite, laterRevision } from './push-values.ts'
import { whenEmpty } from './idle.ts'

const DEPENDENCY = 'model-result-push'

function recoveryPauseMs(failures: number): number {
  if (failures === 0) return 1000
  return failures === 1 ? 5000 : 30000
}

type Scan<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'again' | 'given-up' }>

type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>
type ResultDelivery = Extract<ModelDelivery, { kind: 'result' }>
type AccountDelivery = Extract<ModelDelivery, { kind: 'account' }>

export type DeliveryFailure =
  | Readonly<{ kind: 'rejected'; failure: ModelDeliveryFailure }>
  | Readonly<{ kind: 'receipt-mismatch' }>

export type DeliveryStanding =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'waiting'; reason: string }>
  | Readonly<{ status: 'saved'; receipt: ModelSavedReceipt }>
  | Readonly<{ status: 'unknown' }>
  | Readonly<{ status: 'failed'; failure: DeliveryFailure }>

export type HeldDelivery<D extends ModelDelivery = ModelDelivery> = Readonly<{
  delivery: D
  standing: DeliveryStanding
  attempts: number
}>

export type HeldAccount = HeldDelivery<AccountDelivery> & Readonly<{ reservation: string }>

export type ResultPushRecord = Readonly<{
  tenant: TenantId
  call: ModelCallId
  operations: Readonly<{ read: ModelOperationId; ack: ModelOperationId }>
  origin: Readonly<{ reference: ModelInvocationRef; consumer: ConsumerRef }> | null
  result: HeldDelivery<ResultDelivery> | null
  acknowledgement: 'none' | 'unknown' | 'acknowledged'
  cleanup: 'pending' | 'released'
  delivered: Readonly<Record<string, string | null>>
  accounts: readonly HeldAccount[]
}>

export interface ResultPushLedger {
  claim(): () => void
  read(target: Target): ResultPushRecord | undefined
  write(record: ResultPushRecord): void
  records(): readonly ResultPushRecord[]
}

function keyOf(target: Target): string | undefined {
  const text = tenantCodec.encode(target.tenant)
  return text.ok ? JSON.stringify([text.value, target.call]) : undefined
}

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

export type ResultPushLimits = Readonly<{
  maxConcurrentCalls: number
  maxRedeliveries: number
  maxCleanupSteps: number
  maxPendingAccountsPerTenant: number
  maxPendingAccounts: number
}>

export type ResultPushRecovery = Readonly<{
  scopes(): Reply<readonly Access<unknown>[]>
}>

export type ResultPushOptions = Readonly<{
  ledger: ResultPushLedger
  limits: ResultPushLimits
  recovery?: ResultPushRecovery
}>

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
  | Readonly<{
      kind: 'recovery-failed'
      step: 'scopes' | 'scan' | 'load' | 'wait'
      failure: string
      again: boolean
    }>
  | Readonly<{ kind: 'recovered'; woken: number }>

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

function replaces(standing: DeliveryStanding, next: DeliveryStanding): boolean {
  if (standing.status === 'saved') return false
  if (standing.status === 'unknown') return next.status === 'saved'
  return true
}

type SavedResult = Readonly<{
  result: ResultDelivery['key']['result']
  evidence: ModelSavedReceipt['evidence']
}>

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

function dropBody(record: ResultPushRecord): ResultPushRecord {
  const held = record.result
  if (held === null) return record
  return {
    ...record,
    result: { ...held, delivery: frozen({ ...held.delivery, parts: [], accounts: [] }) },
  }
}

function refuse(diagnostic: string): Awaited<ReturnType<ModelCommands<unknown>['recordLateFact']>> {
  return { failure: { kind: 'unavailable', dependency: DEPENDENCY, diagnostic } }
}

type Arrival = Readonly<{
  target: Target
  held: HeldAccount
  origin: NonNullable<ResultPushRecord['origin']>
}>

type StageInput = Readonly<{
  commands: ModelCommands<unknown>
  authority: ModelHostAuthority<unknown>
  scanBatchSize: number
  clock: ModelClock
  report(event: RuntimeEvent): void
  released?(target: Readonly<{ tenant: TenantId; call: ModelCallId }>): void
}>

export type RuntimeStage = Readonly<{
  commands: ModelCommands<unknown>
  contribute(child: Context, runtime: ModelRuntime<unknown> | undefined): void
  stop(): Promise<void>
  idle(signal: AbortSignal): Promise<number>
  delivering(target: Target): boolean
}>

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
    const calls: ModelRuntime<unknown>['calls'] = {
      admit: input => runtime.calls.admit(input),
      inspect: input => runtime.calls.inspect(input),
      contact: input => runtime.calls.contact(input),
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
      idle: async () => 0,
      stop: async () => {},
      delivering: () => false,
    }
  return createResultPush(input, options.ledger, checkedLimits(options.limits), options.recovery)
}

function createResultPush(
  input: StageInput,
  ledger: ResultPushLedger,
  limits: ResultPushLimits,
  recovery: ResultPushRecovery | undefined,
): RuntimeStage {
  const { commands, authority, clock, report } = input
  const dirty = new Map<string, Target>()
  const running = new Map<string, Promise<void>>()
  const reservations = new Map<string, string>()
  const intake = new Map<string, Promise<unknown>>()
  const inbox = new Map<string, Arrival[]>()
  const stopping = new AbortController()
  let phase: 'ready' | 'started' | 'stopped' = 'ready'
  let release: (() => void) | undefined
  let scanning: Promise<void> = Promise.resolve()

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

  async function clean(record: ResultPushRecord, access: Access): Promise<ResultPushRecord> {
    if (record.acknowledgement !== 'acknowledged' || record.cleanup === 'released') return record
    const execution = await cleanupExecution(record, access)
    if (execution === null) return record
    if (execution === 'released' || (await advanceCleanup(execution))) {
      const released = save(dropBody({ ...record, cleanup: 'released' }))
      input.released?.({ tenant: record.tenant, call: record.call })
      return released
    }
    return record
  }

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

  async function recover(source: ResultPushRecovery): Promise<void> {
    const scopes = await persistently(() => listScopes(source))
    if (scopes === null) return
    const again: Promise<void>[] = []
    let woken = 0
    for (const scope of scopes) {
      const scan = await scanTenant(scope)
      if (scan.kind === 'read') woken += scan.value
      if (scan.kind === 'again') again.push(scanAgain(scope))
    }
    report({ kind: 'recovered', woken })
    await Promise.all(again)
  }

  async function scanAgain(scope: Access): Promise<void> {
    const woken = await readAgain(() => scanTenant(scope))
    if (woken !== null) report({ kind: 'recovered', woken })
  }

  async function persistently<T>(read: () => Promise<Scan<T>>): Promise<T | null> {
    const scan = await read()
    if (scan.kind === 'read') return scan.value
    return scan.kind === 'again' ? readAgain(read) : null
  }

  async function readAgain<T>(read: () => Promise<Scan<T>>): Promise<T | null> {
    for (let failures = 0; ; failures += 1) {
      if (!(await paused(recoveryPauseMs(failures)))) return null
      const scan = await read()
      if (scan.kind === 'read') return scan.value
      if (scan.kind === 'given-up') return null
    }
  }

  async function paused(ms: number): Promise<boolean> {
    try {
      const instant = new Date(Date.parse(clock.now()) + ms).toISOString()
      return (await clock.waitUntil(instant, stopping.signal)) === 'elapsed'
    } catch {
      report({ kind: 'recovery-failed', step: 'wait', failure: 'threw', again: false })
      return false
    }
  }

  function failed(
    step: 'scopes' | 'scan' | 'load',
    failure: ModelFailure | 'threw',
  ): 'again' | 'given-up' {
    const again = failure === 'threw' || failure.kind === 'unavailable'
    report({
      kind: 'recovery-failed',
      step,
      failure: failure === 'threw' ? failure : failure.kind,
      again,
    })
    return again ? 'again' : 'given-up'
  }

  async function listScopes(source: ResultPushRecovery): Promise<Scan<readonly Access[]>> {
    try {
      const scopes = await source.scopes()
      if ('ok' in scopes) return { kind: 'read', value: scopes.ok }
      return { kind: failed('scopes', scopes.failure) }
    } catch {
      return { kind: failed('scopes', 'threw') }
    }
  }

  async function scanTenant(scope: Access): Promise<Scan<number>> {
    let woken = 0
    let again = false
    let after: string | null = null
    try {
      do {
        if (stopping.signal.aborted) break
        const page = await commands.scanPending({ ...scope, after, limit: input.scanBatchSize })
        if ('failure' in page) return { kind: failed('scan', page.failure) }
        for (const call of page.ok.calls) {
          const owed = await wakeIfOwed(scope, call)
          if (owed === 'woken') woken += 1
          if (owed === 'again') again = true
        }
        after = page.ok.next
      } while (after !== null)
    } catch {
      return { kind: failed('scan', 'threw') }
    }
    return again ? { kind: 'again' } : { kind: 'read', value: woken }
  }

  async function wakeIfOwed(
    scope: Access,
    call: ModelCallId,
  ): Promise<'woken' | 'skipped' | 'again'> {
    if (stopping.signal.aborted) return 'skipped'
    const loaded = await commands.loadRecovery({ ...scope, call })
    if ('failure' in loaded) {
      const { failure } = loaded
      if (failure.kind === 'invalid' && failure.reason === 'recovery-material-released')
        return 'skipped'
      return failed('load', failure) === 'again' ? 'again' : 'skipped'
    }
    const { state } = loaded.ok
    if (state.phase !== 'settled') return 'skipped'
    wake({ tenant: scope.tenant, call })
    return 'woken'
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
      for (const record of ledger.records()) if (unfinished(record)) wake(record)
      pump()
      if (recovery !== undefined) scanning = recover(recovery)
    },
    idle: signal => whenEmpty(running, signal),
    delivering(target) {
      const key = keyOf(target)
      if (phase !== 'started' || key === undefined) return false
      if (dirty.has(key) || running.has(key)) return true
      return awaitsReceiver(ledger.read(target), owner => resolveReceiver(owner))
    },
    async stop() {
      if (phase === 'stopped') return
      phase = 'stopped'
      stopping.abort()
      await scanning
      dirty.clear()
      await Promise.allSettled(running.values())
      // An account that was accepted before the stop is frozen into the inbox by its intake. No
      // intake starts after the stop, so these are the last ones.
      await Promise.allSettled(intake.values())
      for (const [first] of inbox.values())
        if (first !== undefined) receive(ledger.read(first.target) ?? fresh(first.target))
      release?.()
      release = undefined
    },
  }
}

export function reportRuntimeEvent(ctx: Context, event: RuntimeEvent): void {
  switch (event.kind) {
    case 'no-receiver':
      ctx.logger.warn('model result push: no receiver is registered for the consumer owner')
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
    case 'recovery-failed':
      ctx.logger.warn(
        `model result push: the start scan stopped at ${event.step} (${event.failure}); ${
          event.again ? 'it is scanned again after a pause' : 'the rest waits for the next start'
        }`,
      )
      return
    case 'recovered':
      ctx.logger.info(`model result push: the start scan woke ${event.woken} owed calls`)
      return
  }
}
