import readPermissionMode from '../../src/worker/read-permission-mode.ts'
import callLeftMigration from '../../src/worker/call-left-migration.ts'
import compactionIndexMigration from '../../src/worker/compaction-index-migration.ts'
import readEntryMessage from '../../src/worker/read-entry-message.ts'
import readCompactionContext from '../../src/worker/read-compaction-context.ts'
import readCurrentScope from '../../src/worker/read-current-scope.ts'
import checkCompactionInput from '../../src/worker/check-compaction-input.ts'
import permissionMigration from '../../src/worker/permission-current-migration.ts'
import authorizationContextMigration from '../../src/worker/authorization-context-migration.ts'
import readPermissionCurrent from '../../src/worker/read-permission-current.ts'
import ordinaryBasis from '../../src/worker/ordinary-basis.ts'
import { SESSION_LOG_PARTICIPANTS } from '../../src/participants.ts'
import type { FactKey, JsonValue } from '@omne-harness/sql-contract'
import { DatabaseSync } from 'node:sqlite'
import {
  inputDigestV2,
  type CommitRequestV2,
  type CommitResultV2,
  type DomainRef,
  type FailureCategory,
  type ParticipatedEntry,
  type QueryResultV2,
  type ReadRequest,
  type ReadResult,
  type ReceiptV2,
  type RecordedReply,
  type SqlIdentity,
  type SqlStorage,
  type StoppingEntry,
} from '@omne-harness/sql-contract'
import {
  unpackText,
  type MigrationModule,
  type ParticipantModule,
  type QueryRows,
  type ReadHandlerModule,
  type SqlCell,
  type SqlValue,
} from '@omne-harness/sql-contract/worker'
import admissionAttemptMigration from '../../src/worker/admission-attempt-migration.ts'
import indexMigration from '../../src/worker/execution-index-migration.ts'
import recordMigration from '../../src/worker/execution-record-migration.ts'
import executionRecord from '../../src/worker/execution-record.ts'
import factBlobMigration from '../../src/worker/fact-blob-migration.ts'
import itemMigration from '../../src/worker/item-migration.ts'
import factBodyMigration from '../../src/worker/fact-body-migration.ts'
import migration from '../../src/worker/migration.ts'
import evidenceMigration from '../../src/worker/operation-evidence-migration.ts'
import participant from '../../src/worker/participant.ts'
import preadmissionMigration from '../../src/worker/preadmission-migration.ts'
import readBinding from '../../src/worker/read-binding.ts'
import readBlob from '../../src/worker/read-blob.ts'
import readBlobs from '../../src/worker/read-blobs.ts'
import readExecutionItems from '../../src/worker/read-execution-items.ts'
import readExecutionOpenItems from '../../src/worker/read-execution-open-items.ts'
import readExecutionBatches from '../../src/worker/read-execution-batches.ts'
import readExecutionEvents from '../../src/worker/read-execution-events.ts'
import readExecutionOpen from '../../src/worker/read-execution-open.ts'
import readExecutionOperation from '../../src/worker/read-execution-operation.ts'
import readExecutionSession from '../../src/worker/read-execution-session.ts'
import readHistoryRoot from '../../src/worker/read-history-root.ts'
import readHistory from '../../src/worker/read-history.ts'
import readInput from '../../src/worker/read-input.ts'
import readModelSelection from '../../src/worker/read-model-selection.ts'
import readModelView from '../../src/worker/read-model-view.ts'
import readPending from '../../src/worker/read-pending.ts'
import readSearchEntries from '../../src/worker/read-search-entries.ts'
import readSearchSessions from '../../src/worker/read-search-sessions.ts'
import readSearchStamp from '../../src/worker/read-search-stamp.ts'
import readPreadmission from '../../src/worker/read-preadmission.ts'
import readReferences from '../../src/worker/read-references.ts'
import readReleasedScopes from '../../src/worker/read-released-scopes.ts'
import readWorkIndex from '../../src/worker/read-work-index.ts'
import readCallsLeft from '../../src/worker/read-calls-left.ts'
import readWorkReads from '../../src/worker/read-work-reads.ts'
import readWorkVersion from '../../src/worker/read-work-version.ts'
import readWork from '../../src/worker/read-work.ts'
import stateItemMigration from '../../src/worker/state-item-migration.ts'
import attemptGrantMigration from '../../src/worker/attempt-grant-migration.ts'
import scopeIndexMigration from '../../src/worker/scope-index-migration.ts'
import sessionListMigration from '../../src/worker/session-list-migration.ts'
import sessionArchiveMigration from '../../src/worker/session-archive-migration.ts'
import readArchivedSessions from '../../src/worker/read-archived-sessions.ts'
import readSessionList from '../../src/worker/read-session-list.ts'
import readScopeOwner from '../../src/worker/read-scope-owner.ts'
import statePartMigration from '../../src/worker/state-part-migration.ts'

const HANDLERS: readonly ReadHandlerModule[] = [
  checkCompactionInput,
  readCompactionContext,
  readEntryMessage,
  readPermissionMode,
  readPermissionCurrent,
  readWork,
  readCurrentScope,
  readWorkVersion,
  readBinding,
  readWorkIndex,
  readCallsLeft,
  readWorkReads,
  readInput,
  readModelSelection,
  readHistory,
  readModelView,
  readPending,
  readSearchSessions,
  readSearchStamp,
  readSearchEntries,
  readSessionList,
  readArchivedSessions,
  readReferences,
  readReleasedScopes,
  readScopeOwner,
  readHistoryRoot,
  readExecutionBatches,
  readExecutionOpen,
  readExecutionEvents,
  readExecutionOperation,
  readBlob,
  readBlobs,
  readExecutionItems,
  readExecutionOpenItems,
  readExecutionSession,
  readPreadmission,
]

const PARTICIPANTS: ReadonlyMap<string, ParticipantModule> = new Map([
  [ordinaryBasis.participant, ordinaryBasis],
  [participant.participant, participant],
  [executionRecord.participant, executionRecord],
])
const MIGRATIONS: readonly MigrationModule[] = [
  migration,
  recordMigration,
  indexMigration,
  evidenceMigration,
  stateItemMigration,
  attemptGrantMigration,
  permissionMigration,
  authorizationContextMigration,
  scopeIndexMigration,
  sessionListMigration,
  sessionArchiveMigration,
  preadmissionMigration,
  admissionAttemptMigration,
  statePartMigration,
  factBodyMigration,
  factBlobMigration,
  itemMigration,
  compactionIndexMigration,
  callLeftMigration,
]

export type StorageCall =
  | Readonly<{ kind: 'read'; handler: string; domain: DomainRef; input: unknown }>
  | Readonly<{ kind: 'commit'; identity: SqlIdentity; facts: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: 'query'; identity: SqlIdentity }>

export type SqliteStorage = Readonly<{
  storage: SqlStorage
  calls: StorageCall[]
  readSql: string[]
  participantReads: { sql: string; rows: number }[]
  participantWrites: { sql: string; text: number }[]
  domains(): readonly string[]
  seed(domain: string, sql: string, params?: readonly SqlValue[]): void
  select(domain: string, sql: string, params?: readonly SqlValue[]): QueryRows
  failReads(handler: string | null): void
  loseNextReply(): void
  failWrite(pattern: RegExp | null, nth?: number, errcode?: number): void
}>

const DATA_CODES = new Set([1, 18, 19, 20, 25])
const isDataError = (error: unknown): boolean => {
  const code = (error as { errcode?: unknown } | null)?.errcode
  return typeof code === 'number' && DATA_CODES.has(code & 0xff)
}

type Domain = {
  readonly scope: DomainRef['scope']
  readonly db: DatabaseSync
  readonly receipts: Map<string, ReceiptV2>
}

const scopeKey = (scope: DomainRef['scope']): string =>
  scope.kind === 'system' ? 'system' : `tenant:${scope.tenant}`
const receiptKey = (identity: SqlIdentity): string =>
  JSON.stringify([identity.operation, identity.operationKey])

const textLength = (value: SqlValue): number =>
  typeof value === 'string'
    ? value.length
    : value instanceof Uint8Array
      ? unpackText(value).length
      : 0

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  if (/^\s*(SELECT|WITH|EXPLAIN)/i.test(sql)) {
    const rows = statement.all(...(params as never[])) as Record<string, SqlCell>[]
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    return {
      columns,
      rows: rows.map(row => columns.map(name => row[name] ?? null)),
      changes: 0n,
      lastInsertRowid: null,
    }
  }
  const result = statement.run(...(params as never[]))
  return {
    columns: [],
    rows: [],
    changes: BigInt(result.changes),
    lastInsertRowid: BigInt(result.lastInsertRowid),
  }
}

export function createSqliteStorage(): SqliteStorage {
  const domains = new Map<string, Domain>()
  const calls: StorageCall[] = []
  const readSql: string[] = []
  const participantReads: { sql: string; rows: number }[] = []
  const participantWrites: { sql: string; text: number }[] = []
  let failing: string | null = null
  let lose = false
  let writeFault: { pattern: RegExp; left: number; errcode: number | undefined } | null = null
  const faultAt = (sql: string): void => {
    if (writeFault === null || !writeFault.pattern.test(sql)) return
    writeFault.left -= 1
    if (writeFault.left > 0) return
    const { errcode } = writeFault
    writeFault = null
    throw Object.assign(new Error(`injected write failure at: ${sql.slice(0, 60)}`), { errcode })
  }

  const domainOf = (scope: DomainRef['scope'], name: string): Domain | null => {
    const domain = domains.get(name)
    return domain !== undefined && scopeKey(domain.scope) === scopeKey(scope) ? domain : null
  }
  const open = (scope: DomainRef['scope'], name: string): Domain => {
    const existing = domainOf(scope, name)
    if (existing !== null) return existing
    const db = new DatabaseSync(':memory:')
    const port = { execute: (sql: string, params: readonly SqlValue[]) => rowsOf(db, sql, params) }
    for (const module of MIGRATIONS) module.up(port)
    const domain: Domain = { scope, db, receipts: new Map() }
    domains.set(name, domain)
    return domain
  }

  const execute = (
    domain: Domain,
    request: CommitRequestV2,
    identity: SqlIdentity,
  ): ReceiptV2 | 'environment' => {
    const entries: (ParticipatedEntry | StoppingEntry)[] = []
    const inputDigest = inputDigestV2(request)
    const finish = (kind: 'committed' | 'rolled_back'): ReceiptV2 =>
      ({
        kind,
        identity,
        inputDigest,
        combinationVersion: request.combinationVersion,
        manifestDigest: request.manifestDigest,
        responses: entries,
      }) as unknown as ReceiptV2
    domain.db.exec('BEGIN IMMEDIATE')
    const facts = new Map<string, JsonValue>()
    const order: readonly string[] = SESSION_LOG_PARTICIPANTS
    const ordered = [...request.commands].sort(
      (a, b) => order.indexOf(a.participant) - order.indexOf(b.participant),
    )
    for (const command of ordered) {
      const module = PARTICIPANTS.get(command.participant)
      if (module === undefined) throw new Error(`no participant ${command.participant}`)
      let dataFailure = false
      let environmentFailure: unknown = null
      const port = {
        execute: (sql: string, params: readonly SqlValue[]) => {
          try {
            faultAt(sql)
            const result = rowsOf(domain.db, sql, params)
            if (/^\s*SELECT/i.test(sql)) participantReads.push({ sql, rows: result.rows.length })
            else
              participantWrites.push({
                sql,
                text: params.reduce<number>((sum, value) => sum + textLength(value), 0),
              })
            return result
          } catch (error) {
            if (isDataError(error)) dataFailure = true
            else environmentFailure ??= error
            throw error
          }
        },
        requireFact: (key: FactKey) => {
          const value = facts.get(JSON.stringify(key))
          if (value === undefined) throw new Error('missing fixture transaction fact')
          return value
        },
        provideFact: (key: FactKey, value: JsonValue) => {
          const identity = JSON.stringify(key)
          if (facts.has(identity)) throw new Error('duplicate fixture transaction fact')
          facts.set(identity, structuredClone(value))
        },
      }
      let raw: ReturnType<typeof module.execute> | undefined
      let thrown: unknown = null
      try {
        raw = module.execute(structuredClone(command.facts), port)
      } catch (error) {
        thrown = error ?? 'threw'
      }
      if (environmentFailure !== null) {
        domain.db.exec('ROLLBACK')
        return 'environment'
      }
      const failed = (category: FailureCategory, diagnostic: string): RecordedReply => ({
        kind: 'failed',
        category,
        diagnostic,
      })
      const reply: RecordedReply =
        raw === undefined
          ? failed(
              dataFailure ? 'sql_error' : 'participant_threw',
              thrown instanceof Error ? thrown.message : 'threw',
            )
          : raw.kind === 'failed'
            ? failed('participant_reported', raw.diagnostic)
            : raw.kind === 'participated' && dataFailure
              ? failed('sql_error', 'a statement failed on its data')
              : raw
      entries.push({ participant: command.participant, protocol: module.protocol, reply } as never)
      if (reply.kind !== 'participated') {
        domain.db.exec('ROLLBACK')
        const receipt = finish('rolled_back')
        domain.receipts.set(receiptKey(identity), receipt)
        return receipt
      }
    }
    domain.db.exec('COMMIT')
    const receipt = finish('committed')
    domain.receipts.set(receiptKey(identity), receipt)
    return receipt
  }

  const storage: SqlStorage = {
    database: {},
    registerCombination(input) {
      open(input.scope, input.transactionDomain)
      return Promise.resolve({ kind: 'registered', registration: input })
    },
    commit(request): Promise<CommitResultV2> {
      const identity = request.identity
      calls.push({
        kind: 'commit',
        identity,
        facts: (request.commands[0]?.facts ?? {}) as Record<string, unknown>,
      })
      const domain = domainOf(identity.scope, identity.transactionDomain)
      if (domain === null)
        return Promise.resolve({
          kind: 'rejected_before_accept',
          identity,
          reason: 'combination_unregistered',
          diagnostic: null,
        })
      const existing = domain.receipts.get(receiptKey(identity))
      if (existing !== undefined)
        return Promise.resolve(
          existing.inputDigest === inputDigestV2(request)
            ? { ...existing, recalled: true }
            : { kind: 'identity_conflict', identity, existing },
        )
      const receipt = execute(domain, request, identity)
      if (receipt === 'environment')
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: 'environment error' })
      if (lose) {
        lose = false
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: 'reply lost' })
      }
      return Promise.resolve({ ...receipt, recalled: false })
    },
    query(identity): Promise<QueryResultV2> {
      calls.push({ kind: 'query', identity })
      const domain = domainOf(identity.scope, identity.transactionDomain)
      if (domain === null)
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: 'domain_unavailable' })
      return Promise.resolve(
        domain.receipts.get(receiptKey(identity)) ?? {
          kind: 'not_committed',
          identity,
          proofs: {
            writerGenerationExcluded: true,
            oldTransactionTerminated: true,
            databaseRecoveryFinished: true,
            authoritativeReadSucceeded: true,
            operationNotQueued: true,
          },
        },
      )
    },
    read(request: ReadRequest): Promise<ReadResult> {
      calls.push({
        kind: 'read',
        handler: request.handler,
        domain: request.domain,
        input: request.input,
      })
      const unavailable = (reason: string): ReadResult =>
        ({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason,
          diagnostic: null,
        }) as ReadResult
      if (failing === request.handler) return Promise.resolve(unavailable('read_failed'))
      const domain = domainOf(request.domain.scope, request.domain.transactionDomain)
      if (domain === null) return Promise.resolve(unavailable('domain_unavailable'))
      const module = HANDLERS.find(item => item.handler === request.handler)
      if (module === undefined) return Promise.resolve(unavailable('handler_unavailable'))
      const outcome = module.read(structuredClone(request.input), {
        execute: (sql, params) => {
          readSql.push(sql)
          if (!/^\s*SELECT/i.test(sql)) throw new Error('a read handler ran a write')
          if (!/\blimit\b/i.test(sql)) throw new Error('a read statement has no LIMIT')
          return rowsOf(domain.db, sql, params)
        },
      })
      return Promise.resolve(
        outcome.kind === 'read'
          ? { kind: 'read', requestKey: request.requestKey, output: outcome.output }
          : unavailable('read_failed'),
      )
    },
  }
  return {
    storage,
    calls,
    readSql,
    participantReads,
    participantWrites,
    domains: () => [...domains.keys()],
    seed: (name, sql, params = []) => {
      const domain = domains.get(name)
      if (domain === undefined) throw new Error('no such domain')
      rowsOf(domain.db, sql, params)
    },
    select: (name, sql, params = []) => {
      const domain = domains.get(name)
      if (domain === undefined) throw new Error('no such domain')
      return rowsOf(domain.db, sql, params)
    },
    failReads: handler => {
      failing = handler
    },
    loseNextReply: () => {
      lose = true
    },
    failWrite: (pattern, nth = 1, errcode) => {
      writeFault = pattern === null ? null : { pattern, left: nth, errcode }
    },
  }
}

export function migratedPort(): Readonly<{
  db: DatabaseSync
  port: {
    execute(sql: string, params?: readonly SqlValue[]): QueryRows
    requireFact(): null
    provideFact(): undefined
  }
}> {
  const db = new DatabaseSync(':memory:')
  const port = {
    execute: (sql: string, params: readonly SqlValue[] = []) => rowsOf(db, sql, params),
    requireFact: () => null,
    provideFact: () => undefined,
  }
  for (const module of MIGRATIONS) module.up(port)
  return { port, db }
}
