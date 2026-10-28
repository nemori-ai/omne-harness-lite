// The SessionTransactionPort conformance suite and a non-durable double that conforms to it. The
// double commits in memory by running `decide` and `reduce`, assigns entry ids and revisions, and
// keys every session by (tenant, session), so a foreign tenant reads `denied` and cannot tell a
// session of another tenant from one that never was (J40). It declares `durability: 'none'` and
// proves nothing about a real store, cross-process commits or the retention of entries.
import assert from 'node:assert/strict'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  EntryId,
  InputId,
  SessionAccess,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from './identity.ts'
import type { BoundedClose, RoutedInput, SessionCreation, WorkSnapshot } from './values.ts'
import type {
  CommitReceipt,
  HistoryEntry,
  HistoryPage,
  OperationResolution,
  PendingReason,
  SessionFailure,
  SessionHistory,
} from './faces.ts'
import type {
  GuardCommand,
  MutationName,
  Mutations,
  SessionCommand,
  SessionTransactionPort,
} from './ports.ts'
import { decide, commandDigest, LOGIN_ENTRY_OWNER } from './decide.ts'
import { judgeCompletion } from './judgments.ts'
import { SESSION_INTERPRETER } from './entries.ts'
import { type OperationRecord } from './judgments.ts'
import { canonicalText, digestOf } from './operations.ts'
import { projectSessionLog, type SessionLogObservation } from './projection.ts'
import { consumptionIdOf } from './decide-results.ts'
import { judgeIdle } from './judgments.ts'
import { materializeModelView, compactionReads, type MaterializedModelView } from './model-view.ts'
import { decodeEntry } from './entries.ts'
import { reduce } from './reduce.ts'
import {
  createMemoryInitializationSource,
  type MemoryInitializationSource,
} from './testing-initialization-source.ts'
import {
  adoptedInitializationFixture,
  initializationFixtureFacts,
  initializationFixtureGuard,
} from './testing-initialization.ts'
import {
  conformanceCase,
  assertIndistinguishable,
  expectKind,
  handle,
  refused,
  succeeded,
  type ConformanceCase,
} from './testing-case.ts'
import {
  TESTING_OWNER,
  assistantMessage,
  creation as legalCreation,
  evidence,
  guard,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  sessionId,
} from './testing-values.ts'

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

type Recall = (receipt: CommitReceipt) => unknown

type Store = {
  snapshot: WorkSnapshot
  modelView: MaterializedModelView
  readonly entries: HistoryEntry[]
  readonly operations: Map<
    SessionOperationId,
    Readonly<{ record: OperationRecord; recall: Recall }>
  >
  readonly inputs: Map<InputId, Extract<RoutedInput, { kind: 'ordinary' }>>
}

type Cursor = Readonly<{
  tenant: string
  session: SessionId
  kinds: readonly string[]
  direction: 'forward' | 'backward'
  upper: number
  scanned: number
  pageBytes: number
}>

export interface MemorySessionTransactions<P> extends SessionTransactionPort<P> {
  readonly durability: 'none'
  readonly controls: Readonly<{
    /** The entries of one session as committed, for a reader that checks the log itself. */
    entriesOf(tenant: TenantId, session: SessionId): readonly HistoryEntry[]
  }>
}

/** The extra controls of this factory; the original provider fixture interface stays implementable. */
export interface MemorySessionLogTransactions<P> extends MemorySessionTransactions<P> {
  readonly controls: MemorySessionTransactions<P>['controls'] &
    Readonly<{
      project(
        observation: SessionLogObservation,
        operation: SessionOperationId,
      ): Promise<Outcome<CommitReceipt, SessionFailure>>
      directoryAvailable(available: boolean): void
    }>
}

export interface MemoryInitializationTransactions<P> extends MemorySessionLogTransactions<P> {
  readonly controls: MemorySessionLogTransactions<P>['controls'] &
    Readonly<{
      failNextInitializationCommit(): void
      loseNextInitializationReply(): void
    }>
}

const unavailable = (diagnostic: string): Extract<SessionFailure, { kind: 'unavailable' }> => ({
  kind: 'unavailable',
  owner: TESTING_OWNER,
  diagnostic,
})

const denied = (action: string): Extract<SessionFailure, { kind: 'denied' }> => ({
  kind: 'denied',
  action,
})

function keyOf(tenant: TenantId, session: SessionId): Outcome<string, SessionFailure> {
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    return fail({
      kind: 'invalid',
      field: 'tenant',
      reason: 'not a tenant that legal-identity minted',
    })
  return succeed(`${text.value}\u0000${session}`)
}

function entryBytes(entry: HistoryEntry): number {
  return Buffer.byteLength(canonicalText(entry), 'utf8')
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(text: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const cursor = parsed as Record<string, unknown>
    if (typeof cursor['tenant'] !== 'string' || typeof cursor['session'] !== 'string') return null
    if (!Array.isArray(cursor['kinds']) || typeof cursor['upper'] !== 'number') return null
    if (typeof cursor['scanned'] !== 'number' || typeof cursor['pageBytes'] !== 'number')
      return null
    if (cursor['direction'] !== 'forward' && cursor['direction'] !== 'backward') return null
    return cursor as Cursor
  } catch {
    return null
  }
}

/**
 * The reasons of one snapshot (SPEC「SessionReconciliation」): decided from the snapshot alone.
 */
export function pendingReasonsOf(snapshot: WorkSnapshot): readonly PendingReason[] {
  const reasons: PendingReason[] = []
  if (snapshot.tasks.some(task => task.kind === 'initialization')) reasons.push('initialization')
  if (snapshot.unresolved.length > 0) reasons.push('unresolved')
  if (snapshot.controls.some(control => control.state === 'propagating')) reasons.push('controls')
  if (snapshot.tasks.length > 0) reasons.push('tasks')
  if (snapshot.pending.length > 0) reasons.push('inputs')
  if (snapshot.run.kind === 'active') reasons.push('run')
  else if (
    snapshot.lifecycle !== 'archived' &&
    snapshot.autoArchive?.kind === 'enabled' &&
    !(snapshot.relation?.kind === 'main' && snapshot.relation.resident)
  )
    reasons.push('idle-armed')
  if (snapshot.consumptions.some(item => item.results.some(result => result.release === 'pending')))
    reasons.push('release')
  return reasons
}

/** The receipt of one committed batch: its evidence binds operation, range, kinds and payload digest. */
function receiptOf(
  session: SessionId,
  operation: SessionOperationId,
  revision: SessionRevision,
  entries: readonly HistoryEntry[],
): CommitReceipt {
  const first = entries[0] as HistoryEntry
  const last = entries[entries.length - 1] as HistoryEntry
  const source: DurableEvidence = {
    owner: TESTING_OWNER,
    record: `${session}/${operation}`,
    revision,
    digest: `sha256:${digestOf({ operation, first: first.id, last: last.id, kinds: entries.map(e => e.kind), payload: entries.map(e => e.payload) })}`,
  }
  return { operation, revision, first: first.id, last: last.id, recovered: false, source }
}

/** The result of a commit for each mutation kind, built from the snapshot after the batch. */
function resultOf(command: SessionCommand, snapshot: WorkSnapshot): Recall {
  const kind = command.kind
  switch (command.kind) {
    case 'create':
      return receipt => ({ receipt, state: snapshot })
    case 'startRun': {
      if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
        throw new Error('startRun committed without an active Run')
      const { advance, adoption, first, execution } = snapshot.run
      return receipt => ({
        receipt,
        advance,
        adopted: adoption,
        first,
        execution: execution.execution,
      })
    }
    case 'claim':
    case 'reload': {
      if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
        throw new Error(`${kind} committed without an advance`)
      const { advance } = snapshot.run
      return receipt => ({ receipt, advance })
    }
    case 'finishRun': {
      if (snapshot.run.kind !== 'terminal')
        throw new Error('finishRun committed without a terminal')
      const { terminal } = snapshot.run
      return receipt => ({ receipt, terminal })
    }
    case 'preserveResult':
    case 'completeConsumption':
    case 'completeExternalConsumption':
      return receipt => receipt.source
    case 'bindExternalCall':
      return receipt => ({ receipt, consumption: consumptionIdOf(command.input.binding) })
    case 'control':
    case 'interrupt': {
      const progress = snapshot.controls.find(item => item.operation === command.input.operation)
      return receipt => ({ receipt, progress })
    }
    case 'considerAutoArchive':
      return receipt => ({ result: 'archived', receipt })
    default:
      return receipt => receipt
  }
}

/** The ordinary input that a command admits, if any, for `readInput`. */
function admittedInput(command: SessionCommand): Extract<RoutedInput, { kind: 'ordinary' }> | null {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return command.input.value
  if (command.kind === 'create') return command.input.creation.initial
  if (command.kind === 'interrupt') return command.input.urgent
  return null
}

export type MemorySessionTransactionOptions<P> = Readonly<{
  initialization?: MemoryInitializationSource
  /** The fixture supplies authorization; no principal is interpreted as production authority. */
  authorize?: (
    input: SessionAccess<P> | Readonly<{ principal: P; tenant?: TenantId; scope?: 'system' }>,
    action: string,
  ) => boolean
}>
export function createMemorySessionTransactions<P>(
  options: MemorySessionTransactionOptions<P> = {},
): MemoryInitializationTransactions<P> {
  const stores = new Map<string, Store>()
  let directoryAvailable = true
  let failInitialization = false
  let loseInitializationReply = false
  const issuedCursors = new Set<string>()

  const storeOf = (access: SessionAccess<P>, action: string): Outcome<Store, SessionFailure> => {
    if (options.authorize?.(access, action) === false) return fail(denied(action))
    const key = keyOf(access.tenant, access.session)
    if ('failure' in key) return key
    const store = stores.get(key.ok)
    return store === undefined ? fail(denied(action)) : succeed(store)
  }

  const commit = async <K extends MutationName>(
    input: Readonly<{
      command: Extract<SessionCommand, { kind: K }>
      guards: readonly GuardCommand[]
    }>,
  ): Promise<Outcome<unknown, SessionFailure>> => {
    const command: SessionCommand = input.command
    const key = keyOf(command.input.tenant, command.input.session)
    if ('failure' in key) return key
    const store = stores.get(key.ok)
    if (store === undefined && command.kind !== 'create') return fail(denied(command.kind))
    if (command.kind === 'create' || command.kind === 'completeInitialization') {
      const refusal =
        options.initialization?.verify(command, input.guards) ??
        (options.initialization === undefined
          ? {
              kind: 'invalid' as const,
              field: 'initialization',
              reason: 'no trusted initialization source was configured',
            }
          : null)
      if (refusal !== null) return fail(refusal)
    }
    const held = store?.operations.get(command.input.operation)
    const frozen =
      store === undefined
        ? undefined
        : [...store.operations.values()].find(
            item =>
              item.record.receipt.source.record.endsWith('/' + item.record.operation) &&
              store.entries.some(
                entry =>
                  entry.kind === 'session.frozen' &&
                  entry.revision === item.record.receipt.revision,
              ),
          )
    const decision = decide(store?.snapshot ?? null, command, input.guards, held?.record ?? null, {
      compaction:
        command.kind === 'commitDerived' &&
        command.input.value.kind === 'compaction' &&
        store !== undefined
          ? compactionReads(store.entries, store.snapshot, command.input.value.message.covers.to)
          : null,
      ...(frozen === undefined ? {} : { frozenReceipt: frozen.record.receipt }),
      initializationReceipts: [...(store?.operations.values() ?? [])].map(
        value => value.record.receipt,
      ),
    })
    if (decision.kind === 'rejected') return fail(decision.failure)
    if (decision.kind === 'recovered') {
      const original = held ?? store?.operations.get(decision.receipt.operation) ?? frozen
      if (original === undefined) return fail(unavailable('a recalled operation without a record'))
      const recall: Recall =
        command.kind === 'completeInitialization' ? receipt => receipt : original.recall
      if (held === undefined && store !== undefined && command.kind === 'completeInitialization') {
        const operations = new Map(store.operations)
        operations.set(command.input.operation, {
          record: {
            operation: command.input.operation,
            digest: commandDigest(command),
            receipt: original.record.receipt,
          },
          recall,
        })
        stores.set(key.ok, { ...store, operations })
      }
      return succeed(recall({ ...decision.receipt, recovered: true }))
    }
    if (
      decision.entries.length === 0 &&
      command.kind === 'considerAutoArchive' &&
      store !== undefined
    ) {
      const snapshot = store.snapshot
      const observation = snapshot.idle?.observation
      const result =
        snapshot.autoArchive?.kind !== 'enabled'
          ? 'disabled'
          : snapshot.relation?.kind === 'main' && snapshot.relation.resident
            ? 'exempt'
            : observation === undefined
              ? 'not-due'
              : judgeIdle(snapshot, {
                  observation,
                  policy: snapshot.autoArchive,
                  coverage:
                    observation.kind === 'interval'
                      ? observation.coverage
                      : {
                          own: observation.source,
                          relations: observation.source,
                          calls: [],
                          children: [],
                          completeScope: observation.source,
                        },
                }).kind
      return succeed({ result, receipt: null })
    }
    const previous = store?.snapshot ?? null
    const revision = String(
      previous === null ? 1 : Number(previous.revision) + 1,
    ) as SessionRevision
    const offset = store?.entries.length ?? 0
    const entries: HistoryEntry[] = decision.entries.map((entry, index) => ({
      ...entry,
      id: String(offset + index + 1) as EntryId,
      revision,
    }))
    const reduced = reduce(previous, { revision, entries })
    if (reduced.kind === 'quarantined')
      return fail({ kind: 'quarantined', diagnostic: reduced.diagnostic })
    const receipt = receiptOf(command.input.session, command.input.operation, revision, entries)
    const recall = resultOf(command, reduced.snapshot)
    const operations = new Map(store?.operations)
    operations.set(command.input.operation, {
      record: { operation: command.input.operation, digest: commandDigest(command), receipt },
      recall,
    })
    const inputs = new Map(store?.inputs)
    const admitted = admittedInput(command)
    if (admitted !== null) inputs.set(admitted.input, admitted)
    const target: Store = {
      snapshot: reduced.snapshot,
      modelView: materializeModelView(store?.modelView ?? { epoch: 'epoch:0', rows: [] }, entries, [
        ...(store?.entries ?? []),
        ...entries,
      ]),
      entries: [...(store?.entries ?? []), ...entries],
      operations,
      inputs,
    }
    const initialization = command.kind === 'create' || command.kind === 'completeInitialization'
    if (initialization && failInitialization) {
      failInitialization = false
      return fail(unavailable('injected failure before initialization publication'))
    }
    stores.set(key.ok, target)
    if (initialization && loseInitializationReply) {
      loseInitializationReply = false
      return fail({ kind: 'commit-unknown', operation: command.input.operation })
    }
    return succeed(recall(receipt))
  }

  const page = (store: Store, cursor: Cursor): HistoryPage => {
    const upper = Math.min(cursor.upper, store.entries.length)
    const forward = cursor.direction === 'forward'
    const matches = (entry: HistoryEntry): boolean =>
      cursor.kinds.length === 0 || cursor.kinds.includes(entry.kind)
    const taken: HistoryEntry[] = []
    let scanned = cursor.scanned
    let bytes = 0
    // `scanned` is a position: forward, the count of entries scanned from the start; backward, the
    // count scanned from the upper bound. A page ends when the next match would exceed the bytes.
    while (forward ? scanned < upper : scanned < upper) {
      const index = forward ? scanned : upper - scanned - 1
      const entry = store.entries[index] as HistoryEntry
      if (matches(entry)) {
        const size = entryBytes(entry)
        if (taken.length > 0 && bytes + size > cursor.pageBytes) break
        taken.push(entry)
        bytes += size
      }
      scanned += 1
    }
    const exhausted = scanned >= upper
    const next: Cursor = { ...cursor, upper, scanned }
    const token = encodeCursor(next)
    if (!exhausted) issuedCursors.add(token)
    return {
      source: TESTING_OWNER,
      interpreter: SESSION_INTERPRETER,
      upper: store.entries[upper - 1]?.revision ?? store.snapshot.revision,
      entries: taken,
      scannedThrough: String(scanned),
      next: exhausted ? null : token,
      exhausted,
      annotations: store.entries.slice(0, upper).filter(entry => {
        const decoded = decodeEntry(entry)
        return (
          'ok' in decoded &&
          decoded.ok.kind === 'history.annotated' &&
          'targets' in decoded.ok &&
          !taken.includes(entry) &&
          decoded.ok.targets.some(target => taken.some(row => row.id === target))
        )
      }),
    }
  }

  const history: SessionHistory<P> = {
    begin: async input => {
      const store = storeOf(input, 'history.begin')
      if ('failure' in store) return store
      if (!Number.isInteger(input.pageBytes) || input.pageBytes < 1)
        return fail({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
      const tenant = (tenantCodec.encode(input.tenant) as { ok: true; value: string }).value
      const total = store.ok.entries.length
      let scanned = 0
      let upper = total
      if (input.from !== null) {
        const at = store.ok.entries.findIndex(entry => entry.id === input.from)
        if (at === -1)
          return fail({ kind: 'invalid', field: 'from', reason: 'not an entry of this session' })
        if (input.direction === 'forward') scanned = at + 1
        else upper = at
      }
      return succeed(
        page(store.ok, {
          tenant,
          session: input.session,
          kinds: input.kinds,
          direction: input.direction,
          upper,
          scanned,
          pageBytes: input.pageBytes,
        }),
      )
    },
    next: async input => {
      const store = storeOf(input, 'history.next')
      if ('failure' in store) return store
      const cursor = decodeCursor(input.cursor)
      const tenant = (tenantCodec.encode(input.tenant) as { ok: true; value: string }).value
      if (
        !issuedCursors.has(input.cursor) ||
        cursor === null ||
        cursor.tenant !== tenant ||
        cursor.session !== input.session
      )
        return fail({ kind: 'invalid', field: 'cursor', reason: 'not a cursor of this session' })
      return succeed(page(store.ok, cursor))
    },
    since: async input => {
      const store = storeOf(input, 'history.since')
      if ('failure' in store) return store
      if (!Number.isInteger(input.pageBytes) || input.pageBytes < 1)
        return fail({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
      const at = store.ok.entries.findIndex(entry => entry.id === input.after)
      if (at === -1)
        return fail({ kind: 'invalid', field: 'after', reason: 'not an entry of this session' })
      const tenant = (tenantCodec.encode(input.tenant) as { ok: true; value: string }).value
      return succeed(
        page(store.ok, {
          tenant,
          session: input.session,
          kinds: input.kinds,
          direction: 'forward',
          upper: store.ok.entries.length,
          scanned: at + 1,
          pageBytes: input.pageBytes,
        }),
      )
    },
    readModelView: async input => {
      const store = storeOf(input, 'history.readModelView')
      if ('failure' in store) return store
      if (!Number.isInteger(input.pageBytes) || input.pageBytes < 1)
        return fail({ kind: 'invalid', field: 'pageBytes', reason: 'not a positive integer' })
      const view = store.ok.modelView
      const key = keyOf(input.tenant, input.session)
      if ('failure' in key) return key
      const current = { epoch: `${key.ok}/${view.epoch}`, upper: String(view.rows.length) }
      if (input.basis !== null && !input.basis.epoch.startsWith(`${key.ok}/`))
        return fail({ kind: 'invalid', field: 'basis', reason: 'another session' })
      if (input.basis !== null && input.basis.epoch !== current.epoch)
        return succeed({ kind: 'epoch-changed', current })
      const basis = input.basis ?? current
      const after = input.after === null ? 0 : Number(input.after)
      const upper = Number(basis.upper)
      if (
        !Number.isInteger(after) ||
        !Number.isInteger(upper) ||
        after < 0 ||
        upper > view.rows.length ||
        after > upper
      )
        return fail({ kind: 'invalid', field: 'basis', reason: 'invalid model view bounds' })
      const rows = []
      let bytes = 0
      for (const row of view.rows.slice(after, upper)) {
        if (rows.length > 0 && bytes + row.bytes > input.pageBytes) break
        rows.push(row)
        bytes += row.bytes
      }
      return succeed({
        kind: 'page',
        basis,
        rows,
        next: after + rows.length < upper ? String(after + rows.length) : null,
      })
    },
  }

  const port: SessionTransactionPort<P> = {
    commit: (input => commit(input)) as SessionTransactionPort<P>['commit'],
    readWork: async input => {
      const store = storeOf(input, 'readWork')
      return 'failure' in store ? store : succeed(store.ok.snapshot)
    },
    readInput: async input => {
      const store = storeOf(input, 'readInput')
      if ('failure' in store) return store
      const found = store.ok.inputs.get(input.input)
      return found === undefined
        ? fail({ kind: 'invalid', field: 'input', reason: 'not an ordinary input of this session' })
        : succeed(found)
    },
    queryOperation: async input => {
      const store = storeOf(input, 'queryOperation')
      if ('failure' in store) return store
      const held = store.ok.operations.get(input.operation)
      const resolution: OperationResolution =
        held === undefined
          ? { kind: 'unknown' }
          : { kind: 'committed', receipt: held.record.receipt }
      return succeed(resolution)
    },
    history,
    pending: async input => {
      if (options.authorize?.(input, 'pending') === false) return fail(denied('pending'))
      const text = tenantCodec.encode(input.tenant)
      if (!text.ok)
        return fail({
          kind: 'invalid',
          field: 'tenant',
          reason: 'not a tenant that legal-identity minted',
        })
      if (!Number.isInteger(input.limit) || input.limit < 1)
        return fail({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
      const prefix = `${text.value}\u0000`
      const sessions = [...stores.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, store]) => store.snapshot)
        .filter(snapshot => {
          const reasons = pendingReasonsOf(snapshot)
          return input.reason === undefined ? reasons.length > 0 : reasons.includes(input.reason)
        })
        .map(snapshot => snapshot.session)
        .sort()
        .filter(session => input.after === null || session > input.after)
      const taken = sessions.slice(0, input.limit)
      const last = taken[taken.length - 1]
      return succeed({
        sessions: taken,
        next: sessions.length > taken.length && last !== undefined ? last : null,
      })
    },
    references: async input => {
      if (options.authorize?.(input, 'references') === false) return fail(denied('references'))
      if (!directoryAvailable)
        return fail(unavailable('transaction-domain directory is unavailable'))
      if (!Number.isInteger(input.limit) || input.limit < 1)
        return fail({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
      const scope = `references:${input.key}:`
      if (input.after !== null && !input.after.startsWith(scope))
        return fail({ kind: 'invalid', field: 'after', reason: 'wrong directory cursor' })
      const rows = [...stores.values()].flatMap(store =>
        store.snapshot.lifecycle === 'archived'
          ? []
          : (store.snapshot.residentKeys ?? []).flatMap(pair => {
              const resident = store.snapshot.residents.find(
                item => item.capability === pair.capability,
              )
              return pair.key === input.key && resident !== undefined
                ? [
                    {
                      tenant: store.snapshot.tenant,
                      session: store.snapshot.session,
                      capability: pair.capability,
                      shape: resident.shape,
                    },
                  ]
                : []
            }),
      )
      const offset = input.after === null ? 0 : Number(input.after.slice(scope.length))
      if (!Number.isInteger(offset) || offset < 0 || offset > rows.length)
        return fail({ kind: 'invalid', field: 'after', reason: 'invalid cursor' })
      const sessions = rows.slice(offset, offset + input.limit)
      return succeed({
        sessions,
        next:
          offset + sessions.length < rows.length ? scope + String(offset + sessions.length) : null,
      })
    },
    releasedScopes: async input => {
      if (options.authorize?.(input, 'releasedScopes') === false)
        return fail(denied('releasedScopes'))
      if (!directoryAvailable)
        return fail(unavailable('transaction-domain directory is unavailable'))
      if (!Number.isInteger(input.limit) || input.limit < 1)
        return fail({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
      const prefix = 'released-scopes:'
      if (input.after !== null && !input.after.startsWith(prefix))
        return fail({ kind: 'invalid', field: 'after', reason: 'wrong directory cursor' })
      const rows = [...stores.values()].flatMap(store =>
        (store.snapshot.releasedScopes ?? []).map(scope => ({
          tenant: store.snapshot.tenant,
          session: store.snapshot.session,
          ...scope,
        })),
      )
      const offset = input.after === null ? 0 : Number(input.after.slice(prefix.length))
      if (!Number.isInteger(offset) || offset < 0 || offset > rows.length)
        return fail({ kind: 'invalid', field: 'after', reason: 'invalid cursor' })
      const scopes = rows.slice(offset, offset + input.limit)
      return succeed({
        scopes,
        next: offset + scopes.length < rows.length ? prefix + String(offset + scopes.length) : null,
      })
    },
  }

  return Object.freeze({
    ...port,
    durability: 'none' as const,
    controls: Object.freeze({
      project: async (
        observation: SessionLogObservation,
        operation: SessionOperationId,
      ): Promise<Outcome<CommitReceipt, SessionFailure>> => {
        const key = keyOf(observation.tenant, observation.session)
        if ('failure' in key) return key
        const store = stores.get(key.ok)
        if (store === undefined) return fail(denied('project'))
        const held = store.operations.get(operation)
        const digest = digestOf(observation)
        if (held !== undefined)
          return held.record.digest === digest
            ? succeed({ ...held.record.receipt, recovered: true })
            : fail({ kind: 'conflict', operation })
        const decision = projectSessionLog(store.snapshot, observation)
        if (decision.kind === 'rejected') return fail(decision.failure)
        if (decision.kind !== 'entries' || decision.entries.length === 0)
          return fail({
            kind: 'invalid',
            field: 'operation',
            reason: 'replay must retain the original projection operation',
          })
        const revision = String(BigInt(store.snapshot.revision) + 1n) as SessionRevision
        const entries = decision.entries.map((entry, index) => ({
          ...entry,
          id: String(store.entries.length + index + 1) as EntryId,
          revision,
        }))
        const reduced = reduce(store.snapshot, { revision, entries })
        if (reduced.kind === 'quarantined')
          return fail({ kind: 'quarantined', diagnostic: reduced.diagnostic })
        const receipt = receiptOf(observation.session, operation, revision, entries)
        const operations = new Map(store.operations)
        operations.set(operation, {
          record: { operation, digest, receipt },
          recall: value => value,
        })
        stores.set(key.ok, {
          ...store,
          snapshot: reduced.snapshot,
          entries: [...store.entries, ...entries],
          operations,
          modelView: materializeModelView(store.modelView, entries, [...store.entries, ...entries]),
        })
        return succeed(receipt)
      },
      directoryAvailable: (available: boolean) => {
        directoryAvailable = available
      },
      failNextInitializationCommit: () => {
        failInitialization = true
      },
      loseNextInitializationReply: () => {
        loseInitializationReply = true
      },
      entriesOf: (tenant: TenantId, session: SessionId) => {
        const key = keyOf(tenant, session)
        return 'failure' in key ? [] : [...(stores.get(key.ok)?.entries ?? [])]
      },
    }),
  })
}

// ---------------------------------------------------------------------------------------------
// The conformance suite
// ---------------------------------------------------------------------------------------------

/**
 * What the transaction suite needs. A fresh fixture serves one case. `access` names the tenant
 * and the session that the case creates; `otherAccess`, when offered, names another tenant for
 * the cross-tenant cases. `creation` is a creation that the port accepts with no required
 * identity. `operation` mints an operation identity from a name, distinct per name.
 */
export interface SessionTransactionsFixture<P> {
  readonly port: SessionTransactionPort<P>
  readonly access: SessionAccess<P>
  readonly otherAccess?: SessionAccess<P>
  readonly creation: SessionCreation
  operation(name: string): SessionOperationId
  initializationGuards?(
    command: Extract<SessionCommand, { kind: 'create' }>,
  ): Promise<readonly GuardCommand[]>
}

type Commit<K extends MutationName> = Awaited<ReturnType<Mutations[K]>>

function scene<P>(fixture: SessionTransactionsFixture<P>) {
  const { port, access } = fixture
  const base = { tenant: access.tenant, session: access.session }
  const commit = <K extends MutationName>(
    command: Extract<SessionCommand, { kind: K }>,
    guards: readonly GuardCommand[] = [],
  ): Promise<Commit<K>> => port.commit<K>({ command, guards }) as Promise<Commit<K>>
  /** The login confirmation the assembly's evidence bridge takes from the first input's origin. */
  const loginEntry = (name: string) =>
    guard('evidence-bridge', LOGIN_ENTRY_OWNER, { session: access.session, operation: name })
  const create = async (name = 'create', creation = fixture.creation) => {
    const command: Extract<SessionCommand, { kind: 'create' }> = {
      kind: 'create',
      input: { ...base, operation: fixture.operation(name), creation },
    }
    return commit<'create'>(command, (await fixture.initializationGuards?.(command)) ?? [])
  }
  const accept = (input: string, name = `accept-${input}`) =>
    commit<'accept'>({
      kind: 'accept',
      input: { ...base, operation: fixture.operation(name), value: ordinaryInput(input) },
    })
  const startRun = (name = 'start-run', login = true) =>
    commit<'startRun'>(
      {
        kind: 'startRun',
        input: {
          ...base,
          operation: fixture.operation(name),
          entry: 'interactive',
          candidate: fixture.creation.definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      login ? [loginEntry(name)] : [],
    )
  const handover = (execution: string, input: string, name = `handover-${input}`) =>
    commit<'receive'>({
      kind: 'receive',
      input: {
        ...base,
        operation: fixture.operation(name),
        fact: {
          kind: 'input-handover',
          execution,
          input: input as InputId,
          result: { kind: 'accepted', receipt: evidence(`agent/accepted/${input}`) },
        },
      },
    })
  const message = (execution: string, text: string, name = `message-${text}`) =>
    commit<'recordMessage'>({
      kind: 'recordMessage',
      input: {
        ...base,
        operation: fixture.operation(name),
        participation: {
          execution,
          operation: `agent-op-${text}`,
          joint: 'message',
          written: '3',
          handover: evidence(`agent/message/${text}`),
        },
        value: {
          message: assistantMessage(text),
          source: evidence(`agent/source/${text}`),
          admission: evidence(`agent/admission/${text}`),
          consumption: null,
        },
      },
    })
  /** Closes the Run by a bounded close of this Session (PM-02): the only terminal on the first path. */
  const finish = async (
    name = 'finish',
    bounded: BoundedClose = {
      kind: 'uninterpretable',
      evidence: evidence('agent/uninterpretable'),
    },
  ) => {
    const snapshot = await readWork()
    const run = expectKind(snapshot.run, 'active', 'run before finishRun')
    return commit<'finishRun'>({
      kind: 'finishRun',
      input: {
        ...base,
        operation: fixture.operation(name),
        run: run.run,
        expected: snapshot.revision,
        bounded,
      },
    })
  }
  const readWork = async () => succeeded(await port.readWork(access), 'readWork')
  /** Creates the session, accepts `input-1` and opens the Run; returns the execution. */
  const openRun = async (): Promise<string> => {
    succeeded(await create(), 'create')
    succeeded(await accept('input-1'), 'accept')
    return succeeded(await startRun(), 'startRun').execution
  }
  return {
    port,
    access,
    base,
    commit,
    create,
    accept,
    startRun,
    handover,
    message,
    finish,
    readWork,
    openRun,
  }
}

export function sessionTransactionsConformance<P>(): readonly ConformanceCase<
  SessionTransactionsFixture<P>
>[] {
  return [
    conformanceCase(
      'JC-01',
      'create commits the creation and readWork returns the snapshot',
      async fixture => {
        const s = scene(fixture)
        const created = succeeded(await s.create(), 'create')
        assert.equal(created.receipt.recovered, false)
        assert.equal(created.state.session, fixture.access.session)
        assert.deepEqual(created.state.tenant, fixture.access.tenant)
        assert.equal(created.state.lifecycle, 'dormant')
        assert.deepEqual(await s.readWork(), created.state)
      },
    ),

    conformanceCase(
      'SL07',
      'the same operation with the same input recalls the original receipt',
      async fixture => {
        const s = scene(fixture)
        const first = succeeded(await s.create(), 'create')
        const again = succeeded(await s.create(), 'create again')
        assert.equal(again.receipt.recovered, true)
        assert.deepEqual({ ...again.receipt, recovered: false }, first.receipt)
        assert.equal(
          (await s.readWork()).revision,
          first.receipt.revision,
          'a recall writes no entry',
        )
      },
    ),

    conformanceCase(
      'SL07',
      'the same operation with another input is a conflict',
      async fixture => {
        const s = scene(fixture)
        succeeded(await s.create(), 'create')
        const other = { ...fixture.creation, purpose: `${fixture.creation.purpose}-other` }
        const failure = refused(await s.create('create', other), 'create with another input')
        const conflict = expectKind(failure, 'conflict', 'create with another input')
        assert.equal(conflict.operation, fixture.operation('create'))
      },
    ),

    conformanceCase(
      'J40',
      'another tenant reads denied, the same as for a session that never was',
      async fixture => {
        const other = handle(fixture.otherAccess, 'otherAccess')
        assert.notDeepEqual(
          other.tenant,
          fixture.access.tenant,
          'the fixture names one tenant twice',
        )
        const s = scene(fixture)
        const created = succeeded(await s.create(), 'create')
        const ghost = { ...other, session: sessionId(`${fixture.access.session}-ghost`) }
        const real = { ...other, session: fixture.access.session }
        assertIndistinguishable(
          { real: await s.port.readWork(real), ghost: await s.port.readWork(ghost) },
          'readWork',
        )
        assertIndistinguishable(
          {
            real: await s.port.queryOperation({ ...real, operation: created.receipt.operation }),
            ghost: await s.port.queryOperation({ ...ghost, operation: created.receipt.operation }),
          },
          'queryOperation',
        )
        assertIndistinguishable(
          {
            real: await s.port.history.begin({
              ...real,
              kinds: [],
              from: null,
              direction: 'forward',
              pageBytes: 1024,
            }),
            ghost: await s.port.history.begin({
              ...ghost,
              kinds: [],
              from: null,
              direction: 'forward',
              pageBytes: 1024,
            }),
          },
          'history.begin',
        )
        const commitAs = (access: SessionAccess<P>) =>
          s.commit<'accept'>({
            kind: 'accept',
            input: {
              tenant: access.tenant,
              session: access.session,
              operation: fixture.operation('foreign-accept'),
              value: ordinaryInput('foreign'),
            },
          })
        assertIndistinguishable(
          { real: await commitAs(real), ghost: await commitAs(ghost) },
          'commit',
        )
        succeeded(await s.accept('input-1'), 'accept')
        assertIndistinguishable(
          {
            real: await s.port.readInput({ ...real, input: 'input-1' as InputId }),
            ghost: await s.port.readInput({ ...ghost, input: 'input-1' as InputId }),
          },
          'readInput',
        )
        const own = succeeded(
          await s.port.history.begin({
            ...fixture.access,
            kinds: [],
            from: null,
            direction: 'forward',
            pageBytes: 1,
          }),
          'history.begin of the owner',
        )
        assert.notEqual(own.next, null, 'a one-byte page leaves a cursor')
        const cursor = own.next as string
        assertIndistinguishable(
          {
            real: await s.port.history.next({ ...real, cursor }),
            ghost: await s.port.history.next({ ...ghost, cursor }),
          },
          "history.next with the owner's cursor",
        )
        const after = own.entries[0]?.id as EntryId
        assertIndistinguishable(
          {
            real: await s.port.history.since({ ...real, after, kinds: [], pageBytes: 1024 }),
            ghost: await s.port.history.since({ ...ghost, after, kinds: [], pageBytes: 1024 }),
          },
          'history.since',
        )
        const listed = succeeded(
          await s.port.pending({
            principal: other.principal,
            tenant: other.tenant,
            after: null,
            limit: 10,
          }),
          'pending of the other tenant',
        )
        assert.deepEqual(listed.sessions, [], 'pending lists no session of another tenant')
      },
    ),

    conformanceCase(
      'R2',
      'startRun of an interactive entry needs the login-entry confirmation among the guards',
      async fixture => {
        const s = scene(fixture)
        succeeded(await s.create(), 'create')
        succeeded(await s.accept('input-1'), 'accept')
        const refusal = refused(
          await s.startRun('start-without-login', false),
          'startRun without login',
        )
        expectKind(refusal, 'login-required', 'startRun without login')
        assert.equal((await s.readWork()).run.kind, 'none', 'the refusal opens no Run')
        succeeded(await s.startRun('start-with-login'), 'startRun with login')
      },
    ),

    conformanceCase(
      'PA-08',
      'after a bounded terminal the successor Run re-hands the same input, and judgeCompletion follows',
      async fixture => {
        const s = scene(fixture)
        const first = await s.openRun()
        succeeded(await s.handover(first, 'input-1', 'handover-1-first'), 'first hand-over')
        assert.equal(judgeCompletion(await s.readWork(), first).kind, 'allowed')
        succeeded(await s.finish('finish-first'), 'finishRun')
        const between = await s.readWork()
        assert.deepEqual(
          between.pending,
          ['input-1'],
          'an uninterpretable close keeps the eligibility',
        )
        assert.deepEqual(between.handed, [], 'the terminal releases the hand-over state')
        const second = succeeded(await s.startRun('start-second'), 'second startRun').execution
        assert.notEqual(second, first)
        assert.deepEqual(judgeCompletion(await s.readWork(), second), {
          kind: 'blocked',
          pendingInputs: ['input-1'],
        })
        succeeded(await s.handover(second, 'input-1', 'handover-1-second'), 'second hand-over')
        const after = await s.readWork()
        assert.deepEqual(after.handed, ['input-1'])
        assert.equal(judgeCompletion(after, second).kind, 'allowed')
      },
    ),

    conformanceCase(
      'JC-03',
      'accept queues an ordinary input and readInput returns it',
      async fixture => {
        const s = scene(fixture)
        succeeded(await s.create(), 'create')
        succeeded(await s.accept('input-1'), 'accept')
        const snapshot = await s.readWork()
        assert.deepEqual(snapshot.pending, ['input-1'])
        assert.deepEqual(snapshot.handed, [])
        const read = succeeded(
          await s.port.readInput({ ...fixture.access, input: 'input-1' as InputId }),
          'readInput',
        )
        assert.deepEqual(read, ordinaryInput('input-1'))
        const missing = refused(
          await s.port.readInput({ ...fixture.access, input: 'input-9' as InputId }),
          'readInput of an unknown input',
        )
        expectKind(missing, 'invalid', 'readInput of an unknown input')
      },
    ),

    conformanceCase(
      'JC-05',
      'startRun fixes the first input, opens the Run and keeps the inputs pending',
      async fixture => {
        const s = scene(fixture)
        succeeded(await s.create(), 'create')
        succeeded(await s.accept('input-1'), 'accept 1')
        succeeded(await s.accept('input-2'), 'accept 2')
        const started = succeeded(await s.startRun(), 'startRun')
        assert.equal(started.first, 'input-1')
        assert.equal(started.advance.run.length > 0 && started.execution.length > 0, true)
        const snapshot = await s.readWork()
        const run = expectKind(snapshot.run, 'active', 'run after startRun')
        assert.deepEqual(run.advance, started.advance)
        assert.equal(run.execution.execution, started.execution)
        assert.equal(run.execution.readThrough, '0')
        assert.deepEqual(
          snapshot.pending,
          ['input-1', 'input-2'],
          'startRun removes no pending eligibility',
        )
        assert.equal(snapshot.lifecycle, 'active')
      },
    ),

    conformanceCase(
      'I-R1',
      'a second startRun on an unfinished Run is run-active, and without input no-input',
      async fixture => {
        const s = scene(fixture)
        succeeded(await s.create(), 'create')
        const none = refused(await s.startRun('start-empty'), 'startRun without input')
        expectKind(none, 'no-input', 'startRun without input')
        succeeded(await s.accept('input-1'), 'accept')
        succeeded(await s.startRun(), 'startRun')
        const second = refused(await s.startRun('start-second'), 'second startRun')
        expectKind(second, 'run-active', 'second startRun')
      },
    ),

    conformanceCase(
      'ST07',
      'the hand-over marks the input handed, keeps it pending, and refuses another execution',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.openRun()
        succeeded(await s.handover(execution, 'input-1'), 'handover')
        const snapshot = await s.readWork()
        assert.deepEqual(snapshot.handed, ['input-1'])
        assert.deepEqual(
          snapshot.pending,
          ['input-1'],
          'eligibility is kept until the Agent takes the input',
        )
        const stranger = refused(
          await s.handover('other-execution', 'input-1', 'handover-stranger'),
          'handover of another execution',
        )
        expectKind(stranger, 'invalid', 'handover of another execution')
        const twice = refused(
          await s.handover(execution, 'input-1', 'handover-twice'),
          'a second hand-over of the input',
        )
        expectKind(twice, 'invalid', 'a second hand-over of the input')
      },
    ),

    conformanceCase(
      'JC-06',
      'the message hand-over records the assistant message, and after the terminal the next input opens another Run',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.openRun()
        succeeded(await s.handover(execution, 'input-1'), 'handover')
        succeeded(await s.message(execution, 'hello'), 'recordMessage')
        let snapshot = await s.readWork()
        let run = expectKind(snapshot.run, 'active', 'run after the message')
        assert.equal(run.execution.revision, '3', 'the participation revision is kept')
        const stranger = refused(
          await s.message('other-execution', 'stranger'),
          'message of another execution',
        )
        expectKind(stranger, 'invalid', 'message of another execution')
        const finished = succeeded(await s.finish(), 'finishRun')
        assert.equal(finished.terminal.outcome, 'failed')
        snapshot = await s.readWork()
        const terminal = expectKind(snapshot.run, 'terminal', 'run after finishRun')
        assert.equal(snapshot.lifecycle, 'dormant')
        const late = refused(await s.message(execution, 'late'), 'a message after the terminal')
        expectKind(late, 'terminal', 'a message after the terminal')
        succeeded(await s.accept('input-2'), 'accept after the terminal')
        const next = succeeded(await s.startRun('start-second'), 'the next Run')
        assert.equal(
          next.first,
          'input-1',
          'an input handed over but never taken keeps its eligibility and is re-fixed by the successor Run (PA-08)',
        )
        snapshot = await s.readWork()
        assert.deepEqual(snapshot.pending, ['input-1', 'input-2'])
        run = expectKind(snapshot.run, 'active', 'the next Run')
        assert.notEqual(run.run, terminal.terminal.run, 'the next Run is another Run')
      },
    ),

    conformanceCase(
      'SL10',
      'history pages the entries in commit order, next continues, a cursor of another session is invalid',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.openRun()
        succeeded(await s.handover(execution, 'input-1'), 'handover')
        const all = succeeded(
          await s.port.history.begin({
            ...fixture.access,
            kinds: [],
            from: null,
            direction: 'forward',
            pageBytes: 1_000_000,
          }),
          'begin',
        )
        assert.ok(all.exhausted, 'one large page reads everything')
        assert.deepEqual(
          all.entries.map(entry => entry.kind),
          [
            'session.created',
            'session.adoption',
            'message.user',
            'intake.routed',
            'run.started',
            'run.attempt-started',
            'intake.handed-over',
          ],
        )
        assert.deepEqual(
          all.entries.map(entry => Number(entry.revision)),
          [1, 1, 2, 2, 3, 3, 4],
        )
        const first = succeeded(
          await s.port.history.begin({
            ...fixture.access,
            kinds: [],
            from: null,
            direction: 'forward',
            pageBytes: 1,
          }),
          'begin small',
        )
        assert.equal(first.entries.length, 1, 'a page holds at least one entry')
        assert.equal(first.exhausted, false)
        const cursor = first.next
        assert.ok(cursor !== null, 'a page that is not exhausted has a next cursor')
        const second = succeeded(await s.port.history.next({ ...fixture.access, cursor }), 'next')
        assert.equal(
          second.entries[0]?.id,
          all.entries[1]?.id,
          'next continues at the scan position',
        )
        const foreign = refused(
          await s.port.history.next({
            ...fixture.access,
            session: sessionId(`${fixture.access.session}-other`),
            cursor,
          }),
          'next with a cursor of another session',
        )
        assert.ok(
          foreign.kind === 'invalid' || foreign.kind === 'denied',
          'a cursor of another session is refused',
        )
        const filtered = succeeded(
          await s.port.history.begin({
            ...fixture.access,
            kinds: ['intake.routed'],
            from: null,
            direction: 'forward',
            pageBytes: 1_000_000,
          }),
          'begin filtered',
        )
        assert.deepEqual(
          filtered.entries.map(entry => entry.kind),
          ['intake.routed'],
        )
        const since = succeeded(
          await s.port.history.since({
            ...fixture.access,
            after: all.entries.find(entry => entry.kind === 'intake.routed')?.id as EntryId,
            kinds: [],
            pageBytes: 1_000_000,
          }),
          'since',
        )
        assert.deepEqual(
          since.entries.map(entry => entry.kind),
          ['run.started', 'run.attempt-started', 'intake.handed-over'],
        )
      },
    ),

    conformanceCase(
      'PendingReason',
      'pending lists the session while inputs or a Run are open, and omits it afterwards',
      async fixture => {
        const s = scene(fixture)
        const ask = (reason?: PendingReason) =>
          s.port.pending(
            reason === undefined
              ? {
                  principal: fixture.access.principal,
                  tenant: fixture.access.tenant,
                  after: null,
                  limit: 10,
                }
              : {
                  principal: fixture.access.principal,
                  tenant: fixture.access.tenant,
                  after: null,
                  limit: 10,
                  reason,
                },
          )
        succeeded(await s.create(), 'create')
        assert.deepEqual(succeeded(await ask(), 'pending of a dormant session').sessions, [])
        succeeded(await s.accept('input-1'), 'accept')
        assert.deepEqual(succeeded(await ask('inputs'), 'pending inputs').sessions, [
          fixture.access.session,
        ])
        assert.deepEqual(succeeded(await ask('run'), 'pending run').sessions, [])
        const execution = succeeded(await s.startRun(), 'startRun').execution
        assert.deepEqual(succeeded(await ask('run'), 'pending run after startRun').sessions, [
          fixture.access.session,
        ])
        succeeded(await s.handover(execution, 'input-1'), 'handover')
        succeeded(
          await s.finish('finish', {
            kind: 'admission-rejected',
            input: 'input-1' as InputId,
            rejection: evidence('agent/rejected/input-1'),
          }),
          'finishRun',
        )
        assert.deepEqual(succeeded(await ask(), 'pending after the terminal').sessions, [])
      },
    ),

    conformanceCase(
      'SL09',
      'queryOperation answers committed with the receipt, and unknown for an operation never seen',
      async fixture => {
        const s = scene(fixture)
        const created = succeeded(await s.create(), 'create')
        const committed = succeeded(
          await s.port.queryOperation({ ...fixture.access, operation: created.receipt.operation }),
          'queryOperation',
        )
        assert.deepEqual(committed, { kind: 'committed', receipt: created.receipt })
        const never = succeeded(
          await s.port.queryOperation({ ...fixture.access, operation: fixture.operation('never') }),
          'queryOperation of an unknown operation',
        )
        assert.equal(never.kind, 'unknown', 'not found is unknown, not not-committed')
      },
    ),

    conformanceCase(
      'PM-02',
      'finishRun with an admission rejection fails the Run and releases the first input',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.openRun()
        const snapshot = await s.readWork()
        const run = expectKind(snapshot.run, 'active', 'run')
        const finished = succeeded(
          await s.finish('finish', {
            kind: 'admission-rejected',
            input: 'input-1' as InputId,
            rejection: evidence('agent/rejected/input-1'),
          }),
          'finishRun',
        )
        assert.equal(finished.terminal.outcome, 'failed')
        const after = await s.readWork()
        assert.deepEqual(after.pending, [], 'the rejected first input lost its eligibility')
        assert.equal(after.lifecycle, 'dormant')
        assert.equal(execution, run.execution.execution)
        const stale = refused(
          await s.commit<'finishRun'>({
            kind: 'finishRun',
            input: {
              ...s.base,
              operation: fixture.operation('finish-again'),
              run: run.run,
              expected: snapshot.revision,
              bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
            },
          }),
          'finishRun after the terminal',
        )
        expectKind(stale, 'terminal', 'finishRun after the terminal')
      },
    ),

    conformanceCase(
      'JC-16',
      'archive commits its scope cleanup without pretending physical release',
      async fixture => {
        const s = scene(fixture)
        succeeded(await s.create(), 'create')
        succeeded(
          await s.commit<'control'>({
            kind: 'control',
            input: {
              ...s.base,
              operation: fixture.operation('archive'),
              intent: { kind: 'archive' },
            },
          }),
          'archive',
        )
        const state = await s.readWork()
        assert.equal(state.lifecycle, 'archived')
        assert.ok(state.tasks.some(task => task.kind === 'scope-release'))
        assert.deepEqual(state.releasedScopes ?? [], [])
      },
    ),
  ]
}

/** A fresh fixture over a fresh in-memory port, with the second tenant for the cross-tenant case. */
export function memorySessionTransactionsFixture(): SessionTransactionsFixture<string> {
  const initialization = createMemoryInitializationSource()
  return {
    port: createMemorySessionTransactions<string>({ initialization }),
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('stranger'),
    creation: legalCreation(),
    operation: name => operationId(name),
    initializationGuards: async command => {
      initialization.controls.register(
        command,
        initializationFixtureGuard(
          initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
        ),
      )
      return succeeded(await initialization.prepare(command), 'initialization source')
    },
  }
}
