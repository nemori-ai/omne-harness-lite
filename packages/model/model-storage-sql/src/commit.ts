// The `ModelCommandStorage` of the shared commands core over the SQL storage, and the `model`
// participant that it commits to. One run reads its scope (`model.call`), runs the core's
// synchronous work on that read, and sends the one write that the work staged as one fact
// command. The participant writes it only if `row_version` is still the version the work read
// (CAS); otherwise the commit rolls back and the run reads again in the next attempt generation.
// The default export is the participant module.
import type {
  ModelCallId,
  ModelFailure,
  ModelOperationId,
  ResultCapacity,
  VisibleBlock,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CommitResultV2,
  DomainRef,
  JsonValue,
  ReceiptV2,
  SqlIdentity,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import {
  comparePartKeys,
  encodeCallRow,
  encodeDispatchRow,
  encodeOperationRow,
  encodePartRow,
  nextVersion,
  parseRow,
  sameStored,
  type Binding,
  type CallDocument,
  type CallRead,
  type CommandWrite,
  type DispatchDocument,
  type ModelCommandStorage,
  type ModelRunScope,
  type Row,
  type RowFailure,
  type StoredPart,
  type TenantDocuments,
} from './documents.ts'
import {
  CALL_READ_MAX_OUTPUT_BYTES,
  domainOf,
  readCall,
  readPending,
  unavailable,
  type CallReadInput,
  type PendingPage,
} from './reads.ts'
import { MODEL_PARTICIPANT, PROTOCOL, TABLES, type Table } from './schema.ts'

/** Bytes of one commit request beside the call material: identity, combination, row heads (N1). */
export const COMMAND_RESERVE_BYTES = 64 * 1024
/** Bytes of one `model.call` output beside the call material: row keys, heads, capacity (N1). */
export const READ_RESERVE_BYTES = 64 * 1024
/** A block with this many `append` parts is folded into one part in the same commit (N2). */
export const PART_MERGE_THRESHOLD = 64
export const DEFAULT_ATTEMPT_LIMIT = 8
/** Operations whose commit outcome is not known, kept in the process (N5). */
export const DEFAULT_UNRESOLVED_LIMIT = 1024
const MAX_ATTEMPT_LIMIT = 64

export type ModelStorageLimits = Readonly<{
  /** The share of one tenant: the sum over its calls whose request material is held. */
  tenantCapacity: ResultCapacity
  /** The largest call material that one call may hold. */
  maxCallBytes: number
  /** The `maxCommandBytes` of the storage provider. */
  maxCommandBytes: number
}>

export type SqlModelStorageOptions = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  /** The combination the application registered for the tenant scope (session log and Model). */
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  limits: ModelStorageLimits
  /** Whether a call has recovery work. The rule belongs to the shared core; the storage keeps it. */
  isPending: (call: CallDocument) => boolean
  /** Attempt generations of one operation. Default 8. */
  attemptLimit?: number
  /** Operations with an unknown commit outcome that the process keeps. Default 1024. */
  unresolvedLimit?: number
}>

export type SqlModelStorage = ModelCommandStorage &
  Readonly<{
    limits: ModelStorageLimits
    /** One `snapshot` read of a call, outside a run. */
    readCall(input: CallReadInput): Promise<Outcome<CallRead, ModelFailure>>
    readPending(
      input: Readonly<{ tenant: string; after: ModelCallId | null; limit: number }>,
    ): Promise<Outcome<PendingPage, ModelFailure>>
  }>

// --- Construction --------------------------------------------------------------------------

const DECIMAL = /^(0|[1-9][0-9]*)$/
const DIGEST = /^[0-9a-f]{64}$/

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} is not a positive safe integer`)
}

/** The construction checks: the limits fit each other (N1) and the combination is named. */
function checkOptions(options: SqlModelStorageOptions): Readonly<{
  attempts: number
  unresolved: number
}> {
  const { limits, combination } = options
  positive(limits.maxCallBytes, 'maxCallBytes')
  positive(limits.maxCommandBytes, 'maxCommandBytes')
  if (limits.maxCallBytes + COMMAND_RESERVE_BYTES > limits.maxCommandBytes)
    throw new RangeError('maxCallBytes plus the command reserve exceeds maxCommandBytes')
  if (limits.maxCallBytes + READ_RESERVE_BYTES > CALL_READ_MAX_OUTPUT_BYTES)
    throw new RangeError('maxCallBytes plus the read reserve exceeds the model.call output bound')
  for (const key of ['bytes', 'blocks', 'attachmentBytes'] as const)
    if (!DECIMAL.test(limits.tenantCapacity[key]))
      throw new RangeError(`tenantCapacity.${key} is not a decimal`)
  if (typeof combination.combinationVersion !== 'string' || combination.combinationVersion === '')
    throw new TypeError('combinationVersion is empty')
  if (!DIGEST.test(combination.manifestDigest))
    throw new TypeError('manifestDigest is not a lowercase SHA-256')
  const attempts = options.attemptLimit ?? DEFAULT_ATTEMPT_LIMIT
  positive(attempts, 'attemptLimit')
  if (attempts > MAX_ATTEMPT_LIMIT) throw new RangeError('attemptLimit is above 64')
  const unresolved = options.unresolvedLimit ?? DEFAULT_UNRESOLVED_LIMIT
  positive(unresolved, 'unresolvedLimit')
  return { attempts, unresolved }
}

// --- One attempt ---------------------------------------------------------------------------

/** A call of the port that the scope of the current run does not cover. Never a silent answer. */
class ScopeError extends Error {}

type Staged =
  | Readonly<{ kind: 'commit'; write: CommandWrite; expected: number | null }>
  | Readonly<{ kind: 'publish'; call: CallDocument; expected: number }>

/**
 * The synchronous face of one attempt. It answers from the read of this attempt and stages one
 * write; nothing reaches the storage until the run commits it.
 */
class Attempt {
  staged: Staged | null = null
  private readonly scope: ModelRunScope
  private readonly read: CallRead
  private readonly view: TenantDocuments

  constructor(
    scope: ModelRunScope,
    read: CallRead,
    unresolved: ReadonlyMap<ModelOperationId, Binding>,
  ) {
    this.scope = scope
    this.read = read
    const operations = new Map(unresolved)
    if (read.binding !== null) {
      const { operation, ...base } = read.binding
      operations.set(operation, { ...base, status: 'committed' })
    }
    const calls = new Map<ModelCallId, CallDocument>()
    if (read.record !== undefined) calls.set(scope.call, read.record.document)
    this.view = { calls, operations }
  }

  private check(tenant: string): void {
    if (tenant !== this.scope.tenant) throw new ScopeError('another tenant than the run scope')
  }

  documents(tenant: string): TenantDocuments {
    this.check(tenant)
    return this.view
  }

  reserved(field: keyof ResultCapacity): bigint {
    return BigInt(this.read.capacity[field])
  }

  private stage(staged: Staged, call: ModelCallId): void {
    if (this.staged !== null) throw new ScopeError('a second write in one attempt')
    if (call !== this.scope.call) throw new ScopeError('another call than the run scope')
    this.staged = staged
  }

  private versionOf(expected: CallDocument): number {
    const record = this.read.record
    if (record === undefined || expected !== record.document)
      throw new ScopeError('the expected document is not the one this attempt read')
    return record.version
  }

  commit(tenant: string, write: CommandWrite): 'committed' {
    this.check(tenant)
    if (this.scope.operation !== undefined && write.operation !== this.scope.operation)
      throw new ScopeError('another operation than the run scope')
    if (write.call === undefined && write.expected !== undefined)
      throw new ScopeError('a write cannot remove a call')
    if (write.call !== undefined && write.call.state.call !== write.binding.call)
      throw new ScopeError('the binding names another call')
    const expected = write.expected === undefined ? null : this.versionOf(write.expected)
    this.stage({ kind: 'commit', write, expected }, write.binding.call)
    return 'committed'
  }

  publish(tenant: string, call: CallDocument): void {
    this.check(tenant)
    const record = this.read.record
    if (record === undefined) throw new ScopeError('publish of a call this attempt did not read')
    this.stage({ kind: 'publish', call, expected: record.version }, call.state.call)
  }
}

// --- From documents to rows ----------------------------------------------------------------

export type PartPlan = Readonly<{ remove: readonly StoredPart[]; insert: readonly StoredPart[] }>

/** Whether `next` grows from `prior` by the pieces that parts can add. */
function grows(prior: VisibleBlock, next: VisibleBlock | undefined): boolean {
  if (next === undefined) return false
  if (sameStored(prior, next)) return true
  if (prior.kind !== 'growing' || prior.index !== next.index) return false
  if (next.kind === 'sealed') return true
  return (
    prior.mode === next.mode &&
    prior.content === next.content &&
    (next.mode === 'replace' || next.value.startsWith(prior.value))
  )
}

function fresh(seq: number, position: number, value: VisibleBlock): StoredPart[] {
  if (value.kind === 'sealed')
    return [{ seq, position, part: 0, kind: 'seal', index: value.index, block: value.block }]
  const open: StoredPart = {
    seq,
    position,
    part: 0,
    kind: 'open',
    index: value.index,
    mode: value.mode,
    content: value.content,
  }
  if (value.value === '') return [open]
  return [
    open,
    value.mode === 'append'
      ? { seq, position, part: 1, kind: 'append', delta: value.value }
      : { seq, position, part: 1, kind: 'replace', value: value.value },
  ]
}

/** The parts that turn block `prior` at `position` into `next`; `rows` are its stored parts. */
function step(
  seq: number,
  position: number,
  rows: readonly StoredPart[],
  prior: VisibleBlock | undefined,
  next: VisibleBlock,
): PartPlan {
  if (prior === undefined) return { remove: [], insert: fresh(seq, position, next) }
  if (sameStored(prior, next)) return { remove: [], insert: [] }
  const part = rows.reduce((last, row) => Math.max(last, row.part + 1), 0)
  if (next.kind === 'sealed')
    return {
      remove: rows,
      insert: [{ seq, position, part, kind: 'seal', index: next.index, block: next.block }],
    }
  if (next.mode === 'append' && prior.kind === 'growing')
    return {
      remove: [],
      insert: [
        {
          seq,
          position,
          part,
          kind: 'append',
          delta: next.value.slice(prior.value.length),
        },
      ],
    }
  return {
    remove: rows.filter(row => row.kind === 'replace'),
    insert: [{ seq, position, part, kind: 'replace', value: next.value }],
  }
}

/** Folds the `append` parts of a block into one part when they reach the threshold (N2). */
function bound(stored: readonly StoredPart[], plan: PartPlan): PartPlan {
  const removed = new Set(plan.remove)
  let insert = [...plan.insert]
  const remove = [...plan.remove]
  const blocks = new Set(insert.map(part => `${part.seq}:${part.position}`))
  for (const key of blocks) {
    const growth = [...stored.filter(part => !removed.has(part)), ...insert]
      .filter((part): part is StoredPart & { kind: 'append' } => part.kind === 'append')
      .filter(part => `${part.seq}:${part.position}` === key)
      .sort(comparePartKeys)
    const first = growth[0]
    if (first === undefined || growth.length < PART_MERGE_THRESHOLD) continue
    const folded = new Set<StoredPart>(growth)
    remove.push(...stored.filter(part => folded.has(part)))
    insert = [
      ...insert.filter(part => !folded.has(part)),
      { ...first, delta: growth.map(part => part.delta).join('') },
    ]
  }
  return { remove, insert }
}

/**
 * The part rows that turn the stored blocks into the blocks of `after`. A block that grows gets
 * the new piece; anything else rewrites the parts of its dispatch. CAS keeps the read current.
 */
export function planParts(
  stored: readonly StoredPart[],
  before: readonly DispatchDocument[],
  after: readonly DispatchDocument[],
): PartPlan {
  const remove: StoredPart[] = stored.filter(part => part.seq >= after.length)
  const insert: StoredPart[] = []
  after.forEach((dispatch, seq) => {
    const rows = stored.filter(part => part.seq === seq)
    const prior = before[seq]?.blocks ?? []
    const next = dispatch.blocks
    if (prior.some((block, at) => !grows(block, next[at]))) {
      remove.push(...rows)
      next.forEach((block, position) => insert.push(...fresh(seq, position, block)))
      return
    }
    next.forEach((block, position) => {
      const planned = step(
        seq,
        position,
        rows.filter(row => row.position === position),
        prior[position],
        block,
      )
      remove.push(...planned.remove)
      insert.push(...planned.insert)
    })
  })
  return bound(stored, { remove, insert })
}

function encoded<T>(result: Outcome<T, RowFailure>): Outcome<T, ModelFailure> {
  return 'failure' in result
    ? fail({ kind: 'invalid', field: result.failure.field, reason: result.failure.reason })
    : result
}

/** The fact command of one staged write. */
function factsOf(
  tenant: string,
  staged: Staged,
  read: CallRead,
  options: SqlModelStorageOptions,
): Outcome<Readonly<Record<string, JsonValue>>, ModelFailure> {
  const call = staged.kind === 'commit' ? staged.write.call : staged.call
  const callId = staged.kind === 'commit' ? staged.write.binding.call : staged.call.state.call
  const { expected } = staged
  let row: Row | null = null
  if (call !== undefined) {
    const head = encoded(
      encodeCallRow(tenant, nextVersion(expected), call, options.isPending(call)),
    )
    if ('failure' in head) return head
    row = head.ok
  }
  const before = read.record?.document.dispatches ?? []
  const dispatches: Row[] = []
  for (const [seq, dispatch] of (call?.dispatches ?? []).entries()) {
    const next = encoded(encodeDispatchRow(tenant, callId, seq, dispatch))
    if ('failure' in next) return next
    const prior = before[seq]
    const old = prior === undefined ? null : encodeDispatchRow(tenant, callId, seq, prior)
    if (old === null || !('ok' in old) || !sameStored(old.ok, next.ok)) dispatches.push(next.ok)
  }
  const plan = planParts(read.record?.parts ?? [], before, call?.dispatches ?? [])
  const parts: Row[] = []
  for (const part of plan.insert) {
    const next = encoded(encodePartRow(tenant, callId, part))
    if ('failure' in next) return next
    parts.push(next.ok)
  }
  let binding: Row | null = null
  if (staged.kind === 'commit') {
    const next = encoded(encodeOperationRow(tenant, staged.write.operation, staged.write.binding))
    if ('failure' in next) return next
    binding = next.ok
  }
  return succeed({
    intent: 'write',
    tenant,
    call: callId,
    expected,
    row,
    dispatches,
    removeParts: plan.remove.map(part => ({
      seq: part.seq,
      block: part.position,
      part: part.part,
    })),
    parts,
    binding,
    share: expected === null && row !== null ? options.limits.tenantCapacity : null,
  })
}

// --- The run -------------------------------------------------------------------------------

const RETRIED: readonly string[] = ['version', 'operation-bound', 'call-exists']

type Step = Readonly<{ kind: 'done'; failure: ModelFailure | null }> | Readonly<{ kind: 'again' }>

function isFactRecord(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function afterRollback(receipt: ReceiptV2, staged: Staged): Step {
  const stop = receipt.responses[receipt.responses.length - 1]?.reply
  if (stop?.kind === 'conflict') {
    const reason = isFactRecord(stop.basis) ? stop.basis['reason'] : undefined
    if (typeof reason === 'string' && RETRIED.includes(reason)) return { kind: 'again' }
    const call = staged.kind === 'commit' ? staged.write.call : staged.call
    if (reason === 'capacity' && call !== undefined)
      return { kind: 'done', failure: { kind: 'capacity', required: call.capacity } }
  }
  return {
    kind: 'done',
    failure: unavailable(`the model participant stopped the commit: ${stop?.kind ?? 'none'}`),
  }
}

/** The unknown bindings of each tenant, by operation. One writer: the storage of this process. */
class Unresolved {
  private readonly tenants = new Map<string, Map<ModelOperationId, Binding>>()
  private count = 0
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  full(): boolean {
    return this.count >= this.limit
  }

  of(tenant: string): ReadonlyMap<ModelOperationId, Binding> {
    return new Map(this.tenants.get(tenant) ?? [])
  }

  add(tenant: string, operation: ModelOperationId, binding: Binding): void {
    const map = this.tenants.get(tenant) ?? new Map<ModelOperationId, Binding>()
    if (!map.has(operation)) this.count += 1
    map.set(operation, binding)
    this.tenants.set(tenant, map)
  }

  remove(tenant: string, operation: ModelOperationId): void {
    if (this.tenants.get(tenant)?.delete(operation) === true) this.count -= 1
  }
}

export function createSqlModelStorage(options: SqlModelStorageOptions): SqlModelStorage {
  const { attempts, unresolved: unresolvedLimit } = checkOptions(options)
  const { storage, domains, combination, limits } = options
  const unresolved = new Unresolved(unresolvedLimit)
  let current: Attempt | null = null

  const active = (): Attempt => {
    if (current === null) throw new ScopeError('the storage is used outside a scoped run')
    return current
  }

  const identityOf = (domain: DomainRef, operation: string, key: string): SqlIdentity => ({
    scope: domain.scope,
    transactionDomain: domain.transactionDomain,
    operation,
    protocolVersion: '2',
    operationKey: key,
  })
  const generation = (domain: DomainRef, operation: ModelOperationId, at: number) =>
    identityOf(domain, operation, `${operation}#${at}`)

  /** The first generation not yet used, or what an earlier generation already decided. */
  async function freeGeneration(
    domain: DomainRef,
    operation: ModelOperationId,
  ): Promise<number | 'unknown' | 'committed' | 'exhausted'> {
    for (let at = 1; at <= attempts; at += 1) {
      const found = await storage.query(generation(domain, operation, at))
      if (found.kind === 'not_committed') return at
      if (found.kind !== 'rolled_back') return found.kind
    }
    return 'exhausted'
  }

  /** Drops the unknown operations of the call that the storage has since decided. */
  async function settleUnresolved(domain: DomainRef, scope: ModelRunScope): Promise<void> {
    for (const [operation, binding] of unresolved.of(scope.tenant)) {
      if (binding.call !== scope.call) continue
      if ((await freeGeneration(domain, operation)) !== 'unknown')
        unresolved.remove(scope.tenant, operation)
    }
  }

  function runWork<T>(
    work: () => Outcome<T, ModelFailure>,
    attempt: Attempt | null,
  ): Outcome<T, ModelFailure> {
    current = attempt
    try {
      return work()
    } catch (error) {
      if (error instanceof ScopeError) return fail(unavailable(`storage scope: ${error.message}`))
      throw error
    } finally {
      current = null
    }
  }

  function unknownStep(tenant: string, staged: Staged): Step {
    if (staged.kind === 'publish')
      return { kind: 'done', failure: unavailable('the read progress commit is unknown') }
    const { operation, binding } = staged.write
    unresolved.add(tenant, operation, { ...binding, status: 'unknown', effect: 'applied' })
    return { kind: 'done', failure: { kind: 'commit-unknown', operation } }
  }

  async function identityFor(
    domain: DomainRef,
    tenant: string,
    staged: Staged,
  ): Promise<SqlIdentity | Step> {
    if (staged.kind === 'publish') {
      const operation = `${staged.call.state.call}#read`
      return identityOf(domain, operation, `${operation}@${staged.expected}`)
    }
    if (unresolved.full())
      return { kind: 'done', failure: unavailable('too many operations with an unknown outcome') }
    const at = await freeGeneration(domain, staged.write.operation)
    if (at === 'committed') return { kind: 'again' }
    if (at === 'unknown') return unknownStep(tenant, staged)
    if (at === 'exhausted')
      return { kind: 'done', failure: unavailable('every attempt generation was rolled back') }
    return generation(domain, staged.write.operation, at)
  }

  async function commitStaged(
    domain: DomainRef,
    tenant: string,
    staged: Staged,
    read: CallRead,
  ): Promise<Step> {
    const facts = factsOf(tenant, staged, read, options)
    if ('failure' in facts) return { kind: 'done', failure: facts.failure }
    const identity = await identityFor(domain, tenant, staged)
    if ('kind' in identity) return identity
    const result: CommitResultV2 = await storage.commit({
      identity,
      ...combination,
      commands: [{ participant: MODEL_PARTICIPANT, facts: facts.ok }],
    })
    switch (result.kind) {
      case 'committed':
        return { kind: 'done', failure: null }
      case 'rolled_back':
        return afterRollback(result, staged)
      case 'identity_conflict':
        return { kind: 'again' }
      case 'unknown':
        return unknownStep(tenant, staged)
      case 'rejected_before_accept':
        return result.reason === 'writer_not_current'
          ? unknownStep(tenant, staged)
          : { kind: 'done', failure: unavailable(`storage rejected the commit: ${result.reason}`) }
    }
  }

  async function run<T>(
    work: () => Outcome<T, ModelFailure>,
    scope?: ModelRunScope,
  ): Promise<Outcome<T, ModelFailure>> {
    if (scope === undefined) return runWork(work, null)
    const domain = await domainOf(domains, scope.tenant)
    if ('failure' in domain) return domain
    const ready = domain.ok.kind === 'ready' ? domain.ok.domain : null
    const input = { tenant: scope.tenant, call: scope.call, operation: scope.operation ?? null }
    for (let pass = 1; pass <= attempts; pass += 1) {
      if (ready !== null) await settleUnresolved(ready, scope)
      const read = await readCall(storage, domain.ok, input)
      if ('failure' in read) return read
      if (read.ok.binding !== null) unresolved.remove(scope.tenant, read.ok.binding.operation)
      const attempt = new Attempt(scope, read.ok, unresolved.of(scope.tenant))
      const outcome = runWork(work, attempt)
      const staged = attempt.staged
      if (staged === null) return outcome
      if (ready === null) return fail(unavailable('the tenant has no registered domain'))
      const settled = await commitStaged(ready, scope.tenant, staged, read.ok)
      if (settled.kind === 'done') return settled.failure === null ? outcome : fail(settled.failure)
    }
    return fail(unavailable('every attempt of the run met a newer write'))
  }

  return {
    limits,
    run,
    documents: tenant => active().documents(tenant),
    reserved: field => active().reserved(field),
    commit: (tenant, write) => active().commit(tenant, write),
    publish: (tenant, call) => active().publish(tenant, call),
    async readCall(input) {
      const domain = await domainOf(domains, input.tenant)
      return 'failure' in domain ? domain : readCall(storage, domain.ok, input)
    },
    async readPending(input) {
      const domain = await domainOf(domains, input.tenant)
      return 'failure' in domain ? domain : readPending(storage, domain.ok, input)
    },
  }
}

// --- The participant (Worker) --------------------------------------------------------------

class FactError extends Error {}

const columnNames = (table: Table): readonly string[] => table.columns.map(item => item.name)

function cellValue(table: Table, row: Row, name: string): SqlValue {
  const cell = row[name] ?? null
  const kind = table.columns.find(item => item.name === name)?.kind
  return kind === 'int' && typeof cell === 'number' ? BigInt(cell) : cell
}

function insert(port: ParticipantPort, table: Table, row: Row, onConflict: string): bigint {
  const names = columnNames(table)
  return port.execute(
    `INSERT INTO ${table.name} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ${onConflict}`,
    names.map(name => cellValue(table, row, name)),
  ).changes
}

function checkedRow(table: Table, raw: unknown, tenant: string, call: string): Row {
  const row = parseRow(table, raw)
  if ('failure' in row) throw new FactError(`${table.name} row`)
  if (row.ok['tenant'] !== tenant || row.ok['call'] !== call)
    throw new FactError(`${table.name} scope`)
  return row.ok
}

function rowList(raw: JsonValue | undefined, table: Table, tenant: string, call: string): Row[] {
  if (!Array.isArray(raw)) throw new FactError(`${table.name} rows`)
  return raw.map(item => checkedRow(table, item, tenant, call))
}

function text(raw: JsonValue | undefined, name: string): string {
  if (typeof raw !== 'string' || raw === '') throw new FactError(name)
  return raw
}

function shareOf(raw: JsonValue | undefined): ResultCapacity | null {
  if (raw === null) return null
  if (!isFactRecord(raw)) throw new FactError('share')
  const cell = (key: string): string => {
    const found = raw[key]
    if (typeof found !== 'string' || !DECIMAL.test(found)) throw new FactError('share')
    return found
  }
  return { bytes: cell('bytes'), blocks: cell('blocks'), attachmentBytes: cell('attachmentBytes') }
}

type PartKeyCells = Readonly<{ seq: number; block: number; part: number }>

function partKeys(raw: JsonValue | undefined): PartKeyCells[] {
  if (!Array.isArray(raw)) throw new FactError('removeParts')
  const index = (value: JsonValue, key: string): number => {
    const cell = isFactRecord(value) ? value[key] : null
    if (typeof cell !== 'number' || !Number.isSafeInteger(cell) || cell < 0)
      throw new FactError('removeParts')
    return cell
  }
  return raw.map(item => ({
    seq: index(item, 'seq'),
    block: index(item, 'block'),
    part: index(item, 'part'),
  }))
}

/** The write facts, checked once: every row belongs to the tenant and call the facts name. */
function writeFacts(facts: Readonly<Record<string, JsonValue>>) {
  const tenant = text(facts['tenant'], 'tenant')
  const call = text(facts['call'], 'call')
  const expected = facts['expected']
  if (
    expected !== null &&
    !(typeof expected === 'number' && Number.isSafeInteger(expected) && expected >= 1)
  )
    throw new FactError('expected')
  const row = facts['row'] === null ? null : checkedRow(TABLES.call, facts['row'], tenant, call)
  if (row !== null && row['row_version'] !== nextVersion(expected))
    throw new FactError('row_version')
  const binding =
    facts['binding'] === null ? null : checkedRow(TABLES.operation, facts['binding'], tenant, call)
  // A write is a call row, a binding, or both; a binding alone only for a call not written.
  if (row === null && (binding === null || expected !== null)) throw new FactError('shape')
  return {
    tenant,
    call,
    expected,
    row,
    binding,
    dispatches: rowList(facts['dispatches'], TABLES.dispatch, tenant, call),
    removeParts: partKeys(facts['removeParts']),
    parts: rowList(facts['parts'], TABLES.part, tenant, call),
    share: shareOf(facts['share']),
  }
}

const stop = (reason: string): ParticipantReply => ({ kind: 'conflict', basis: { reason } })

function overShare(port: ParticipantPort, tenant: string, share: ResultCapacity): boolean {
  const sums = port.execute(
    `SELECT COALESCE(SUM(cap_bytes), 0), COALESCE(SUM(cap_blocks), 0), COALESCE(SUM(cap_attachment), 0)
       FROM md_call WHERE tenant = ? AND request IS NOT NULL`,
    [tenant],
  ).rows[0]
  const limits = [share.bytes, share.blocks, share.attachmentBytes]
  return limits.some((limit, at) => {
    const sum = sums?.[at] ?? 0
    if (typeof sum !== 'number' && typeof sum !== 'bigint')
      throw new Error('a capacity sum is not an integer')
    return BigInt(sum) > BigInt(limit)
  })
}

/**
 * One write in the provider's transaction: bind the operation, then insert the call or update it
 * at the expected version, then the dispatch and part rows, then the tenant share of a new call.
 * Any stop rolls the whole commit back.
 */
function write(port: ParticipantPort, facts: ReturnType<typeof writeFacts>): ParticipantReply {
  const { tenant, call, expected, row } = facts
  if (
    facts.binding !== null &&
    insert(port, TABLES.operation, facts.binding, 'ON CONFLICT (tenant, operation) DO NOTHING') !==
      1n
  )
    return stop('operation-bound')
  if (row !== null && expected === null) {
    if (insert(port, TABLES.call, row, 'ON CONFLICT (tenant, call) DO NOTHING') !== 1n)
      return stop('call-exists')
  } else if (row !== null && expected !== null) {
    const names = columnNames(TABLES.call).filter(name => name !== 'tenant' && name !== 'call')
    const updated = port.execute(
      `UPDATE md_call SET ${names.map(name => `${name} = ?`).join(', ')}
        WHERE tenant = ? AND call = ? AND row_version = ?`,
      [...names.map(name => cellValue(TABLES.call, row, name)), tenant, call, BigInt(expected)],
    )
    if (updated.changes !== 1n) return stop('version')
  }
  const kept = columnNames(TABLES.dispatch).filter(
    name => !['tenant', 'call', 'seq'].includes(name),
  )
  const upsert = `ON CONFLICT (tenant, call, seq) DO UPDATE SET ${kept
    .map(name => `${name} = excluded.${name}`)
    .join(', ')}`
  for (const item of facts.dispatches) insert(port, TABLES.dispatch, item, upsert)
  for (const key of facts.removeParts)
    port.execute(
      'DELETE FROM md_part WHERE tenant = ? AND call = ? AND seq = ? AND block = ? AND part = ?',
      [tenant, call, BigInt(key.seq), BigInt(key.block), BigInt(key.part)],
    )
  for (const item of facts.parts) insert(port, TABLES.part, item, '')
  if (facts.share !== null && overShare(port, tenant, facts.share)) return stop('capacity')
  return { kind: 'participated', response: { version: nextVersion(expected) } }
}

const participant: ParticipantModule = {
  participant: MODEL_PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    if (facts['intent'] !== 'write')
      return { kind: 'unsupported', basis: { reason: 'the facts are not a write' } }
    let checked: ReturnType<typeof writeFacts>
    try {
      checked = writeFacts(facts)
    } catch (error) {
      if (error instanceof FactError)
        return { kind: 'unsupported', basis: { reason: error.message } }
      throw error
    }
    return write(port, checked)
  },
}
export default participant
