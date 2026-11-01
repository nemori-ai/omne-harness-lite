// A test provider of `SqlStorage` on node:sqlite. The memory double of sql-contract has no SQL, so
// it cannot run the Session participant or the read handlers; this one runs the real modules of
// this member against one in-memory database per transaction domain. It models receipts, rollback
// by a stopping reply, recognition by the full identity, scope partition and the read port rules
// (only SELECT, every statement with LIMIT). It does not model Workers, durability, queues or
// limits, and a pass proves none of those.
import { DatabaseSync } from 'node:sqlite'
import {
  inputDigestV2,
  type CommitRequestV2,
  type CommitResultV2,
  type DomainRef,
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
import type {
  MigrationModule,
  ParticipantModule,
  QueryRows,
  ReadHandlerModule,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import migration from '../../src/worker/migration.ts'
import participant from '../../src/worker/participant.ts'
import readHistory from '../../src/worker/read-history.ts'
import readInput from '../../src/worker/read-input.ts'
import readModelSelection from '../../src/worker/read-model-selection.ts'
import readModelView from '../../src/worker/read-model-view.ts'
import readPending from '../../src/worker/read-pending.ts'
import readReferences from '../../src/worker/read-references.ts'
import readReleasedScopes from '../../src/worker/read-released-scopes.ts'
import readWork from '../../src/worker/read-work.ts'

const HANDLERS: readonly ReadHandlerModule[] = [
  readWork,
  readInput,
  readModelSelection,
  readHistory,
  readModelView,
  readPending,
  readReferences,
  readReleasedScopes,
]

export type StorageCall =
  | Readonly<{ kind: 'read'; handler: string; domain: DomainRef; input: unknown }>
  | Readonly<{ kind: 'commit'; identity: SqlIdentity; facts: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: 'query'; identity: SqlIdentity }>

export type SqliteStorage = Readonly<{
  storage: SqlStorage
  calls: StorageCall[]
  /** Every SQL text that a read handler ran. */
  readSql: string[]
  /** Domains that exist, by transaction domain name. */
  domains(): readonly string[]
  /** Seeds derived rows that the commands of this test cannot produce (a test set-up, not a path). */
  seed(domain: string, sql: string, params?: readonly SqlValue[]): void
  /** Reads rows of one domain outside any transaction, for a test that counts what a commit wrote. */
  select(domain: string, sql: string, params?: readonly SqlValue[]): QueryRows
  /** Makes every later read of `handler` answer unavailable; `null` ends it. */
  failReads(handler: string | null): void
  /** Makes the next commit answer `unknown` after it ran (the reply is lost). */
  loseNextReply(): void
  /**
   * Makes the participant port throw at the `nth` later statement that matches `pattern`, inside
   * the write transaction; `null` ends it. The storage then rolls the transaction back.
   */
  failWrite(pattern: RegExp | null, nth?: number): void
}>

type Domain = {
  readonly scope: DomainRef['scope']
  readonly db: DatabaseSync
  readonly receipts: Map<string, ReceiptV2>
}

const scopeKey = (scope: DomainRef['scope']): string =>
  scope.kind === 'system' ? 'system' : `tenant:${scope.tenant}`
const receiptKey = (identity: SqlIdentity): string =>
  JSON.stringify([identity.operation, identity.operationKey])

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  if (/^\s*(SELECT|WITH)/i.test(sql)) {
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
  let failing: string | null = null
  let lose = false
  let writeFault: { pattern: RegExp; left: number } | null = null
  /** Counts the statement against the armed write fault and throws at the chosen one. */
  const faultAt = (sql: string): void => {
    if (writeFault === null || !writeFault.pattern.test(sql)) return
    writeFault.left -= 1
    if (writeFault.left > 0) return
    writeFault = null
    throw new Error(`injected write failure at: ${sql.slice(0, 60)}`)
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
    ;(migration as MigrationModule).up(port)
    const domain: Domain = { scope, db, receipts: new Map() }
    domains.set(name, domain)
    return domain
  }

  const execute = (domain: Domain, request: CommitRequestV2, identity: SqlIdentity): ReceiptV2 => {
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
    for (const command of request.commands) {
      const module: ParticipantModule = participant
      let reply: RecordedReply
      try {
        const port = {
          execute: (sql: string, params: readonly SqlValue[]) => {
            faultAt(sql)
            return rowsOf(domain.db, sql, params)
          },
          requireFact: () => null,
          provideFact: () => undefined,
        }
        const raw = module.execute(structuredClone(command.facts), port)
        reply =
          raw.kind === 'failed'
            ? { kind: 'failed', category: 'participant_reported', diagnostic: raw.diagnostic }
            : raw
      } catch (error) {
        reply = {
          kind: 'failed',
          category: 'participant_threw',
          diagnostic: error instanceof Error ? error.message : 'threw',
        }
      }
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
            ? existing
            : { kind: 'identity_conflict', identity, existing },
        )
      const receipt = execute(domain, request, identity)
      if (lose) {
        lose = false
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: 'reply lost' })
      }
      return Promise.resolve(receipt)
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
          // sql-contract SPEC §9.4: every statement of a read handler has a LIMIT.
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
    failWrite: (pattern, nth = 1) => {
      writeFault = pattern === null ? null : { pattern, left: nth }
    },
  }
}

/** One migrated in-memory database and a participant statement port over it, for module-level tests. */
export function migratedPort(): Readonly<{
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
  ;(migration as MigrationModule).up(port)
  return { port }
}
