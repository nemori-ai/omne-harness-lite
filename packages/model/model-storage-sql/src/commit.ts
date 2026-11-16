import { randomUUID } from 'node:crypto'
import {
  decodeModelCallId,
  type FixedModelRequest,
  type ModelCallId,
  type ModelFailure,
  type ModelOperationId,
  type VisibleBlock,
} from '@omne-harness/model-contract'
import {
  hasRecoveryWork,
  type Binding,
  type CallDocument,
  type CommandWrite,
  type DispatchDocument,
  type ModelCommandStorage,
  type PendingPage as ScanPage,
  type RunScope,
  type TenantDocuments,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commitRejectionNature,
  type CommitRejectReason,
  type CommitResultV2,
  type DomainRef,
  type JsonValue,
  type QueryResultV2,
  type ReceiptV2,
  type SqlIdentity,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import {
  packText,
  type ParticipantModule,
  type ParticipantPort,
  type ParticipantReply,
  type SqlValue,
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
  type CallRead,
  type Row,
  type RowFailure,
  type StoredPart,
} from './documents.ts'
import {
  HELD_CALLS_SQL,
  domainOf,
  readCall,
  readPending,
  readRequestBody,
  REQUEST_READ_MAX_OUTPUT_BYTES,
  unavailable,
  type CallReadInput,
  type DomainOf,
  type PendingPage,
} from './reads.ts'
import { requestChunks } from './request-body.ts'
import { MODEL_PARTICIPANT, PROTOCOL, TABLES, type Table } from './schema.ts'

export const BODY_READ_RESERVE_BYTES = 64 * 1024
export const PART_MERGE_THRESHOLD = 64
export const DEFAULT_ATTEMPT_LIMIT = 8
export const DEFAULT_UNRESOLVED_LIMIT = 1024
const MAX_ATTEMPT_LIMIT = 64

export type ModelStorageLimits = Readonly<{
  tenantResults: number
  requestChunkBytes: number
}>

export type SqlModelStorageOptions = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  limits: ModelStorageLimits
  attemptLimit?: number
  unresolvedLimit?: number
}>

export type SqlModelStorage = ModelCommandStorage &
  Readonly<{
    limits: ModelStorageLimits
    pending: NonNullable<ModelCommandStorage['pending']>
    readCall(input: CallReadInput): Promise<Outcome<CallRead, ModelFailure>>
    readPending(
      input: Readonly<{ tenant: string; after: ModelCallId | null; limit: number }>,
    ): Promise<Outcome<PendingPage, ModelFailure>>
  }>

const DIGEST = /^[0-9a-f]{64}$/

function positive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} is not a positive safe integer`)
}

function checkOptions(options: SqlModelStorageOptions): Readonly<{
  rounds: number
  unresolved: number
}> {
  const { limits, combination } = options
  positive(limits.tenantResults, 'tenantResults')
  positive(limits.requestChunkBytes, 'requestChunkBytes')
  if (limits.requestChunkBytes + BODY_READ_RESERVE_BYTES > REQUEST_READ_MAX_OUTPUT_BYTES)
    throw new RangeError('requestChunkBytes exceeds what one model.request read can carry')
  if (typeof combination.combinationVersion !== 'string' || combination.combinationVersion === '')
    throw new TypeError('combinationVersion is empty')
  if (!DIGEST.test(combination.manifestDigest))
    throw new TypeError('manifestDigest is not a lowercase SHA-256')
  const rounds = options.attemptLimit ?? DEFAULT_ATTEMPT_LIMIT
  positive(rounds, 'attemptLimit')
  if (rounds > MAX_ATTEMPT_LIMIT) throw new RangeError('attemptLimit is above 64')
  const unresolved = options.unresolvedLimit ?? DEFAULT_UNRESOLVED_LIMIT
  positive(unresolved, 'unresolvedLimit')
  return { rounds, unresolved }
}

class ScopeError extends Error {}

type CallScope = RunScope & Readonly<{ call: ModelCallId }>

type Staged =
  | Readonly<{ kind: 'commit'; write: CommandWrite; expected: number | null }>
  | Readonly<{ kind: 'publish'; call: CallDocument; expected: number }>

const stagedCall = (staged: Staged): CallDocument | undefined =>
  staged.kind === 'commit' ? staged.write.call : staged.call
const stagedCallId = (staged: Staged): ModelCallId =>
  staged.kind === 'commit' ? staged.write.binding.call : staged.call.state.call

const noDocuments = (): TenantDocuments => ({ calls: new Map(), operations: new Map() })

type AdmittedBody = Readonly<{
  tenant: string
  call: ModelCallId
  digest: string
  request: FixedModelRequest
}>

function admittedBody(tenant: string, staged: Staged): AdmittedBody | null {
  if (staged.kind !== 'commit' || staged.write.body === undefined) return null
  const call = staged.write.call
  if (call === undefined) return null
  return { tenant, call: call.state.call, digest: call.requestDigest, request: staged.write.body }
}

const refOf = (body: AdmittedBody) => ({
  tenant: body.tenant,
  call: body.call,
  digest: body.digest,
})

class Attempt {
  staged: Staged | null = null
  private readonly scope: CallScope
  private readonly read: CallRead
  private readonly view: TenantDocuments

  constructor(
    scope: CallScope,
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
    return tenant === this.scope.tenant ? this.view : noDocuments()
  }

  held(): number {
    return this.read.held
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
    if (this.scope.operation === undefined)
      throw new ScopeError('a commit in a run whose scope names no operation')
    if (write.operation !== this.scope.operation)
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

export type PartPlan = Readonly<{ remove: readonly StoredPart[]; insert: readonly StoredPart[] }>

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

class EncodeError extends Error {
  readonly failure: RowFailure

  constructor(failure: RowFailure) {
    super(`${failure.field}: ${failure.reason}`)
    this.failure = failure
  }
}

function must<T>(result: Outcome<T, RowFailure>): T {
  if ('failure' in result) throw new EncodeError(result.failure)
  return result.ok
}

function changedDispatches(
  tenant: string,
  call: ModelCallId,
  before: readonly DispatchDocument[],
  after: readonly DispatchDocument[],
): Row[] {
  return after.flatMap((dispatch, seq) => {
    const next = must(encodeDispatchRow(tenant, call, seq, dispatch))
    const prior = before[seq]
    const old = prior === undefined ? null : encodeDispatchRow(tenant, call, seq, prior)
    return old !== null && 'ok' in old && sameStored(old.ok, next) ? [] : [next]
  })
}

type BodyManifest = Readonly<{
  digest: string
  chunks: number
  inline: string | null
  sweep: boolean
}>

function factsOf(
  tenant: string,
  staged: Staged,
  read: CallRead,
  share: number,
  body: BodyManifest | null,
): Readonly<Record<string, JsonValue>> {
  const call = stagedCall(staged)
  const callId = stagedCallId(staged)
  const { expected } = staged
  const before = read.record?.document.dispatches ?? []
  const plan = planParts(read.record?.parts ?? [], before, call?.dispatches ?? [])
  return {
    intent: 'write',
    tenant,
    call: callId,
    expected,
    row:
      call === undefined
        ? null
        : must(encodeCallRow(tenant, nextVersion(expected), call, hasRecoveryWork(call))),
    dispatches: changedDispatches(tenant, callId, before, call?.dispatches ?? []),
    removeParts: plan.remove.map(part => ({
      seq: part.seq,
      block: part.position,
      part: part.part,
    })),
    parts: plan.insert.map(part => must(encodePartRow(tenant, callId, part))),
    binding:
      staged.kind === 'commit'
        ? must(encodeOperationRow(tenant, staged.write.operation, staged.write.binding))
        : null,
    share: expected === null && call !== undefined ? share : null,
    body,
  }
}

function encodedFacts(
  tenant: string,
  staged: Staged,
  read: CallRead,
  share: number,
  body: BodyManifest | null,
): Outcome<Readonly<Record<string, JsonValue>>, ModelFailure> {
  try {
    return succeed(factsOf(tenant, staged, read, share, body))
  } catch (error) {
    if (!(error instanceof EncodeError)) throw error
    return fail({ kind: 'invalid', field: error.failure.field, reason: error.failure.reason })
  }
}

const RETRIED: readonly string[] = ['version', 'operation-bound', 'call-exists']

type Step = Readonly<{ kind: 'done'; failure: ModelFailure | null }> | Readonly<{ kind: 'again' }>

type Target = Readonly<{
  identity: SqlIdentity
  saw?: (outcome: CommitResultV2['kind']) => void
  next?: () => Target
}>

function spent(result: CommitResultV2): boolean {
  if (result.kind === 'rolled_back') return result.recalled
  return result.kind === 'identity_conflict' && result.existing.kind === 'rolled_back'
}

function generationOutcome(result: CommitResultV2): CommitResultV2['kind'] {
  return result.kind === 'identity_conflict' ? result.existing.kind : result.kind
}

function isFactRecord(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function afterRollback(receipt: ReceiptV2): Step {
  const stop = receipt.responses[receipt.responses.length - 1]?.reply
  if (stop?.kind === 'conflict') {
    const reason = isFactRecord(stop.basis) ? stop.basis['reason'] : undefined
    if (typeof reason === 'string' && RETRIED.includes(reason)) return { kind: 'again' }
    if (reason === 'body-incomplete')
      return { kind: 'done', failure: unavailable('the request body was not whole at the commit') }
    if (reason === 'share-full')
      return {
        kind: 'done',
        failure: {
          kind: 'unavailable',
          dependency: 'model-capacity',
          diagnostic: 'the tenant share is full at the commit',
        },
      }
  }
  return {
    kind: 'done',
    failure: unavailable(`the model participant stopped the commit: ${stop?.kind ?? 'none'}`),
  }
}

function rejected(reason: CommitRejectReason): ModelFailure {
  return commitRejectionNature(reason) === 'temporary'
    ? unavailable(`storage rejected the commit: ${reason}`)
    : { kind: 'invalid', field: 'storage', reason }
}

class Generations {
  private readonly rolledBack = new Map<string, number>()

  first(key: string): number {
    return (this.rolledBack.get(key) ?? 0) + 1
  }

  saw(key: string, at: number, outcome: CommitResultV2['kind'] | QueryResultV2['kind']): void {
    if (outcome === 'committed') this.rolledBack.delete(key)
    else if (outcome === 'rolled_back' && at >= this.first(key)) this.rolledBack.set(key, at)
  }
}

class Unresolved {
  private readonly tenants = new Map<string, Map<ModelOperationId, Binding>>()
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  full(tenant: string, operation: ModelOperationId): boolean {
    const kept = this.tenants.get(tenant)
    return kept !== undefined && !kept.has(operation) && kept.size >= this.limit
  }

  of(tenant: string): ReadonlyMap<ModelOperationId, Binding> {
    return new Map(this.tenants.get(tenant) ?? [])
  }

  callsAfter(tenant: string, after: ModelCallId | null): ModelCallId[] {
    const calls = [...(this.tenants.get(tenant)?.values() ?? [])].map(binding => binding.call)
    return [...new Set(calls)].filter(call => after === null || call > after).sort()
  }

  add(tenant: string, operation: ModelOperationId, binding: Binding): void {
    const kept = this.tenants.get(tenant) ?? new Map<ModelOperationId, Binding>()
    kept.set(operation, binding)
    this.tenants.set(tenant, kept)
  }

  remove(tenant: string, operation: ModelOperationId): void {
    const kept = this.tenants.get(tenant)
    kept?.delete(operation)
    if (kept?.size === 0) this.tenants.delete(tenant)
  }
}

function mergePending(
  stored: PendingPage,
  unknown: readonly ModelCallId[],
  limit: number,
): ScanPage {
  const bound = stored.next
  const merged = [...new Set([...stored.calls, ...unknown])]
    .sort()
    .filter(call => bound === null || call <= bound)
  const calls = merged.slice(0, limit)
  const more = bound !== null || merged.length > limit
  return { calls, next: more ? (calls[calls.length - 1] ?? null) : null }
}

type Settled<T> =
  | Readonly<{ kind: 'done'; outcome: Outcome<T, ModelFailure> }>
  | Readonly<{ kind: 'again' }>
const done = <T>(outcome: Outcome<T, ModelFailure>): Settled<T> => ({ kind: 'done', outcome })

export function createSqlModelStorage(options: SqlModelStorageOptions): SqlModelStorage {
  const { rounds, unresolved: unresolvedLimit } = checkOptions(options)
  const { storage, domains, combination, limits } = options
  const unresolved = new Unresolved(unresolvedLimit)
  const generations = new Generations()
  const swept = new Set<string>()
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
  const generationsKey = (domain: DomainRef, operation: ModelOperationId): string =>
    JSON.stringify([
      domain.scope.kind === 'tenant' ? domain.scope.tenant : null,
      domain.transactionDomain,
      operation,
    ])

  async function freeGeneration(
    domain: DomainRef,
    operation: ModelOperationId,
  ): Promise<number | 'unknown' | 'committed'> {
    const key = generationsKey(domain, operation)
    let at = generations.first(key)
    let found = await storage.query(generation(domain, operation, at))
    while (found.kind === 'rolled_back') {
      generations.saw(key, at, found.kind)
      at += 1
      found = await storage.query(generation(domain, operation, at))
    }
    generations.saw(key, at, found.kind)
    if (found.kind === 'not_committed') return at
    return found.kind === 'not_recallable' ? 'unknown' : found.kind
  }

  async function settleUnresolved(domain: DomainRef, scope: CallScope): Promise<void> {
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

  function identityFor(domain: DomainRef, tenant: string, staged: Staged): Target | Step {
    if (staged.kind === 'publish') {
      const operation = `${staged.call.state.call}#read`
      return { identity: identityOf(domain, operation, `${operation}@${staged.expected}`) }
    }
    const { operation } = staged.write
    if (unresolved.full(tenant, operation))
      return { kind: 'done', failure: unavailable('too many operations with an unknown outcome') }
    const key = generationsKey(domain, operation)
    if (unresolved.of(tenant).has(operation)) return unknownStep(tenant, staged)
    return generationTarget(domain, operation, key, generations.first(key))
  }

  function generationTarget(
    domain: DomainRef,
    operation: ModelOperationId,
    key: string,
    at: number,
  ): Target {
    return {
      identity: generation(domain, operation, at),
      saw: outcome => generations.saw(key, at, outcome),
      next: () => generationTarget(domain, operation, key, at + 1),
    }
  }

  function afterCommit(
    result: CommitResultV2,
    tenant: string,
    staged: Staged,
    generational: boolean,
  ): Step {
    switch (result.kind) {
      case 'committed':
        return generational && result.recalled ? { kind: 'again' } : { kind: 'done', failure: null }
      case 'rolled_back':
        return afterRollback(result)
      case 'identity_conflict':
        return { kind: 'again' }
      case 'unknown':
        return unknownStep(tenant, staged)
      case 'rejected_before_accept':
        return result.reason === 'writer_not_current'
          ? unknownStep(tenant, staged)
          : { kind: 'done', failure: rejected(result.reason) }
    }
  }

  async function commitStaged(
    domain: DomainRef,
    tenant: string,
    staged: Staged,
    read: CallRead,
  ): Promise<Step> {
    const admitted = admittedBody(tenant, staged)
    if (admitted === null) return commitFacts(domain, tenant, staged, read, null)
    // Before a tenant's first admission in this process, delete the chunks no call owns: one
    // process writes the database, so none is in flight. A sweep that did not commit runs again.
    const sweep = !swept.has(tenant)
    const chunks = requestChunks(admitted.request, limits.requestChunkBytes)
    const [only] = chunks
    if (chunks.length === 1 && only !== undefined) {
      const body = { digest: admitted.digest, chunks: 1, inline: only, sweep }
      const step = await commitFacts(domain, tenant, staged, read, body)
      if (step.kind === 'done' && step.failure === null) swept.add(tenant)
      return step
    }
    const written = await putBody(domain, admitted, chunks, sweep)
    const step: Step =
      written !== null
        ? { kind: 'done', failure: written }
        : await commitFacts(domain, tenant, staged, read, {
            digest: admitted.digest,
            chunks: chunks.length,
            inline: null,
            sweep: false,
          })
    if (step.kind !== 'done' || step.failure !== null)
      await bodyCommit(domain, admitted.call, { intent: 'body-discard', ...refOf(admitted) })
    return step
  }

  async function commitFacts(
    domain: DomainRef,
    tenant: string,
    staged: Staged,
    read: CallRead,
    body: BodyManifest | null,
  ): Promise<Step> {
    const facts = encodedFacts(tenant, staged, read, limits.tenantResults, body)
    if ('failure' in facts) return { kind: 'done', failure: facts.failure }
    const first = identityFor(domain, tenant, staged)
    if ('kind' in first) return first
    for (let target = first; ;) {
      const result = await storage.commit({
        identity: target.identity,
        ...combination,
        commands: [{ participant: MODEL_PARTICIPANT, facts: facts.ok }],
      })
      target.saw?.(generationOutcome(result))
      if (target.next === undefined || !spent(result))
        return afterCommit(result, tenant, staged, target.next !== undefined)
      target = target.next()
    }
  }

  async function bodyCommit(
    domain: DomainRef,
    call: ModelCallId,
    facts: Readonly<Record<string, JsonValue>>,
  ): Promise<CommitResultV2> {
    const operation = `${call}#body`
    return storage.commit({
      identity: identityOf(domain, operation, `${operation}@${randomUUID()}`),
      ...combination,
      commands: [{ participant: MODEL_PARTICIPANT, facts }],
    })
  }

  async function putBody(
    domain: DomainRef,
    body: AdmittedBody,
    chunks: readonly string[],
    sweep: boolean,
  ): Promise<ModelFailure | null> {
    for (const [seq, text] of chunks.entries()) {
      const result = await bodyCommit(domain, body.call, {
        intent: 'body-chunk',
        ...refOf(body),
        seq,
        total: chunks.length,
        body: text,
        sweep: sweep && seq === 0,
      })
      if (result.kind === 'committed') {
        if (seq === 0) swept.add(body.tenant)
        continue
      }
      if (result.kind === 'rejected_before_accept' && result.reason !== 'writer_not_current')
        return rejected(result.reason)
      return unavailable(`the request body write did not commit: ${result.kind}`)
    }
    return null
  }

  async function attempt<T>(
    work: () => Outcome<T, ModelFailure>,
    scope: CallScope,
    domain: DomainOf,
  ): Promise<Settled<T>> {
    const ready = domain.kind === 'ready' ? domain.domain : null
    if (ready !== null) await settleUnresolved(ready, scope)
    const input = { tenant: scope.tenant, call: scope.call, operation: scope.operation ?? null }
    const read = await readCall(storage, domain, input)
    if ('failure' in read) return done(read)
    if (read.ok.binding !== null) unresolved.remove(scope.tenant, read.ok.binding.operation)
    const face = new Attempt(scope, read.ok, unresolved.of(scope.tenant))
    const outcome = runWork(work, face)
    const staged = face.staged
    if (staged === null) return done(outcome)
    if (ready === null) return done(fail(unavailable('the tenant has no registered domain')))
    const settled = await commitStaged(ready, scope.tenant, staged, read.ok)
    if (settled.kind === 'again') return settled
    return done(settled.failure === null ? outcome : fail(settled.failure))
  }

  async function run<T>(
    work: () => Outcome<T, ModelFailure>,
    scope?: RunScope,
  ): Promise<Outcome<T, ModelFailure>> {
    if (scope === undefined) return runWork(work, null)
    const { call } = scope
    if (call === undefined)
      return fail(unavailable('a run of this storage reads one call; the scope names none'))
    const domain = await domainOf(domains, scope.tenant)
    if ('failure' in domain) return domain
    for (let round = 1; round <= rounds; round += 1) {
      const settled = await attempt(work, { ...scope, call }, domain.ok)
      if (settled.kind === 'done') return settled.outcome
    }
    return fail(unavailable('every attempt of the run met a newer write'))
  }

  async function pending(
    tenant: string,
    after: string | null,
    limit: number,
  ): Promise<Outcome<ScanPage, ModelFailure>> {
    const from = after === null ? null : decodeModelCallId(after)
    if (from !== null && 'failure' in from)
      return fail({ kind: 'invalid', field: 'after', reason: 'scan-cursor' })
    const start = from === null ? null : from.ok
    const domain = await domainOf(domains, tenant)
    if ('failure' in domain) return domain
    const stored = await readPending(storage, domain.ok, { tenant, after: start, limit })
    if ('failure' in stored) return stored
    return succeed(mergePending(stored.ok, unresolved.callsAfter(tenant, start), limit))
  }

  return {
    limits,
    run,
    documents: tenant => active().documents(tenant),
    held: () => active().held(),
    readBody: async (tenant, call) => {
      const domain = await domainOf(domains, tenant)
      return 'failure' in domain ? domain : readRequestBody(storage, domain.ok, { tenant, call })
    },
    commit: (tenant, write) => active().commit(tenant, write),
    publish: (tenant, call) => active().publish(tenant, call),
    pending,
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

class FactError extends Error {}

const columnNames = (table: Table): readonly string[] => table.columns.map(item => item.name)

function cellValue(table: Table, row: Row, name: string): SqlValue {
  const cell = row[name] ?? null
  const kind = table.columns.find(item => item.name === name)?.kind
  if (kind === 'int' && typeof cell === 'number') return BigInt(cell)
  return kind === 'json' && typeof cell === 'string' ? packText(cell) : cell
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

function shareOf(raw: JsonValue | undefined): number | null {
  if (raw === null) return null
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) throw new FactError('share')
  return raw
}

function count(raw: JsonValue | undefined, name: string, least: number): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < least)
    throw new FactError(name)
  return raw
}

function manifestOf(raw: JsonValue | undefined): BodyManifest | null {
  if (raw === null) return null
  if (!isFactRecord(raw)) throw new FactError('body')
  const inline = raw['inline']
  if (inline !== null && typeof inline !== 'string') throw new FactError('body.inline')
  const chunks = count(raw['chunks'], 'body.chunks', 1)
  if (inline !== null && chunks !== 1) throw new FactError('body.inline')
  const sweep = raw['sweep']
  if (typeof sweep !== 'boolean') throw new FactError('body.sweep')
  return { digest: text(raw['digest'], 'body.digest'), chunks, inline, sweep }
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
    body: manifestOf(facts['body']),
  }
}

const stop = (reason: string): ParticipantReply => ({ kind: 'conflict', basis: { reason } })

function overShare(port: ParticipantPort, tenant: string, share: number): boolean {
  const held = port.execute(HELD_CALLS_SQL, [tenant]).rows[0]?.[0] ?? 0
  if (typeof held !== 'number' && typeof held !== 'bigint')
    throw new Error('the held count is not an integer')
  return BigInt(held) > BigInt(share)
}

type WriteFacts = ReturnType<typeof writeFacts>

function writeCall(port: ParticipantPort, facts: WriteFacts): string | null {
  const { tenant, call, expected, row } = facts
  if (row === null) return null
  if (expected === null)
    return insert(port, TABLES.call, row, 'ON CONFLICT (tenant, call) DO NOTHING') === 1n
      ? null
      : 'call-exists'
  const names = columnNames(TABLES.call).filter(name => name !== 'tenant' && name !== 'call')
  const updated = port.execute(
    `UPDATE md_call SET ${names.map(name => `${name} = ?`).join(', ')}
      WHERE tenant = ? AND call = ? AND row_version = ?`,
    [...names.map(name => cellValue(TABLES.call, row, name)), tenant, call, BigInt(expected)],
  )
  return updated.changes === 1n ? null : 'version'
}

function writeChildren(port: ParticipantPort, facts: WriteFacts): void {
  const { tenant, call } = facts
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
}

function bodyWhole(port: ParticipantPort, facts: WriteFacts, body: BodyManifest): boolean {
  const found = port.execute(
    'SELECT COUNT(*) FROM md_request WHERE tenant = ? AND call = ? AND digest = ? AND total = ?',
    [facts.tenant, facts.call, body.digest, BigInt(body.chunks)],
  ).rows[0]?.[0]
  return (
    found !== undefined &&
    found !== null &&
    BigInt(found as bigint | number) === BigInt(body.chunks)
  )
}

function writeBody(port: ParticipantPort, facts: WriteFacts): string | null {
  const { tenant, call, expected, row } = facts
  if (row === null) return null
  if (expected === null) {
    if (facts.body === null) throw new FactError('body')
    if (row['request_digest'] !== facts.body.digest) throw new FactError('body.digest')
    if (facts.body.sweep) sweepBodies(port, tenant)
    if (facts.body.inline !== null)
      insert(
        port,
        TABLES.request,
        { tenant, call, digest: facts.body.digest, seq: 0, total: 1, body: facts.body.inline },
        'ON CONFLICT (tenant, call, digest, seq) DO NOTHING',
      )
    return bodyWhole(port, facts, facts.body) ? null : 'body-incomplete'
  }
  if (row['request'] === null)
    port.execute('DELETE FROM md_request WHERE tenant = ? AND call = ?', [tenant, call])
  return null
}

function write(port: ParticipantPort, facts: WriteFacts): ParticipantReply {
  const bound =
    facts.binding === null ||
    insert(port, TABLES.operation, facts.binding, 'ON CONFLICT (tenant, operation) DO NOTHING') ===
      1n
  if (!bound) return stop('operation-bound')
  const refused = writeCall(port, facts)
  if (refused !== null) return stop(refused)
  writeChildren(port, facts)
  const body = writeBody(port, facts)
  if (body !== null) return stop(body)
  if (facts.share !== null && overShare(port, facts.tenant, facts.share)) return stop('share-full')
  return { kind: 'participated', response: { version: nextVersion(facts.expected) } }
}

const stored: ParticipantReply = { kind: 'participated', response: {} }

const OWNED_SQL = `SELECT 1 FROM md_call c
  WHERE c.tenant = md_request.tenant AND c.call = md_request.call
    AND c.request_digest = md_request.digest AND c.request IS NOT NULL`

function putChunk(
  port: ParticipantPort,
  facts: Readonly<Record<string, JsonValue>>,
): ParticipantReply {
  const total = count(facts['total'], 'total', 1)
  const seq = count(facts['seq'], 'seq', 0)
  if (seq >= total) throw new FactError('seq')
  const body = facts['body']
  if (typeof body !== 'string') throw new FactError('body')
  const row = {
    tenant: text(facts['tenant'], 'tenant'),
    call: text(facts['call'], 'call'),
    digest: text(facts['digest'], 'digest'),
    seq,
    total,
    body,
  }
  if (facts['sweep'] === true) sweepBodies(port, row.tenant)
  insert(port, TABLES.request, row, 'ON CONFLICT (tenant, call, digest, seq) DO NOTHING')
  return stored
}

function discardBody(
  port: ParticipantPort,
  facts: Readonly<Record<string, JsonValue>>,
): ParticipantReply {
  port.execute(
    `DELETE FROM md_request WHERE tenant = ? AND call = ? AND digest = ? AND NOT EXISTS (${OWNED_SQL})`,
    [text(facts['tenant'], 'tenant'), text(facts['call'], 'call'), text(facts['digest'], 'digest')],
  )
  return stored
}

function sweepBodies(port: ParticipantPort, tenant: string): void {
  port.execute(`DELETE FROM md_request WHERE tenant = ? AND NOT EXISTS (${OWNED_SQL})`, [tenant])
}

const participant: ParticipantModule = {
  participant: MODEL_PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    try {
      switch (facts['intent']) {
        case 'write':
          return write(port, writeFacts(facts))
        case 'body-chunk':
          return putChunk(port, facts)
        case 'body-discard':
          return discardBody(port, facts)
        default:
          return { kind: 'unsupported', basis: { reason: 'the facts name no known intent' } }
      }
    } catch (error) {
      if (error instanceof FactError)
        return { kind: 'unsupported', basis: { reason: error.message } }
      throw error
    }
  },
}
export default participant
