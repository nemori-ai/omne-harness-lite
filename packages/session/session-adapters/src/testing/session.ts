import { commandScope } from './frontier.ts'
import type { ToolRelease } from './result-release.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  decide,
  commandDigest,
  judgeIdle,
  mutationAccessRequest,
  projectSessionLog,
  readAccessRequest,
  reduce,
} from '@omne-harness/session-contract'
import type {
  SessionAccessCheck,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionReadAccessOperation,
  SessionInputScope,
  DurableEvidence,
  EntryId,
  SessionAccess,
  SessionId,
  SessionOperationId,
  SessionRevision,
  RoutedInput,
  WorkSnapshot,
  CommitReceipt,
  HistoryEntry,
  HistoryPage,
  OperationResolution,
  PendingReason,
  SessionFailure,
  SessionHistory,
  GuardCommand,
  SessionCommand,
  SessionTransactionPort,
  SessionLogObservation,
  ProducerRef,
  RunId,
  SessionCallLookup,
  SessionRunLookup,
  ControlOperationResolution,
  RunTerminal,
  SavedModelSelection,
  SessionCallTerminal,
  SessionControlReceipt,
  SessionModelSelection,
} from '@omne-harness/session-contract'
import type { InitializationSource, HistorySource } from './ports.ts'
import {
  canonical as canonicalText,
  digestOf,
  decodedRow,
  rowData,
  materializeModelView,
  compactionReads,
} from './session-values.ts'
import type { SessionState } from './root.ts'
import type { SessionDirectory } from './session-directory.ts'
const TESTING_OWNER = '@omne-harness/session-adapters/testing'
type Recall = (receipt: CommitReceipt) => unknown

type Store = SessionState

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
    entriesOf(tenant: TenantId, session: SessionId): readonly HistoryEntry[]
    /** The access decision evidence that the public commit of `operation` recorded; `null` when there is none. */
    decisionOf(
      tenant: TenantId,
      session: SessionId,
      operation: SessionOperationId,
    ): DurableEvidence | null
  }>
}

/**
 * One current access decision for one public call (session-contract SPEC「当前操作的访问裁定」).
 * A throwing or unavailable source does not continue; the allowed evidence is only returned to
 * the call that asked.
 */
export async function qualifyAccess<P>(
  check: SessionAccessCheck<P>,
  request: SessionAccessRequest<P>,
): Promise<Outcome<DurableEvidence, SessionFailure>> {
  let decision: SessionAccessDecision
  try {
    decision = await check.check(request)
  } catch (error) {
    return fail({
      kind: 'unavailable',
      owner: 'session-qualification',
      diagnostic: `access check threw for ${request.operation}: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  switch (decision.kind) {
    case 'allowed':
      return succeed(decision.evidence)
    case 'denied':
      return fail({ kind: 'denied', action: request.operation })
    case 'unavailable':
      return fail({
        kind: 'unavailable',
        owner: 'session-qualification',
        diagnostic: `access check unavailable for ${request.operation}: ${decision.diagnostic}`,
      })
  }
}

/** The access of a commit must name the tenant and the session of its command; a mismatch is refused without asking. */
export function commitAccessMatches<P>(
  access: SessionAccess<P> | undefined,
  command: SessionCommand,
): access is SessionAccess<P> {
  return (
    access !== undefined &&
    tenantEquals(access.tenant, command.input.tenant) &&
    access.session === command.input.session
  )
}

export interface MemorySessionLogTransactions<P> extends MemorySessionTransactions<P> {
  readonly controls: MemorySessionTransactions<P>['controls'] &
    Readonly<{
      project(
        observation: SessionLogObservation,
        operation: SessionOperationId,
      ): Promise<Outcome<CommitReceipt | null, SessionFailure>>
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

function receiptOf(
  tenant: TenantId,
  session: SessionId,
  operation: SessionOperationId,
  revision: SessionRevision,
  entries: readonly HistoryEntry[],
): CommitReceipt {
  const first = entries[0] as HistoryEntry
  const last = entries[entries.length - 1] as HistoryEntry
  const source: DurableEvidence = {
    owner: TESTING_OWNER,
    record: `${tenantCodec.encode(tenant).ok ? JSON.stringify(tenantCodec.encode(tenant)) : 'invalid'}/${session}/${operation}`,
    revision,
    digest: `sha256:${digestOf({ operation, first: first.id, last: last.id, kinds: entries.map(e => e.kind), payload: entries.map(e => e.payload) })}`,
  }
  return { operation, revision, first: first.id, last: last.id, recovered: false, source }
}

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
      return receipt => ({
        receipt,
        consumption: snapshot.consumptions.find(
          item => canonicalText(item.binding) === canonicalText(command.input.binding),
        )?.id,
      })
    case 'control':
    case 'interrupt': {
      const progress = snapshot.controls.find(item => item.operation === command.input.operation)
      return receipt => ({ receipt, progress })
    }
    case 'cancelRun':
    case 'stopCall': {
      const progress = snapshot.controls.find(item => item.operation === command.input.operation)
      if (progress === undefined) throw new Error(`${command.kind} committed without a control`)
      return receipt => ({
        operation: receipt.operation,
        source: receipt.source,
        answer: { kind: 'requested', progress },
      })
    }
    case 'considerAutoArchive':
      return receipt => ({ result: 'archived', receipt })
    default:
      return receipt => receipt
  }
}

const mint = (record: string, content: unknown): DurableEvidence => ({
  owner: TESTING_OWNER,
  record,
  revision: '1',
  digest: `sha256:${digestOf(content)}`,
})

/** The Run lookup of one snapshot, covering exactly that snapshot. */
function runLookup(snapshot: WorkSnapshot, run: RunId): SessionRunLookup {
  const history = snapshot.executions?.find(item => item.run === run)
  const current =
    snapshot.run.kind === 'terminal' && snapshot.run.terminal.run === run
      ? snapshot.run.terminal
      : null
  const active = snapshot.run.kind === 'active' && snapshot.run.run === run
  if (history === undefined && current === null && !active)
    return { kind: 'absent', run, covered: snapshot.revision }
  return {
    kind: 'bound',
    run,
    bound: mint(`${snapshot.session}/run/${run}`, { run }),
    terminal: current ?? history?.terminal ?? null,
  }
}

/** The double keeps no call terminals: a bound call has none, so a stop is always requested. */
function callLookup(snapshot: WorkSnapshot, producer: ProducerRef): SessionCallLookup {
  return snapshot.consumptions.some(
    item =>
      item.binding.producer.kind === producer.kind && item.binding.producer.call === producer.call,
  )
    ? {
        kind: 'bound',
        producer,
        bound: mint(`${snapshot.session}/call/${producer.kind}/${producer.call}`, producer),
        terminal: null,
      }
    : { kind: 'absent', producer, covered: snapshot.revision }
}

function admittedInput(command: SessionCommand): Extract<RoutedInput, { kind: 'ordinary' }> | null {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return command.input.value
  if (command.kind === 'create') return command.input.creation.initial
  if (command.kind === 'interrupt') return command.input.urgent
  return null
}

export type MemorySessionTransactionOptions<P> = Readonly<{
  initialization?: InitializationSource
  history?: HistorySource
  capacityBytes?: number
  /** The current access decision of every public read and write; required, with no default permission. */
  accessCheck: SessionAccessCheck<P>
}>
/**
 * The internal commit input: the caller has already asked the access check once for this command
 * (the public `commit`, or the Agent write that derives a participation) and hands the allowed
 * decision over. No path commits without one.
 */
export type PreparedCommit = Readonly<{
  command: SessionCommand
  guards: readonly GuardCommand[]
  decision: DurableEvidence
}>
export function createSessionTransactions<P>(
  stores: SessionDirectory,
  options: MemorySessionTransactionOptions<P>,
): MemoryInitializationTransactions<P> & {
  prepareReconciliation(
    observation: SessionLogObservation,
    operation: SessionOperationId,
    releases: readonly ToolRelease[],
    beforePublish: () => SessionFailure | null,
  ): Outcome<CommitReceipt | null, SessionFailure>
  prepareCommand(input: PreparedCommit): Outcome<unknown, SessionFailure>
} {
  let directoryAvailable = true
  let failInitialization = false
  let loseInitializationReply = false
  const issuedCursors = new Set<string>()

  const storeOf = async (
    access: SessionAccess<P>,
    operation: SessionReadAccessOperation,
  ): Promise<Outcome<Store, SessionFailure>> => {
    const qualification = await qualifyAccess(
      options.accessCheck,
      readAccessRequest(access, operation),
    )
    if ('failure' in qualification) return fail(qualification.failure)
    const key = keyOf(access.tenant, access.session)
    if ('failure' in key) return key
    const blocked = stores.gate(key.ok)
    if (blocked !== null) return fail({ kind: 'quarantined', diagnostic: blocked })
    const store = stores.get(key.ok)
    return store === undefined ? fail(denied(operation)) : succeed(store)
  }

  const commit = (input: PreparedCommit): Outcome<unknown, SessionFailure> => {
    const command: SessionCommand = input.command
    // After the access decision, before the session or any lookup: the answer tells nothing of what exists.
    if (command.kind === 'stopCall' && command.input.producer.kind === 'tool')
      return fail({ kind: 'unsupported' })
    const key = keyOf(command.input.tenant, command.input.session)
    if ('failure' in key) return key
    const blocked = stores.gate(key.ok)
    if (blocked !== null) return fail({ kind: 'quarantined', diagnostic: blocked })
    const store = stores.get(key.ok)
    if (store === undefined && command.kind !== 'create') return fail(denied(command.kind))
    const answered = store?.answers.get(command.input.operation)
    if (answered !== undefined) {
      const control = command.kind === 'cancelRun' || command.kind === 'stopCall'
      return control && answered.digest === commandDigest(command)
        ? succeed(answered.receipt)
        : fail({ kind: 'conflict', operation: command.input.operation })
    }
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
    const frozen = store?.frozenReceipt
    if (held !== undefined) {
      if (held.record.digest !== commandDigest(command))
        return fail({ kind: 'conflict', operation: command.input.operation })
      return succeed(held.recall({ ...held.record.receipt, recovered: true }))
    }
    const selected =
      command.kind === 'startRun'
        ? store?.snapshot.pending.slice(0, 1)
        : command.kind === 'receive' && command.input.fact.kind === 'input-handover'
          ? [command.input.fact.input]
          : undefined
    const scope: SessionInputScope =
      selected === undefined
        ? { kind: 'pending', inputs: store?.snapshot.pending ?? [] }
        : { kind: 'selected', inputs: selected }
    const resultParticipation =
      command.kind === 'preserveResult' || command.kind === 'completeConsumption'
        ? command.input.participation
        : null
    const material =
      store === undefined
        ? undefined
        : options.history?.read(
            store.snapshot,
            store.entries,
            scope,
            resultParticipation === null ? [] : [resultParticipation.execution],
            commandScope(command, store.snapshot) === null ? new Map() : undefined,
          )
    const prepared =
      store === undefined
        ? null
        : { ...store.snapshot, ...(material === undefined ? {} : { historyIndex: material.index }) }
    const decision = decide(prepared, command, input.guards, null, {
      ...(material === undefined ? {} : { history: material.reads }),
      compaction:
        command.kind === 'commitDerived' &&
        command.input.value.kind === 'compaction' &&
        store !== undefined
          ? compactionReads(store.entries, store.snapshot, command.input.value.message.covers.to)
          : null,
      ...(frozen == null ? {} : { frozenReceipt: frozen }),
      ...(command.kind === 'cancelRun' && store !== undefined
        ? { runs: [runLookup(store.snapshot, command.input.run)] }
        : {}),
      ...(command.kind === 'stopCall' && store !== undefined
        ? { calls: [callLookup(store.snapshot, command.input.producer)] }
        : {}),
      initializationReceipts: [
        ...(command.kind === 'completeInitialization' ? (store?.operations.values() ?? []) : []),
      ].map(value => value.record.receipt),
    })
    if (decision.kind === 'rejected') return fail(decision.failure)
    if (decision.kind === 'control-answer') {
      if (store === undefined) return fail(unavailable('a control answer without a session'))
      const receipt = {
        operation: command.input.operation,
        source: decision.source,
        answer: decision.answer,
      }
      const answers = new Map(store.answers)
      answers.set(command.input.operation, {
        digest: commandDigest(command),
        receipt,
        decision: input.decision,
      })
      stores.set(key.ok, { ...store, answers })
      return succeed(receipt)
    }
    if (decision.kind === 'recovered') {
      const original = held ?? store?.operations.get(decision.receipt.operation)
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
          decision: input.decision,
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
    const previous = prepared
    const revision = String(
      previous === null ? 1n : BigInt(previous.revision) + 1n,
    ) as SessionRevision
    const offset = store?.entries.length ?? 0
    const entries: HistoryEntry[] = decision.entries.map((entry, index) => ({
      ...entry,
      id: String(offset + index + 1) as EntryId,
      revision,
    }))
    if (
      options.capacityBytes !== undefined &&
      (Buffer.byteLength(canonicalText(entries)) > options.capacityBytes ||
        Buffer.byteLength(canonicalText(previous)) > options.capacityBytes)
    )
      return fail(unavailable('required final batch or snapshot exceeds capacity'))
    const reduced = reduce(previous, { revision, entries }, material?.reads)
    if (reduced.kind === 'quarantined')
      return fail({ kind: 'quarantined', diagnostic: reduced.diagnostic })
    const committedSnapshot = reduced.snapshot
    const receipt = receiptOf(
      command.input.tenant,
      command.input.session,
      command.input.operation,
      revision,
      entries,
    )
    let publishedSnapshot = committedSnapshot
    const recall: Recall = receipt => resultOf(command, publishedSnapshot)(receipt)
    const operations = new Map(store?.operations)
    operations.set(command.input.operation, {
      record: { operation: command.input.operation, digest: commandDigest(command), receipt },
      decision: input.decision,
      recall,
      ...(command.kind === 'cancelRun' || command.kind === 'stopCall'
        ? { form: 'control' as const }
        : {}),
    })
    const inputs = new Map(store?.inputs)
    const admitted = admittedInput(command)
    if (admitted !== null) inputs.set(admitted.input, admitted)
    const target: Store = {
      lastCommit: receipt,
      frozenReceipt: entries.some(entry => entry.kind === 'session.frozen')
        ? receipt
        : (store?.frozenReceipt ?? null),
      snapshot: committedSnapshot,
      modelView: materializeModelView(store?.modelView ?? { epoch: 'epoch:0', rows: [] }, entries, [
        ...(store?.entries ?? []),
        ...entries,
      ]),
      entries: [...(store?.entries ?? []), ...entries],
      operations,
      answers: store?.answers ?? new Map(),
      inputs,
    }
    const initialization = command.kind === 'create' || command.kind === 'completeInitialization'
    if (initialization && failInitialization) {
      failInitialization = false
      return fail(unavailable('injected failure before initialization publication'))
    }
    stores.set(key.ok, target)
    if (command.kind === 'create') {
      const current = options.history?.read(target.snapshot, target.entries, {
        kind: 'pending',
        inputs: target.snapshot.pending,
      })
      if (current) publishedSnapshot = { ...target.snapshot, historyIndex: current.index }
    }
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
      interpreter: store.snapshot.interpreter,
      upper: store.entries[upper - 1]?.revision ?? store.snapshot.revision,
      entries: taken,
      scannedThrough: String(scanned),
      next: exhausted ? null : token,
      exhausted,
      annotations: store.entries.slice(0, upper).filter(entry => {
        const decoded = decodedRow(entry)
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
      const store = await storeOf(input, 'history.begin')
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
      const store = await storeOf(input, 'history.next')
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
      const store = await storeOf(input, 'history.since')
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
      const store = await storeOf(input, 'history.readModelView')
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
    commit: (async input => {
      const command: SessionCommand = input.command
      if (!commitAccessMatches(input.access, command)) return fail(denied(command.kind))
      const qualification = await qualifyAccess(
        options.accessCheck,
        mutationAccessRequest(input.access, command),
      )
      if ('failure' in qualification) return fail(qualification.failure)
      return commit({ command, guards: input.guards, decision: qualification.ok })
    }) as SessionTransactionPort<P>['commit'],
    readWork: async input => {
      const store = await storeOf(input, 'readWork')
      if ('failure' in store) return store
      const material = options.history?.read(store.ok.snapshot, store.ok.entries, {
        kind: 'pending',
        inputs: store.ok.snapshot.pending,
      })
      return succeed({
        ...store.ok.snapshot,
        ...(material === undefined ? {} : { historyIndex: material.index }),
      })
    },
    readInput: async input => {
      const store = await storeOf(input, 'readInput')
      if ('failure' in store) return store
      const found = store.ok.inputs.get(input.input)
      return found === undefined
        ? fail({ kind: 'invalid', field: 'input', reason: 'not an ordinary input of this session' })
        : succeed(found)
    },
    queryOperation: async input => {
      const store = await storeOf(input, 'queryOperation')
      if ('failure' in store) return store
      const held = store.ok.operations.get(input.operation)
      // A control identity is not a batch identity (SL07): it answers conflict here.
      if (held?.form === 'control' || store.ok.answers.has(input.operation))
        return fail({ kind: 'conflict', operation: input.operation })
      const resolution: OperationResolution =
        held === undefined
          ? { kind: 'unknown' }
          : { kind: 'committed', receipt: held.record.receipt }
      return succeed(resolution)
    },
    queryControlOperation: async input => {
      const store = await storeOf(input, 'queryControlOperation')
      if ('failure' in store) return store
      const answered = store.ok.answers.get(input.operation)
      if (answered !== undefined)
        return succeed<ControlOperationResolution>({ kind: 'committed', receipt: answered.receipt })
      const held = store.ok.operations.get(input.operation)
      if (held === undefined) return succeed<ControlOperationResolution>({ kind: 'unknown' })
      if (held.form !== 'control') return fail({ kind: 'conflict', operation: input.operation })
      return succeed<ControlOperationResolution>({
        kind: 'committed',
        receipt: held.recall(held.record.receipt) as SessionControlReceipt<
          RunTerminal | SessionCallTerminal
        >,
      })
    },
    readModelSelection: async input => {
      const store = await storeOf(input, 'readModelSelection')
      if ('failure' in store) return store
      let saved: { selection: SavedModelSelection; at: string } | null = null
      for (const row of store.ok.entries) {
        if (row.kind !== 'session.model-selected') continue
        const declaration = rowData(row)['declaration'] as
          | { kind?: string; name?: string; basis?: DurableEvidence }
          | undefined
        if (
          declaration?.kind === 'model' &&
          declaration.name !== undefined &&
          declaration.basis !== undefined
        )
          saved = {
            selection: { name: declaration.name, basis: declaration.basis },
            at: row.revision,
          }
      }
      const initial = store.ok.snapshot.creation.initialModelSelection
      const first = store.ok.entries[0]
      const chosen =
        saved ??
        (initial !== undefined && first !== undefined
          ? { selection: initial, at: first.revision }
          : null)
      if (chosen === null) return fail({ kind: 'not-ready' })
      const origin = [...store.ok.operations.values()].find(
        item => item.record.receipt.revision === chosen.at,
      )
      if (origin === undefined)
        return fail(unavailable('the commit that saved the selection has no original receipt'))
      return succeed<SessionModelSelection>({
        selection: chosen.selection,
        revision: store.ok.snapshot.revision,
        source: origin.record.receipt.source,
      })
    },
    // The pure range check of the entries interpretation is not in session-contract yet, so the
    // double cannot judge a range: it refuses, and never answers success for an unchecked range.
    commitEntries: async () =>
      fail(unavailable('entries interpretation has no pure range check in session-contract')),
    history,
    pending: async input => {
      const qualification = await qualifyAccess(options.accessCheck, {
        access: { principal: input.principal, tenant: input.tenant },
        operation: 'pending',
        target: { kind: 'tenant', tenant: input.tenant },
      })
      if ('failure' in qualification) return fail(qualification.failure)
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
      const qualification = await qualifyAccess(options.accessCheck, {
        access: { principal: input.principal, scope: 'system' },
        operation: 'references',
        target: { kind: 'resident-references', key: input.key },
      })
      if ('failure' in qualification) return fail(qualification.failure)
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
      const qualification = await qualifyAccess(options.accessCheck, {
        access: { principal: input.principal, scope: 'system' },
        operation: 'releasedScopes',
        target: { kind: 'released-scopes' },
      })
      if ('failure' in qualification) return fail(qualification.failure)
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

  const prepareProjection = (
    observation: SessionLogObservation,
    operation: SessionOperationId,
    releases: readonly ToolRelease[] = [],
    beforePublish?: () => SessionFailure | null,
  ): Outcome<CommitReceipt | null, SessionFailure> => {
    const key = keyOf(observation.tenant, observation.session)
    if ('failure' in key) return key
    const blocked = stores.gate(key.ok)
    if (blocked !== null) return fail({ kind: 'quarantined', diagnostic: blocked })
    const store = stores.get(key.ok)
    if (store === undefined) return fail(denied('project'))
    const held = store.operations.get(operation)
    const digest = releases.length ? digestOf({ observation, releases }) : digestOf(observation)
    if (held !== undefined)
      return held.record.digest === digest
        ? succeed({ ...held.record.receipt, recovered: true })
        : fail({ kind: 'conflict', operation })
    const selected = observation.consequences.find(item => item.kind === 'input-taken')
    const material = options.history?.read(
      store.snapshot,
      store.entries,
      selected?.kind === 'input-taken'
        ? { kind: 'selected', inputs: selected.batch.ordered }
        : { kind: 'pending', inputs: store.snapshot.pending },
      [observation.execution],
      observation.sequence === null
        ? new Map()
        : !observation.consequences.some(item => item.kind === 'ended')
          ? new Map([[observation.execution, observation.sequence]])
          : undefined,
    )
    const prepared = {
      ...store.snapshot,
      ...(material === undefined ? {} : { historyIndex: material.index }),
    }
    const decision = projectSessionLog(prepared, { ...observation, operation }, material?.reads)
    if (decision.kind === 'rejected') return fail(decision.failure)
    if (decision.kind === 'recovered') return succeed(decision.receipt)
    if (decision.kind !== 'entries') return fail(unavailable('projection produced a control answer'))
    const encoded = [...decision.entries]
    for (const fact of releases) {
      const command = {
        kind: 'receive' as const,
        input: { tenant: observation.tenant, session: observation.session, operation, fact },
      }
      const release = decide(prepared, command, [], null, {
        compaction: null,
        ...(material ? { history: material.reads } : {}),
      })
      if (release.kind === 'rejected') return fail(release.failure)
      if (release.kind === 'recovered')
        return fail(unavailable('release unexpectedly recovered outside its reconciliation'))
      if (release.kind !== 'entries') return fail(unavailable('release produced a control answer'))
      encoded.push(...release.entries)
    }
    if (encoded.length === 0) return succeed(null)
    const revision = String(BigInt(store.snapshot.revision) + 1n) as SessionRevision
    const entries = encoded.map((entry, index) => ({
      ...entry,
      id: String(store.entries.length + index + 1) as EntryId,
      revision,
    }))
    if (
      options.capacityBytes !== undefined &&
      (Buffer.byteLength(canonicalText(entries)) > options.capacityBytes ||
        Buffer.byteLength(canonicalText(prepared)) > options.capacityBytes)
    )
      return fail(unavailable('required interpretation batch or snapshot exceeds capacity'))
    const reduced = reduce(prepared, { revision, entries }, material?.reads)
    if (reduced.kind === 'quarantined')
      return fail({ kind: 'quarantined', diagnostic: reduced.diagnostic })
    const receipt = receiptOf(observation.tenant, observation.session, operation, revision, entries)
    const operations = new Map(store.operations)
    operations.set(operation, {
      record: { operation, digest, receipt },
      projection: observation,
      recall: value => value,
    })
    const refusal = beforePublish?.()
    if (refusal) return fail(refusal)
    stores.set(key.ok, {
      ...store,
      snapshot: reduced.snapshot,
      lastCommit: receipt,
      entries: [...store.entries, ...entries],
      operations,
      modelView: materializeModelView(store.modelView, entries, [...store.entries, ...entries]),
    })
    return succeed(receipt)
  }

  return Object.freeze({
    ...port,
    prepareCommand: commit,
    prepareReconciliation: prepareProjection,
    durability: 'none' as const,
    controls: Object.freeze({
      project: async (observation: SessionLogObservation, operation: SessionOperationId) =>
        prepareProjection(observation, operation),
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
      decisionOf: (tenant: TenantId, session: SessionId, operation: SessionOperationId) => {
        const key = keyOf(tenant, session)
        return 'failure' in key
          ? null
          : (stores.get(key.ok)?.operations.get(operation)?.decision ?? null)
      },
    }),
  })
}
