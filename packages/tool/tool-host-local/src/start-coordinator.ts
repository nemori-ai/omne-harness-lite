// The local start coordinator (G5): the start ordering domain of P04 for one machine. Every
// operation runs inside its tenant's serial section and reads and writes one `host` domain of
// the ledger store per tenant, so a permit, an acceptance, a rejection, an exclusion and a guard
// invalidation are ordered twice: by the section and by the domain revision. A permit is stored
// when it is issued and carries the revision of each guard it saw; consume accepts only the
// stored permit, once, and only while every guard keeps that revision. An invalidation returns its
// evidence only after its commit, so an invalidation that returned before a consume is always
// seen by it (P04: an invalidation that holds first forbids the start).
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  isTenantShape,
  recordKey,
  type AccessVerdict,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type LedgerWrite,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedToolRequest,
  type ToolCallId,
  type ToolExecutionRef,
  type ToolFailure,
  type ToolOperationId,
  type ToolRevision,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolRevision,
  describedAdoption,
  judgeFixedToolRequest,
  type StartGuard,
  type StartPermit,
  type StartProgress,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'

type TenantId = LedgerDomain['tenant']

/** The owner named in every evidence the coordinator mints. */
export const START_COORDINATOR_OWNER = '@omne-harness/tool-host-local'

/** The identity of this coordinator, named in its permits. */
export const startCoordinatorAdoption: Adoption = describedAdoption({
  owner: START_COORDINATOR_OWNER,
  name: 'local-start-coordinator',
  revision: '1',
})

/** The key of the host domain the coordinator keeps per tenant. */
export const START_COORDINATOR_DOMAIN_KEY = 'start-coordinator'

/** A resource whose current revision guards a start; its owner invalidates it to refuse starts. */
export type GuardResource = Readonly<{ owner: string; resource: string }>

/**
 * The qualification question the coordinator asks before any read or write. `start` covers
 * prepare, consume, inspect and exclude for one call; `invalidate` is asked without a call,
 * because a guard belongs to a resource of the tenant, not to a call.
 */
export interface StartCoordinatorAccess<P> {
  qualify(
    input: Readonly<{
      principal: P
      tenant: TenantId
      call: ToolCallId | null
      action: 'start' | 'invalidate'
    }>,
  ): Promise<AccessVerdict>
}

export type LocalStartCoordinatorInput<P, B extends ContentBlock = ContentBlock> = Readonly<{
  /**
   * The ledger store whose `host` domain keeps the acceptance ledger: the same store the ledger
   * of the runtime uses, so one durable provider keeps both.
   */
  store: ToolLedgerStore<B>
  /** Proves the principal, the tenant and the call; a forged tenant is denied. */
  access: StartCoordinatorAccess<P>
  /** The guard resources that apply to a request; each becomes one guard of its permit. */
  guardsOf: (request: FixedToolRequest) => readonly GuardResource[]
  /** How many times a revision conflict is re-read and re-decided. */
  commitAttempts: number
}>

// ---------------------------------------------------------------------------------------------
// The records of the host domain
// ---------------------------------------------------------------------------------------------

type GuardRecord = Readonly<{
  kind: 'guard'
  owner: string
  resource: string
  revision: string
  /** The latest invalidation that set this revision. */
  operation: ToolOperationId | null
  evidence: DurableEvidence | null
}>
/** The permanent binding of an invalidation operation to its full guard input and first evidence. */
type InvalidationRecord = Readonly<{
  kind: 'invalidation'
  operation: ToolOperationId
  digest: string
  evidence: DurableEvidence
}>
/** The one permit of a start that consume may accept. A newer permit replaces it. */
type PermitRecord = Readonly<{
  kind: 'permit'
  call: ToolCallId
  start: ToolOperationId
  digest: string
}>
type AcceptanceRecord = Readonly<{
  kind: 'acceptance'
  call: ToolCallId
  start: ToolOperationId
  permit: string
  executorReceipt: DurableEvidence
  acceptance: DurableEvidence
}>
type RejectionRecord = Readonly<{
  kind: 'rejection'
  call: ToolCallId
  /** The start the rejection applies to, or null for the whole pending invocation of the call. */
  start: ToolOperationId | null
  operation: ToolOperationId
  reason: string
  evidence: DurableEvidence
}>
/** The input and returned evidence of each successful call exclusion operation. */
type ExclusionOperationRecord = Readonly<{
  kind: 'exclusion-operation'
  call: ToolCallId
  operation: ToolOperationId
  reason: string
  evidence: DurableEvidence
}>
/** The proof that every permit of the start issued before it can no longer be consumed. */
type ExclusionRecord = Readonly<{
  kind: 'exclusion'
  call: ToolCallId
  start: ToolOperationId
  evidence: DurableEvidence
}>
type CoordinatorRecord =
  | GuardRecord
  | InvalidationRecord
  | PermitRecord
  | AcceptanceRecord
  | RejectionRecord
  | ExclusionOperationRecord
  | ExclusionRecord

/** The records of the domain by key, with the domain revision. */
type Snapshot = Readonly<{
  revision: ToolRevision
  records: ReadonlyMap<string, CoordinatorRecord>
}>

// Keys are JSON texts of their parts, so an identity text that holds a separator cannot reach the
// key of another record. A start operation is unique per call only (P01), so its keys name both.
const guardKey = (guard: GuardResource): string =>
  `guard:${JSON.stringify([guard.owner, guard.resource])}`
const invalidationKey = (operation: ToolOperationId): string =>
  `invalidation:${JSON.stringify([operation])}`
const startKey = (
  kind: 'permit' | 'acceptance' | 'exclusion' | 'rejection',
  call: ToolCallId,
  start: ToolOperationId,
): string => `${kind}:${JSON.stringify([call, start])}`
const exclusionOperationKey = (call: ToolCallId, operation: ToolOperationId): string =>
  `exclusion-operation:${JSON.stringify([call, operation])}`
const callRejectionKey = (call: ToolCallId): string => `rejection:${JSON.stringify([call])}`

function keyOf(record: CoordinatorRecord): string {
  switch (record.kind) {
    case 'guard':
      return guardKey(record)
    case 'invalidation':
      return invalidationKey(record.operation)
    case 'exclusion-operation':
      return exclusionOperationKey(record.call, record.operation)
    case 'rejection':
      return record.start === null
        ? callRejectionKey(record.call)
        : startKey('rejection', record.call, record.start)
    case 'permit':
    case 'acceptance':
    case 'exclusion':
      return startKey(record.kind, record.call, record.start)
    default: {
      const exhaustive: never = record
      return exhaustive
    }
  }
}

const RECORD_FIELDS: Readonly<Record<CoordinatorRecord['kind'], readonly string[]>> = {
  guard: ['owner', 'resource', 'revision'],
  invalidation: ['operation', 'digest'],
  'exclusion-operation': ['call', 'operation', 'reason'],
  permit: ['call', 'start', 'digest'],
  acceptance: ['call', 'start', 'permit'],
  rejection: ['call', 'operation', 'reason'],
  exclusion: ['call', 'start'],
}

/**
 * A host record the coordinator wrote: its kind and the text fields that kind needs. The store
 * interprets none of them, so a value of another shape is a defect of the store, not a record.
 */
function parseRecord(value: unknown): CoordinatorRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const kind: unknown = Reflect.get(value, 'kind')
  if (typeof kind !== 'string' || !Object.hasOwn(RECORD_FIELDS, kind)) return null
  const fields = RECORD_FIELDS[kind as CoordinatorRecord['kind']]
  // The kind and its text fields were checked; the coordinator wrote the rest of the record.
  return fields.every(field => filledText(Reflect.get(value, field)))
    ? (value as CoordinatorRecord)
    : null
}

function filledText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function revisionOf(text: string): ToolRevision {
  const decoded = decodeToolRevision(text)
  if ('failure' in decoded) throw new Error(`the coordinator minted an illegal revision: ${text}`)
  return decoded.ok
}

function nextRevision(revision: ToolRevision): ToolRevision {
  return revisionOf((BigInt(revision) + 1n).toString())
}

/** An evidence of one record of the host domain, committed at `revision`. */
function mint(
  tenant: TenantId,
  key: string,
  revision: ToolRevision,
  content: unknown,
): DurableEvidence {
  const place = [tenant.organization.text, tenant.account.text, key]
  return Object.freeze({
    owner: START_COORDINATOR_OWNER,
    record: `start-coordinator:${JSON.stringify(place)}`,
    revision,
    digest: canonicalDigest({ place, content }),
  })
}

/** The first revision of a guard that was never invalidated. */
const INITIAL_GUARD_REVISION = '0'

function guardOf(snapshot: Snapshot, resource: GuardResource): GuardRecord {
  const found = snapshot.records.get(guardKey(resource))
  if (found?.kind === 'guard') return found
  return {
    kind: 'guard',
    owner: resource.owner,
    resource: resource.resource,
    revision: INITIAL_GUARD_REVISION,
    operation: null,
    evidence: null,
  }
}

/** The acceptance or the rejection of a start, or null while the start is undecided. */
function progressOf(
  snapshot: Snapshot,
  call: ToolCallId,
  start: ToolOperationId,
): Extract<StartProgress, { kind: 'started' | 'rejected' }> | null {
  const accepted = snapshot.records.get(startKey('acceptance', call, start))
  if (accepted?.kind === 'acceptance') return { kind: 'started', acceptance: accepted.acceptance }
  const rejected =
    snapshot.records.get(startKey('rejection', call, start)) ??
    snapshot.records.get(callRejectionKey(call))
  if (rejected?.kind === 'rejection')
    return { kind: 'rejected', reason: rejected.reason, exclusion: rejected.evidence }
  return null
}

// ---------------------------------------------------------------------------------------------
// Boundary checks
// ---------------------------------------------------------------------------------------------

function invalid(field: string, reason: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'invalid', field, reason })
}

function unavailable(diagnostic: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency: 'start-ledger', diagnostic })
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** Reads `keys` of `value` as filled texts, or names the first key that is not one. */
function texts<K extends string>(
  value: unknown,
  keys: readonly K[],
  field: string,
): Outcome<Readonly<Record<K, string>>, ToolFailure> {
  if (!isObject(value)) return invalid(field, 'type')
  const out: Partial<Record<K, string>> = {}
  for (const key of keys) {
    const member: unknown = Reflect.get(value, key)
    if (!filledText(member)) return invalid(`${field}.${key}`, 'type')
    out[key] = member
  }
  // Every key was written above with a filled text.
  return succeed(out as Record<K, string>)
}

function judgeEvidence(value: unknown, field: string): Outcome<DurableEvidence, ToolFailure> {
  return texts(value, ['owner', 'record', 'revision', 'digest'], field)
}

/** Parses only contract fields so canonical identity excludes unrelated input properties. */
function judgeGuard(value: unknown): Outcome<StartGuard, ToolFailure> {
  if (!isObject(value)) return invalid('guard', 'type')
  const guard = texts(value, ['owner', 'resource', 'revision'], 'guard')
  if ('failure' in guard) return guard
  const evidence = judgeEvidence(Reflect.get(value, 'evidence'), 'guard.evidence')
  if ('failure' in evidence) return evidence
  const scope: unknown = Reflect.get(value, 'scope')
  if (!isObject(scope)) return invalid('guard.scope', 'type')
  const kind: unknown = Reflect.get(scope, 'kind')
  if (kind === 'resource') return succeed({ ...guard.ok, evidence: evidence.ok, scope: { kind } })
  if (kind !== 'program') return invalid('guard.scope.kind', 'type')
  const parent = decodeToolCallId(Reflect.get(scope, 'parent'))
  if ('failure' in parent) return invalid('guard.scope.parent', parent.failure.reason)
  const gate: unknown = Reflect.get(scope, 'gate')
  if (gate === 'open')
    return succeed({ ...guard.ok, evidence: evidence.ok, scope: { kind, parent: parent.ok, gate } })
  if (gate !== 'closing' && gate !== 'closed') return invalid('guard.scope.gate', 'type')
  const closure = decodeToolOperationId(Reflect.get(scope, 'closure'))
  if ('failure' in closure) return invalid('guard.scope.closure', closure.failure.reason)
  const applies: unknown = Reflect.get(scope, 'applies')
  if (applies !== 'all-children' && applies !== 'foreground-and-unadmitted')
    return invalid('guard.scope.applies', 'type')
  const cutoff = judgeEvidence(Reflect.get(scope, 'cutoff'), 'guard.scope.cutoff')
  if ('failure' in cutoff) return cutoff
  return succeed({
    ...guard.ok,
    evidence: evidence.ok,
    scope: { kind, parent: parent.ok, gate, closure: closure.ok, applies, cutoff: cutoff.ok },
  })
}

function judgeExecution(value: unknown, field: string): Outcome<ToolExecutionRef, ToolFailure> {
  if (!isObject(value)) return invalid(field, 'type')
  const tenant: unknown = Reflect.get(value, 'tenant')
  if (!isTenantShape(tenant)) return invalid(`${field}.tenant`, 'type')
  const call = decodeToolCallId(Reflect.get(value, 'call'))
  if ('failure' in call) return invalid(`${field}.call`, call.failure.reason)
  const instance = decodeToolInstanceId(Reflect.get(value, 'instance'))
  if ('failure' in instance) return invalid(`${field}.instance`, instance.failure.reason)
  const generation: unknown = Reflect.get(value, 'generation')
  if (!filledText(generation)) return invalid(`${field}.generation`, 'type')
  return succeed({ tenant, call: call.ok, instance: instance.ok, generation })
}

/** A first-start record: the start kind, its operation, its executor adoption and execution. */
function judgeStart(
  value: unknown,
  field: string,
): Outcome<Extract<ToolStartRecord, { kind: 'start' }>, ToolFailure> {
  if (!isObject(value)) return invalid(field, 'type')
  if (Reflect.get(value, 'kind') !== 'start') return invalid(`${field}.kind`, 'value')
  const operation = decodeToolOperationId(Reflect.get(value, 'operation'))
  if ('failure' in operation) return invalid(`${field}.operation`, operation.failure.reason)
  const executor = texts(
    Reflect.get(value, 'executor'),
    ['owner', 'name', 'revision', 'digest'],
    `${field}.executor`,
  )
  if ('failure' in executor) return executor
  const execution = judgeExecution(Reflect.get(value, 'execution'), `${field}.execution`)
  if ('failure' in execution) return execution
  return succeed({
    kind: 'start',
    operation: operation.ok,
    executor: executor.ok,
    execution: execution.ok,
  })
}

type CallInput<P> = Readonly<{ principal: P; tenant: TenantId; call: ToolCallId }>

/** Principal, tenant and call. A missing or malformed tenant is denied, like a foreign one. */
function judgeCallInput<P>(input: unknown): Outcome<CallInput<P>, ToolFailure> {
  if (!isObject(input)) return invalid('input', 'type')
  const tenant: unknown = Reflect.get(input, 'tenant')
  if (!isTenantShape(tenant) || !('principal' in input))
    return fail({ kind: 'denied', action: 'start' })
  const call = decodeToolCallId(Reflect.get(input, 'call'))
  if ('failure' in call) return invalid('call', call.failure.reason)
  // The principal is the caller's type; the access guard judges it.
  return succeed({ principal: Reflect.get(input, 'principal') as P, tenant, call: call.ok })
}

type PermitGuard = Readonly<{ owner: string; resource: string; revision: string }>

/** The parts of a permit the coordinator reads back, and the digest it stored them under. */
type PermitInput = Readonly<{
  start: Extract<ToolStartRecord, { kind: 'start' }>
  guards: readonly PermitGuard[]
  digest: string
}>

/** The digest a permit is stored under: its start, its guard revisions and its request. */
function permitDigest(
  call: ToolCallId,
  start: ToolStartRecord,
  guards: readonly PermitGuard[],
  request: DurableEvidence,
): string {
  return canonicalDigest({
    call,
    start,
    guards: guards.map(({ owner, resource, revision }) => ({ owner, resource, revision })),
    request,
  })
}

function judgePermit(value: unknown, call: ToolCallId): Outcome<PermitInput, ToolFailure> {
  if (!isObject(value)) return invalid('permit', 'type')
  const start = judgeStart(Reflect.get(value, 'start'), 'permit.start')
  if ('failure' in start) return start
  const request = judgeEvidence(Reflect.get(value, 'request'), 'permit.request')
  if ('failure' in request) return request
  const guards: unknown = Reflect.get(value, 'guards')
  if (!Array.isArray(guards)) return invalid('permit.guards', 'type')
  const read: PermitGuard[] = []
  for (const [index, guard] of guards.entries()) {
    const judged = texts(guard, ['owner', 'resource', 'revision'], `permit.guards[${index}]`)
    if ('failure' in judged) return judged
    read.push(judged.ok)
  }
  return succeed({
    start: start.ok,
    guards: read,
    digest: permitDigest(call, start.ok, read, request.ok),
  })
}

// ---------------------------------------------------------------------------------------------
// The coordinator
// ---------------------------------------------------------------------------------------------

type Decision<T> =
  | Readonly<{ kind: 'reply'; outcome: Outcome<T, ToolFailure> }>
  | Readonly<{
      kind: 'commit'
      puts: readonly CoordinatorRecord[]
      deletes?: readonly string[]
      value: T
    }>

function reply<T>(outcome: Outcome<T, ToolFailure>): Decision<T> {
  return { kind: 'reply', outcome }
}

function hostRecord<B extends ContentBlock>(
  key: string,
  value: CoordinatorRecord | null,
): LedgerRecord<B> {
  return { kind: 'host', host: { key, value } }
}

/** The store writes of a decision; a deleted key is addressed as the store keys a host record. */
function writesOf<B extends ContentBlock>(
  decision: Extract<Decision<unknown>, { kind: 'commit' }>,
): LedgerWrite<B>[] {
  return [
    ...(decision.deletes ?? []).map(key => ({
      kind: 'delete' as const,
      key: recordKey(hostRecord<B>(key, null)),
    })),
    ...decision.puts.map(record => ({
      kind: 'put' as const,
      record: hostRecord<B>(keyOf(record), record),
    })),
  ]
}

/** The host domain as the coordinator reads it. Any other record is a defect of the store. */
function snapshotOf<B extends ContentBlock>(
  read: Extract<LedgerRead<B>, { kind: 'complete' }>,
): Outcome<Snapshot, ToolFailure> {
  const records = new Map<string, CoordinatorRecord>()
  for (const record of read.records) {
    const parsed = record.kind === 'host' ? parseRecord(record.host.value) : null
    if (parsed === null) return unavailable('the start ledger holds a record it did not write')
    records.set(keyOf(parsed), parsed)
  }
  return succeed({ revision: read.revision, records })
}

/**
 * Builds the coordinator. It implements `ToolStartAuthority` for one process: `prepare` stores
 * and returns a permit with the current revision of every guard of the request; `consume`
 * accepts the stored permit once, and only while every guard keeps its revision; `inspect`
 * answers the acceptance or the rejection, and otherwise withdraws the outstanding permit before
 * it answers `not-started`; `invalidate` advances a guard and returns its evidence after the
 * commit; `exclude` rejects the whole pending invocation of a call that has no acceptance.
 * An unreadable ledger answers `unavailable`, never an acceptance or a rejection.
 */
export function createLocalStartCoordinator<P, B extends ContentBlock = ContentBlock>(
  input: LocalStartCoordinatorInput<P, B>,
): ToolStartAuthority<P> {
  const { store, access, guardsOf, commitAttempts } = input
  if (!Number.isSafeInteger(commitAttempts) || commitAttempts <= 0)
    throw new TypeError('commitAttempts: range')
  const sections = new Map<string, Promise<void>>()

  /** Each tenant keeps one queue; an old tail cannot remove a newer queued turn. */
  const serial = <T>(tenant: TenantId, work: () => Promise<T>): Promise<T> => {
    const key = JSON.stringify([tenant.organization.text, tenant.account.text])
    const turn = (sections.get(key) ?? Promise.resolve()).then(work)
    const release = () => {
      if (sections.get(key) === tail) sections.delete(key)
    }
    const tail = turn.then(release, release)
    sections.set(key, tail)
    return turn
  }

  const domain = (tenant: TenantId): LedgerDomain => ({
    kind: 'host',
    tenant,
    key: START_COORDINATOR_DOMAIN_KEY,
  })

  const qualify = async (
    principal: P,
    tenant: TenantId,
    call: ToolCallId | null,
    action: 'start' | 'invalidate',
  ): Promise<Outcome<void, ToolFailure>> => {
    let verdict: AccessVerdict
    try {
      verdict = await access.qualify({ principal, tenant, call, action })
    } catch {
      return fail({
        kind: 'unavailable',
        dependency: 'access-guard',
        diagnostic: 'access-guard threw an exception; its message is not reported',
      })
    }
    if (verdict.kind === 'allowed') return succeed(undefined)
    if (verdict.kind === 'denied') return fail({ kind: 'denied', action })
    return fail({ kind: 'unavailable', dependency: 'access-guard', diagnostic: verdict.diagnostic })
  }

  const read = async (tenant: TenantId): Promise<Outcome<Snapshot, ToolFailure>> => {
    let result: Awaited<ReturnType<typeof store.read>>
    try {
      result = await store.read(domain(tenant))
    } catch {
      return unavailable('the start ledger threw on read')
    }
    if (result.kind === 'unavailable') return unavailable(result.diagnostic)
    return snapshotOf(result)
  }

  /** Reads, decides and commits by revision inside the serial section. */
  const transact = <T>(
    tenant: TenantId,
    decide: (snapshot: Snapshot, revision: ToolRevision) => Decision<T>,
    unknown: (diagnostic: string) => Outcome<T, ToolFailure>,
  ): Promise<Outcome<T, ToolFailure>> =>
    serial(tenant, async () => {
      for (let attempt = 0; attempt < commitAttempts; attempt += 1) {
        const snapshot = await read(tenant)
        if ('failure' in snapshot) return snapshot
        const revision = nextRevision(snapshot.ok.revision)
        const decision = decide(snapshot.ok, revision)
        if (decision.kind === 'reply') return decision.outcome
        let committed: Awaited<ReturnType<typeof store.commit>>
        try {
          committed = await store.commit({
            domain: domain(tenant),
            expected: snapshot.ok.revision,
            revision,
            writes: writesOf<B>(decision),
          })
        } catch {
          return unknown('the start ledger threw on commit')
        }
        if (committed.kind === 'committed') return succeed(decision.value)
        if (committed.kind === 'unknown') return unknown(committed.diagnostic)
        if (committed.kind === 'unavailable') return unavailable(committed.diagnostic)
      }
      return unavailable(`${commitAttempts} revision conflicts in a row`)
    })

  const unknownProgress = (diagnostic: string): Outcome<StartProgress, ToolFailure> =>
    succeed({ kind: 'unknown', diagnostic })

  /** The checked call, start and qualification of a call-scoped operation. */
  const callEntry = async (raw: unknown): Promise<Outcome<CallInput<P>, ToolFailure>> => {
    const checked = judgeCallInput<P>(raw)
    if ('failure' in checked) return checked
    const { principal, tenant, call } = checked.ok
    const allowed = await qualify(principal, tenant, call, 'start')
    return 'failure' in allowed ? allowed : checked
  }

  const prepare: ToolStartAuthority<P>['prepare'] = async raw => {
    const checked = await callEntry(raw)
    if ('failure' in checked) return checked
    const start = judgeStart(Reflect.get(raw, 'start'), 'start')
    if ('failure' in start) return start
    const request = judgeFixedToolRequest(Reflect.get(raw, 'request'))
    if ('failure' in request)
      return invalid(`request.${request.failure.field}`, request.failure.reason)
    const { tenant, call } = checked.ok
    const resources = guardsOf(request.ok)
    const inputDigest = canonicalDigest(request.ok)
    return transact<StartPermit>(
      tenant,
      (snapshot, revision) => {
        const guards: StartGuard[] = resources.map(resource => {
          const guard = guardOf(snapshot, resource)
          return {
            owner: guard.owner,
            resource: guard.resource,
            revision: guard.revision,
            evidence:
              guard.evidence ?? mint(tenant, guardKey(resource), revision, { initial: true }),
            scope: { kind: 'resource' },
          }
        })
        const key = startKey('permit', call, start.ok.operation)
        const evidence = mint(tenant, key, revision, { guards, request: inputDigest })
        const permit: StartPermit = {
          tenant,
          call,
          operation: start.ok.operation,
          adoption: startCoordinatorAdoption,
          inputDigest,
          start: start.ok,
          guards,
          request: evidence,
        }
        const stored: PermitRecord = {
          kind: 'permit',
          call,
          start: start.ok.operation,
          digest: permitDigest(call, start.ok, guards, evidence),
        }
        return { kind: 'commit', puts: [stored], value: permit }
      },
      diagnostic => unavailable(`the permit was not confirmed: ${diagnostic}`),
    )
  }

  const consume: ToolStartAuthority<P>['consume'] = async raw => {
    const checked = await callEntry(raw)
    if ('failure' in checked) return checked
    const { tenant, call } = checked.ok
    const permit = judgePermit(Reflect.get(raw, 'permit'), call)
    if ('failure' in permit) return permit
    const receipt = judgeEvidence(Reflect.get(raw, 'executorReceipt'), 'executorReceipt')
    if ('failure' in receipt) return receipt
    const start = permit.ok.start.operation
    return transact<StartProgress>(
      tenant,
      (snapshot, revision) => {
        const known = progressOf(snapshot, call, start)
        if (known !== null) return reply(succeed(known))
        const stored = snapshot.records.get(startKey('permit', call, start))
        if (stored?.kind !== 'permit' || stored.digest !== permit.ok.digest) {
          const excluded = snapshot.records.get(startKey('exclusion', call, start))
          return excluded?.kind === 'exclusion'
            ? reply(succeed({ kind: 'not-started', exclusion: excluded.evidence }))
            : reply(invalid('permit', 'not-issued'))
        }
        const moved = permit.ok.guards.find(
          guard => guardOf(snapshot, guard).revision !== guard.revision,
        )
        if (moved !== undefined) {
          const reason = `guard ${moved.owner}/${moved.resource} was invalidated before the start`
          const key = startKey('rejection', call, start)
          const evidence = mint(tenant, key, revision, { reason, permit: permit.ok.digest })
          const rejection: RejectionRecord = {
            kind: 'rejection',
            call,
            start,
            operation: start,
            reason,
            evidence,
          }
          return {
            kind: 'commit',
            puts: [rejection],
            deletes: [keyOf(stored)],
            value: { kind: 'rejected', reason, exclusion: evidence },
          }
        }
        const key = startKey('acceptance', call, start)
        const acceptance = mint(tenant, key, revision, {
          permit: permit.ok.digest,
          executorReceipt: receipt.ok,
        })
        const accepted: AcceptanceRecord = {
          kind: 'acceptance',
          call,
          start,
          permit: permit.ok.digest,
          executorReceipt: receipt.ok,
          acceptance,
        }
        return {
          kind: 'commit',
          puts: [accepted],
          deletes: [keyOf(stored)],
          value: { kind: 'started', acceptance },
        }
      },
      unknownProgress,
    )
  }

  const inspect: ToolStartAuthority<P>['inspect'] = async raw => {
    const checked = await callEntry(raw)
    if ('failure' in checked) return checked
    const start = judgeStart(Reflect.get(raw, 'start'), 'start')
    if ('failure' in start) return start
    const { tenant, call } = checked.ok
    const operation = start.ok.operation
    return transact<StartProgress>(
      tenant,
      (snapshot, revision) => {
        const known = progressOf(snapshot, call, operation)
        if (known !== null) return reply(succeed(known))
        const permit = snapshot.records.get(startKey('permit', call, operation))
        const excluded = snapshot.records.get(startKey('exclusion', call, operation))
        if (permit === undefined && excluded?.kind === 'exclusion')
          return reply(succeed({ kind: 'not-started', exclusion: excluded.evidence }))
        // Neither accepted nor rejected: a permit issued before this answer must not be consumed
        // after it, so the answer is given only once the permit is withdrawn (P04 not-started).
        const key = startKey('exclusion', call, operation)
        const evidence = mint(tenant, key, revision, { excluded: true })
        const marker: ExclusionRecord = { kind: 'exclusion', call, start: operation, evidence }
        return {
          kind: 'commit',
          puts: [marker],
          deletes: permit === undefined ? [] : [keyOf(permit)],
          value: { kind: 'not-started', exclusion: evidence },
        }
      },
      unknownProgress,
    )
  }

  const invalidate: ToolStartAuthority<P>['invalidate'] = async raw => {
    if (!isObject(raw)) return invalid('input', 'type')
    const tenant: unknown = Reflect.get(raw, 'tenant')
    if (!isTenantShape(tenant) || !('principal' in raw))
      return fail({ kind: 'denied', action: 'invalidate' })
    const operation = decodeToolOperationId(Reflect.get(raw, 'operation'))
    if ('failure' in operation) return invalid('operation', operation.failure.reason)
    const target = judgeGuard(Reflect.get(raw, 'guard'))
    if ('failure' in target) return target
    // The principal is the caller's type; the access guard judges it.
    const principal = Reflect.get(raw, 'principal') as P
    const allowed = await qualify(principal, tenant, null, 'invalidate')
    if ('failure' in allowed) return allowed
    const digest = canonicalDigest(target.ok)
    return transact<DurableEvidence>(
      tenant,
      (snapshot, revision) => {
        const existing = snapshot.records.get(invalidationKey(operation.ok))
        if (existing?.kind === 'invalidation') {
          if (existing.digest !== digest)
            return reply(fail({ kind: 'conflict', operation: operation.ok }))
          return reply(succeed(existing.evidence))
        }
        const current = guardOf(snapshot, target.ok)
        const advanced = (BigInt(current.revision) + 1n).toString()
        const evidence = mint(tenant, guardKey(target.ok), revision, {
          guard: advanced,
          operation: operation.ok,
        })
        const record: GuardRecord = {
          ...current,
          revision: advanced,
          operation: operation.ok,
          evidence,
        }
        const invalidation: InvalidationRecord = {
          kind: 'invalidation',
          operation: operation.ok,
          digest,
          evidence,
        }
        return { kind: 'commit', puts: [record, invalidation], value: evidence }
      },
      () => fail({ kind: 'commit-unknown', operation: operation.ok }),
    )
  }

  const exclude: ToolStartAuthority<P>['exclude'] = async raw => {
    const checked = await callEntry(raw)
    if ('failure' in checked) return checked
    const operation = decodeToolOperationId(Reflect.get(raw, 'operation'))
    if ('failure' in operation) return invalid('operation', operation.failure.reason)
    const reason: unknown = Reflect.get(raw, 'reason')
    if (!filledText(reason)) return invalid('reason', 'type')
    const { tenant, call } = checked.ok
    return transact<DurableEvidence>(
      tenant,
      (snapshot, revision) => {
        const known = snapshot.records.get(exclusionOperationKey(call, operation.ok))
        if (known?.kind === 'exclusion-operation') {
          if (known.reason !== reason)
            return reply(fail({ kind: 'conflict', operation: operation.ok }))
          return reply(succeed(known.evidence))
        }
        const existing = snapshot.records.get(callRejectionKey(call))
        if (existing?.kind === 'rejection') {
          const record: ExclusionOperationRecord = {
            kind: 'exclusion-operation',
            call,
            operation: operation.ok,
            reason,
            evidence: existing.evidence,
          }
          return { kind: 'commit', puts: [record], value: existing.evidence }
        }
        // An accepted invocation is in flight; a control stops it, an exclusion cannot (P04).
        for (const record of snapshot.records.values())
          if (record.kind === 'acceptance' && record.call === call)
            return reply(fail({ kind: 'conflict', operation: record.start }))
        const key = callRejectionKey(call)
        const evidence = mint(tenant, key, revision, { reason, operation: operation.ok })
        const rejection: RejectionRecord = {
          kind: 'rejection',
          call,
          start: null,
          operation: operation.ok,
          reason,
          evidence,
        }
        const record: ExclusionOperationRecord = {
          kind: 'exclusion-operation',
          call,
          operation: operation.ok,
          reason,
          evidence,
        }
        return { kind: 'commit', puts: [rejection, record], value: evidence }
      },
      () => fail({ kind: 'commit-unknown', operation: operation.ok }),
    )
  }

  const authority: ToolStartAuthority<P> = { exclude, prepare, consume, inspect, invalidate }
  return Object.freeze(authority)
}
