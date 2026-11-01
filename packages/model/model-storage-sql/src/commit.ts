// The commit loop of the Model records and the `model` participant that it commits to. The main
// thread reads the call (`model.call`), runs the caller's work on a staged transaction, and sends
// the staged rows as one fact command. The participant writes them only if `row_version` is still
// the version the work read (CAS); otherwise it stops, the commit rolls back, and the loop reads
// again in the next attempt generation. The default export is the participant module.
import type { ModelOperationId, ResultCapacity } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CommitResultV2,
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
  encodeCallRow,
  encodeDispatchRow,
  encodeOperationRow,
  encodePartRow,
  nextVersion,
  parseRow,
  sameTenant,
  type CallRead,
  type ConflictReason,
  type ModelStorageFailure,
  type ModelStorageTransaction,
  type PendingMark,
  type Row,
  type StoredModelDocument,
  type StoredPart,
  type TenantRef,
} from './documents.ts'
import {
  CALL_READ_MAX_OUTPUT_BYTES,
  domainOf,
  readCall,
  readPending,
  unavailable,
  type CallScope,
  type DomainOf,
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
const MAX_ATTEMPT_LIMIT = 64

export type ModelStoreLimits = Readonly<{
  /** The share of one tenant: the sum over its calls whose request material is held. */
  tenantCapacity: ResultCapacity
  /** The largest call material that one call may hold. */
  maxCallBytes: number
  /** The `maxCommandBytes` of the storage provider. */
  maxCommandBytes: number
}>

export type ModelStoreOptions = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  /** The combination the application registered for the tenant scope (session log and Model). */
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  limits: ModelStoreLimits
  /** Attempt generations of one operation. Default 8. */
  attemptLimit?: number
}>

export type ModelStore = Readonly<{
  limits: ModelStoreLimits
  /**
   * Runs `work` on one storage transaction of (tenant, call, operation) and commits what it staged.
   * `work` may run more than once: after a CAS conflict it runs again on a new read. It must be
   * synchronous and must not keep effects of a run that did not commit.
   */
  transact<T, F>(
    scope: CallScope,
    work: (transaction: ModelStorageTransaction) => Outcome<T, F>,
  ): Promise<Outcome<T, F | ModelStorageFailure>>
  /** One `snapshot` read of the call, without a commit. */
  readCall(scope: CallScope): Promise<Outcome<CallRead, ModelStorageFailure>>
  readPending(
    input: Readonly<{ tenant: TenantRef; after: CallScope['call'] | null; limit: number }>,
  ): Promise<Outcome<PendingPage, ModelStorageFailure>>
}>

// --- Construction --------------------------------------------------------------------------

const DECIMAL = /^(0|[1-9][0-9]*)$/
const DIGEST = /^[0-9a-f]{64}$/

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} is not a positive safe integer`)
}

/** The construction checks: the limits fit each other (N1) and the combination is named. */
export function checkOptions(options: ModelStoreOptions): number {
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
  return attempts
}

// --- The staged transaction ----------------------------------------------------------------

type Scope = CallScope & Readonly<{ text: string }>
type Written = Readonly<{ expected: number | null; next: StoredModelDocument }>

const conflict = (reason: ConflictReason): ModelStorageFailure => ({ kind: 'conflict', reason })
const outOfScope = (field: 'tenant' | 'call' | 'operation'): ModelStorageFailure => ({
  kind: 'out-of-scope',
  field,
})
const invalid = (field: string, reason: string): ModelStorageFailure => ({
  kind: 'invalid',
  field,
  reason,
})

const sameKey = (left: StoredPart, right: StoredPart): boolean =>
  left.seq === right.seq && left.index === right.index && left.part === right.part
const sameBlock = (left: StoredPart, right: StoredPart): boolean =>
  left.seq === right.seq && left.index === right.index

/**
 * The synchronous face of one attempt. It answers from the read of this attempt and stages the
 * writes; nothing reaches the storage until the loop commits the staged facts.
 */
class StagedTransaction implements ModelStorageTransaction {
  written: Written | null = null
  mark: PendingMark | null = null
  readonly appended: StoredPart[] = []

  private readonly scope: Scope
  private readonly snapshot: CallRead

  constructor(scope: Scope, snapshot: CallRead) {
    this.scope = scope
    this.snapshot = snapshot
  }

  private outside(tenant: TenantRef, operation: ModelOperationId): ModelStorageFailure | null {
    if (!sameTenant(tenant, this.scope.tenant)) return outOfScope('tenant')
    if (operation !== this.scope.operation) return outOfScope('operation')
    return null
  }

  /** The operation is bound to another call: no document of this call answers for it. */
  private boundElsewhere(): boolean {
    const binding = this.snapshot.binding
    return binding !== null && binding.call !== this.scope.call
  }

  read(tenant: TenantRef, operation: ModelOperationId) {
    const outside = this.outside(tenant, operation)
    if (outside !== null) return fail(outside)
    if (this.boundElsewhere()) return fail(conflict('operation-bound'))
    return succeed(this.snapshot.document)
  }

  write(
    tenant: TenantRef,
    operation: ModelOperationId,
    expected: number | null,
    next: StoredModelDocument,
  ) {
    const outside = this.outside(tenant, operation)
    if (outside !== null) return fail(outside)
    if (next.call.call !== this.scope.call) return fail(outOfScope('call'))
    const binding = next.binding
    if (binding === null || binding.operation !== operation || binding.call !== this.scope.call)
      return fail(invalid('binding', 'operation'))
    if (this.written !== null) return fail(invalid('write', 'twice'))
    const current = this.snapshot.document
    if (this.boundElsewhere() || current?.binding != null) return fail(conflict('operation-bound'))
    if (expected !== (current?.version ?? null)) return fail(conflict('version'))
    const before = current?.dispatches ?? []
    if (next.parts.length !== (current?.parts.length ?? 0)) return fail(invalid('parts', 'append'))
    if (
      next.dispatches.length < before.length ||
      next.dispatches.some((item, at) => item.seq !== at)
    )
      return fail(invalid('dispatches', 'order'))
    this.written = { expected, next }
    return succeed(nextVersion(expected))
  }

  capacity(tenant: TenantRef) {
    if (!sameTenant(tenant, this.scope.tenant)) return fail(outOfScope('tenant'))
    return succeed(this.snapshot.capacity)
  }

  pending(tenant: TenantRef, operation: ModelOperationId, at: string) {
    const outside = this.outside(tenant, operation)
    if (outside !== null) return fail(outside)
    if (at === '') return fail(invalid('pending', 'at'))
    this.mark = { operation, at }
    return succeed(undefined)
  }

  appendPart(tenant: TenantRef, operation: ModelOperationId, part: StoredPart) {
    const outside = this.outside(tenant, operation)
    if (outside !== null) return fail(outside)
    if (
      !Number.isSafeInteger(part.seq) ||
      part.seq < 0 ||
      !Number.isSafeInteger(part.part) ||
      part.part < 0
    )
      return fail(invalid('part', 'key'))
    const stored = this.snapshot.document?.parts ?? []
    if ([...stored, ...this.appended].some(item => sameKey(item, part)))
      return fail(invalid('part', 'duplicate-key'))
    this.appended.push(part)
    return succeed(undefined)
  }
}

type PartPlan = Readonly<{ remove: readonly StoredPart[]; insert: readonly StoredPart[] }>

/**
 * The part rows of one commit. A `replace` part supersedes the earlier `replace` parts of its
 * block. When a block holds `PART_MERGE_THRESHOLD` or more `append` parts, they become one part
 * at the first of their numbers, so the rows of a block stay bounded (N2).
 */
export function planParts(
  stored: readonly StoredPart[],
  appended: readonly StoredPart[],
): PartPlan {
  let kept = [...stored]
  let added: StoredPart[] = []
  for (const part of appended) {
    if (part.kind === 'replace') {
      const superseded = (item: StoredPart) => item.kind === 'replace' && sameBlock(item, part)
      kept = kept.filter(item => !superseded(item))
      added = added.filter(item => !superseded(item))
    }
    added.push(part)
  }
  for (const part of appended) {
    const growth = [...kept, ...added]
      .filter(
        (item): item is StoredPart & { kind: 'append' } =>
          item.kind === 'append' && sameBlock(item, part),
      )
      .sort((left, right) => left.part - right.part)
    const first = growth[0]
    if (first === undefined || growth.length < PART_MERGE_THRESHOLD) continue
    const folded = new Set<StoredPart>(growth)
    const merged: StoredPart = { ...first, delta: growth.map(item => item.delta).join('') }
    kept = kept.filter(item => !folded.has(item))
    added = [...added.filter(item => !folded.has(item)), merged]
  }
  const remove = stored.filter(item => !kept.includes(item))
  return { remove, insert: added }
}

function rowText(row: Outcome<Row, ModelStorageFailure>): string | null {
  return 'ok' in row ? JSON.stringify(row.ok) : null
}

/** The fact command of one staged write, or the failure that stops it before the commit. */
function factsOf(
  scope: Scope,
  staged: StagedTransaction,
  read: CallRead,
  share: ResultCapacity,
): Outcome<Readonly<Record<string, JsonValue>>, ModelStorageFailure> {
  const written = staged.written
  if (written === null) return fail(invalid('write', 'missing'))
  const { expected, next } = written
  const call = { ...next.call, pending: staged.mark ?? next.call.pending }
  const row = encodeCallRow(scope.text, nextVersion(expected), call)
  if ('failure' in row) return row
  const before = new Map(
    (read.document?.dispatches ?? []).map(item => [
      item.seq,
      rowText(encodeDispatchRow(scope.text, scope.call, item)),
    ]),
  )
  const dispatches: Row[] = []
  for (const item of next.dispatches) {
    const encoded = encodeDispatchRow(scope.text, scope.call, item)
    if ('failure' in encoded) return encoded
    if (before.get(item.seq) !== JSON.stringify(encoded.ok)) dispatches.push(encoded.ok)
  }
  if (staged.appended.some(part => part.seq >= next.dispatches.length))
    return fail(invalid('part', 'dispatch'))
  const plan = planParts(read.document?.parts ?? [], staged.appended)
  const parts: Row[] = []
  for (const part of plan.insert) {
    const encoded = encodePartRow(scope.text, scope.call, part)
    if ('failure' in encoded) return encoded
    parts.push(encoded.ok)
  }
  const binding = next.binding === null ? null : encodeOperationRow(scope.text, next.binding)
  if (binding === null || 'failure' in binding)
    return binding ?? fail(invalid('binding', 'missing'))
  return succeed({
    intent: 'write',
    tenant: scope.text,
    call: scope.call,
    operation: scope.operation,
    expected,
    row: row.ok,
    dispatches,
    removeParts: plan.remove.map(part => ({
      seq: part.seq,
      block: Number(part.index),
      part: part.part,
    })),
    parts,
    binding: binding.ok,
    share: expected === null ? share : null,
  })
}

// --- The commit loop -----------------------------------------------------------------------

const RETRIED: readonly string[] = ['version', 'operation-bound', 'call-exists']

type Step<T, F> =
  | Readonly<{ kind: 'done'; value: Outcome<T, F | ModelStorageFailure> }>
  | Readonly<{ kind: 'next' }>
  | Readonly<{ kind: 'recall' }>

function stopOf(receipt: ReceiptV2): ParticipantReply | undefined {
  return receipt.responses[receipt.responses.length - 1]?.reply
}

function afterRollback<T, F>(receipt: ReceiptV2): Step<T, F> {
  const stop = stopOf(receipt)
  if (stop?.kind === 'conflict') {
    const reason = isFactRecord(stop.basis) ? stop.basis['reason'] : undefined
    if (typeof reason === 'string' && RETRIED.includes(reason)) return { kind: 'next' }
    if (reason === 'capacity') return { kind: 'done', value: fail({ kind: 'capacity' }) }
  }
  return {
    kind: 'done',
    value: fail(unavailable(`the model participant stopped the commit: ${stop?.kind ?? 'none'}`)),
  }
}

function afterCommit<T, F>(
  result: CommitResultV2,
  value: Outcome<T, F>,
  operation: ModelOperationId,
): Step<T, F> {
  switch (result.kind) {
    case 'committed':
      return { kind: 'done', value }
    case 'rolled_back':
      return afterRollback(result)
    case 'identity_conflict':
      return result.existing.kind === 'rolled_back' ? { kind: 'next' } : { kind: 'recall' }
    case 'unknown':
      return { kind: 'done', value: fail({ kind: 'commit-unknown', operation }) }
    case 'rejected_before_accept':
      return {
        kind: 'done',
        value:
          result.reason === 'writer_not_current'
            ? fail({ kind: 'commit-unknown', operation })
            : fail(unavailable(`storage rejected the commit: ${result.reason}`)),
      }
  }
}

export function createModelStore(options: ModelStoreOptions): ModelStore {
  const attemptLimit = checkOptions(options)
  const { storage, domains, combination, limits } = options

  const identityOf = (
    domain: DomainOf & { kind: 'ready' },
    scope: CallScope,
    attempt: number,
  ): SqlIdentity => ({
    scope: domain.domain.scope,
    transactionDomain: domain.domain.transactionDomain,
    operation: scope.operation,
    protocolVersion: '2',
    operationKey: `${scope.operation}#${attempt}`,
  })

  /** One run of `work` on a fresh read. `recall`: an earlier generation committed; never commit again. */
  async function attempt<T, F>(
    domain: DomainOf & { kind: 'ready' },
    scope: CallScope,
    work: (transaction: ModelStorageTransaction) => Outcome<T, F>,
    generation: number,
    recall: boolean,
  ): Promise<Step<T, F>> {
    const read = await readCall(storage, domain, scope)
    if ('failure' in read) return { kind: 'done', value: read }
    const staged = new StagedTransaction({ ...scope, text: domain.text }, read.ok)
    const value = work(staged)
    if ('failure' in value || staged.written === null) {
      if ('ok' in value && (staged.mark !== null || staged.appended.length > 0))
        return { kind: 'done', value: fail(invalid('write', 'missing')) }
      return { kind: 'done', value }
    }
    if (recall) return { kind: 'done', value: fail(conflict('operation-bound')) }
    const facts = factsOf({ ...scope, text: domain.text }, staged, read.ok, limits.tenantCapacity)
    if ('failure' in facts) return { kind: 'done', value: facts }
    const result = await storage.commit({
      identity: identityOf(domain, scope, generation),
      ...combination,
      commands: [{ participant: MODEL_PARTICIPANT, facts: facts.ok }],
    })
    return afterCommit(result, value, scope.operation)
  }

  async function transact<T, F>(
    scope: CallScope,
    work: (transaction: ModelStorageTransaction) => Outcome<T, F>,
  ): Promise<Outcome<T, F | ModelStorageFailure>> {
    const domain = await domainOf(domains, scope.tenant)
    if ('failure' in domain) return domain
    if (domain.ok.kind === 'unregistered')
      return fail(unavailable('the tenant has no registered transaction domain'))
    const ready = domain.ok
    for (let generation = 1; generation <= attemptLimit; generation += 1) {
      const found = await storage.query(identityOf(ready, scope, generation))
      if (found.kind === 'rolled_back') continue
      if (found.kind === 'unknown')
        return fail({ kind: 'commit-unknown', operation: scope.operation })
      let step = await attempt(ready, scope, work, generation, found.kind === 'committed')
      if (step.kind === 'recall') step = await attempt(ready, scope, work, generation, true)
      if (step.kind === 'done') return step.value
    }
    return fail(unavailable('every attempt generation of the operation was rolled back'))
  }

  return {
    limits,
    transact,
    async readCall(scope) {
      const domain = await domainOf(domains, scope.tenant)
      return 'failure' in domain ? domain : readCall(storage, domain.ok, scope)
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
  const value = raw
  const cell = (key: string): string => {
    const found = value[key]
    if (typeof found !== 'string' || !DECIMAL.test(found)) throw new FactError('share')
    return found
  }
  return { bytes: cell('bytes'), blocks: cell('blocks'), attachmentBytes: cell('attachmentBytes') }
}

type PartKeyCells = Readonly<{ seq: number; block: number; part: number }>

function isFactRecord(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
  const operation = text(facts['operation'], 'operation')
  const expected = facts['expected']
  if (
    expected !== null &&
    !(typeof expected === 'number' && Number.isSafeInteger(expected) && expected >= 1)
  )
    throw new FactError('expected')
  const row = checkedRow(TABLES.call, facts['row'], tenant, call)
  if (row['row_version'] !== nextVersion(expected)) throw new FactError('row_version')
  const binding = parseRow(TABLES.operation, facts['binding'])
  if (
    'failure' in binding ||
    binding.ok['tenant'] !== tenant ||
    binding.ok['call'] !== call ||
    binding.ok['operation'] !== operation
  )
    throw new FactError('binding')
  return {
    tenant,
    call,
    expected,
    row,
    binding: binding.ok,
    dispatches: rowList(facts['dispatches'], TABLES.dispatch, tenant, call),
    removeParts: partKeys(facts['removeParts']),
    parts: rowList(facts['parts'], TABLES.part, tenant, call),
    share: shareOf(facts['share']),
  }
}

const stop = (reason: ConflictReason | 'capacity'): ParticipantReply => ({
  kind: 'conflict',
  basis: { reason },
})

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
    insert(port, TABLES.operation, facts.binding, 'ON CONFLICT (tenant, operation) DO NOTHING') !==
    1n
  )
    return stop('operation-bound')
  if (expected === null) {
    if (insert(port, TABLES.call, row, 'ON CONFLICT (tenant, call) DO NOTHING') !== 1n)
      return stop('call-exists')
  } else {
    const names = columnNames(TABLES.call).filter(name => name !== 'tenant' && name !== 'call')
    const updated = port.execute(
      `UPDATE md_call SET ${names.map(name => `${name} = ?`).join(', ')}
        WHERE tenant = ? AND call = ? AND row_version = ?`,
      [...names.map(name => cellValue(TABLES.call, row, name)), tenant, call, BigInt(expected)],
    )
    if (updated.changes !== 1n) return stop('version')
  }
  const dispatchColumns = columnNames(TABLES.dispatch).filter(
    name => !['tenant', 'call', 'seq'].includes(name),
  )
  const upsert = `ON CONFLICT (tenant, call, seq) DO UPDATE SET ${dispatchColumns
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
