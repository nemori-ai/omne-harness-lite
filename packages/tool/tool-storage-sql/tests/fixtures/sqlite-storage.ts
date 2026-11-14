import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  inputDigestV2,
  type CommitRequestV2,
  type CommitResultV2,
  type DomainRef,
  type JsonValue,
  type QueryResultV2,
  type ReadRequest,
  type ReadResult,
  type ReceiptV2,
  type RecordedReply,
  type SqlIdentity,
  type SqlStorage,
  type StorageScope,
} from '@omne-harness/sql-contract'
import type {
  ParticipantPort,
  QueryRows,
  ReadHandlerModule,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import migration from '../../src/worker/migration.ts'
import pendingMigration from '../../src/worker/migration-pending.ts'
import participant from '../../src/worker/participant.ts'
import readLedger from '../../src/worker/read-ledger.ts'
import readBody from '../../src/worker/read-body.ts'
import readDue from '../../src/worker/read-due.ts'
import readPending from '../../src/worker/read-pending.ts'
import { READ_OUTPUT_BYTES } from '../../src/worker/schema.ts'

const HANDLERS: readonly ReadHandlerModule[] = [readLedger, readPending, readBody, readDue]
const MIGRATIONS = [migration, pendingMigration] as const

export type SqliteStorageOptions = Readonly<{
  directory: string
  maxCommandBytes?: number
  observe?: StatementObserver
}>

export type ObservedStatement = Readonly<{
  sql: string
  params: readonly SqlValue[]
  result: QueryRows
}>

export type StatementObserver = (statement: ObservedStatement) => void

export type Row = Readonly<Record<string, SqlCell>>

export type SqliteStorage = Readonly<{
  storage: SqlStorage
  inspect(transactionDomain: string, sql: string, params?: readonly SqlValue[]): Row[]
  failStatement(ordinal: number): void
  executed(): Readonly<Record<string, number>>
  close(): void
}>

type Domain = Readonly<{ scope: StorageScope; db: DatabaseSync }>

const PROOFS = {
  writerGenerationExcluded: true,
  oldTransactionTerminated: true,
  databaseRecoveryFinished: true,
  authoritativeReadSucceeded: true,
  operationNotQueued: true,
} as const

const PROVIDER_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS _sql_binding (scope TEXT NOT NULL) STRICT',
  `CREATE TABLE IF NOT EXISTS _sql_receipt (
    identity TEXT NOT NULL PRIMARY KEY, receipt TEXT NOT NULL) STRICT`,
  `CREATE TABLE IF NOT EXISTS _sql_migration (
    owner TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (owner, id)) STRICT`,
]

const scopeText = (scope: StorageScope): string =>
  scope.kind === 'system' ? 'system' : `tenant:${scope.tenant}`

const identityText = (identity: SqlIdentity): string =>
  JSON.stringify([
    scopeText(identity.scope),
    identity.transactionDomain,
    identity.operation,
    identity.protocolVersion,
    identity.operationKey,
  ])

function execute(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  if (/^\s*(SELECT|WITH|EXPLAIN)/iu.test(sql)) {
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

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[] = []): Row[] {
  const result = execute(db, sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, index) => [name, cells[index] ?? null])),
  )
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.values(value).every(isJson)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function createSqliteStorage(options: SqliteStorageOptions): SqliteStorage {
  mkdirSync(options.directory, { recursive: true })
  const maxCommandBytes = options.maxCommandBytes ?? 1_048_576
  const domains = new Map<string, Domain>()
  const counts: Record<string, number> = {}
  let failing: number | null = null

  const file = (name: string) => join(options.directory, `${name}.db`)

  const domainOf = (scope: StorageScope, name: string, create: boolean): Domain | null => {
    let domain = domains.get(name)
    if (domain === undefined) {
      const db = new DatabaseSync(file(name))
      for (const statement of PROVIDER_STATEMENTS) db.exec(statement)
      const bound = rowsOf(db, 'SELECT scope FROM _sql_binding LIMIT 1')[0]
      if (bound === undefined) {
        if (!create) {
          db.close()
          return null
        }
        rowsOf(db, 'INSERT INTO _sql_binding (scope) VALUES (?)', [scopeText(scope)])
      }
      for (const step of MIGRATIONS) {
        const done = rowsOf(db, 'SELECT 1 AS done FROM _sql_migration WHERE owner = ? AND id = ?', [
          step.owner,
          step.id,
        ])
        if (done.length === 0) {
          const port = {
            execute: (sql: string, params: readonly SqlValue[]) => execute(db, sql, params),
          }
          db.exec('BEGIN IMMEDIATE')
          step.up(port)
          const verdict = step.verify(port)
          if (verdict.kind !== 'verified') {
            db.exec('ROLLBACK')
            throw new Error(`migration failed: ${verdict.diagnostic}`)
          }
          rowsOf(db, 'INSERT INTO _sql_migration (owner, id) VALUES (?, ?)', [step.owner, step.id])
          db.exec('COMMIT')
        }
      }
      const scopeRow = rowsOf(db, 'SELECT scope FROM _sql_binding LIMIT 1')[0]
      const parsed: StorageScope =
        scopeRow?.['scope'] === 'system'
          ? { kind: 'system' }
          : { kind: 'tenant', tenant: String(scopeRow?.['scope']).slice('tenant:'.length) }
      domain = { scope: parsed, db }
      domains.set(name, domain)
    }
    return scopeText(domain.scope) === scopeText(scope) ? domain : null
  }

  const saved = (domain: Domain, identity: SqlIdentity): ReceiptV2 | null => {
    const row = rowsOf(domain.db, 'SELECT receipt FROM _sql_receipt WHERE identity = ?', [
      identityText(identity),
    ])[0]
    return row === undefined ? null : (JSON.parse(String(row['receipt'])) as ReceiptV2)
  }

  const save = (domain: Domain, receipt: ReceiptV2) => {
    if (receipt.identity.recall === 'never') return
    rowsOf(domain.db, 'INSERT INTO _sql_receipt (identity, receipt) VALUES (?, ?)', [
      identityText(receipt.identity),
      JSON.stringify(receipt),
    ])
  }

  const observed = (db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows => {
    const result = execute(db, sql, params)
    options.observe?.({ sql, params, result })
    return result
  }

  const portOf = (db: DatabaseSync): ParticipantPort => {
    let ordinal = 0
    const fail = failing
    failing = null
    return {
      execute: (sql, params) => {
        ordinal += 1
        if (fail === ordinal) throw new Error(`injected: statement ${ordinal} failed`)
        return observed(db, sql, params)
      },
      requireFact: () => null,
      provideFact: () => undefined,
    }
  }

  const run = (domain: Domain, request: CommitRequestV2): ReceiptV2 => {
    const identity = request.identity
    const base = {
      identity,
      inputDigest: inputDigestV2(request),
      combinationVersion: request.combinationVersion,
      manifestDigest: request.manifestDigest,
    }
    const command = request.commands[0]
    if (command === undefined) throw new Error('a commit without a command')
    const facts = structuredClone(command.facts)
    const intent = String(facts['intent'])
    counts[intent] = (counts[intent] ?? 0) + 1
    domain.db.exec('BEGIN IMMEDIATE')
    let reply: RecordedReply
    try {
      const answered = participant.execute(facts, portOf(domain.db))
      reply =
        answered.kind === 'failed'
          ? { kind: 'failed', category: 'participant_reported', diagnostic: answered.diagnostic }
          : answered
    } catch (error) {
      reply = {
        kind: 'failed',
        category: 'participant_threw',
        diagnostic: error instanceof Error ? error.message : 'threw',
      }
    }
    const entry = { participant: command.participant, protocol: participant.protocol }
    if (reply.kind === 'participated') {
      const receipt: ReceiptV2 = {
        ...base,
        kind: 'committed',
        responses: [{ ...entry, reply }],
      }
      save(domain, receipt)
      domain.db.exec('COMMIT')
      return receipt
    }
    domain.db.exec('ROLLBACK')
    const receipt: ReceiptV2 = { ...base, kind: 'rolled_back', responses: [{ ...entry, reply }] }
    domain.db.exec('BEGIN IMMEDIATE')
    save(domain, receipt)
    domain.db.exec('COMMIT')
    return receipt
  }

  const storage: SqlStorage = {
    database: {},
    registerCombination: input => {
      domainOf(input.scope, input.transactionDomain, true)
      return Promise.resolve({ kind: 'registered', registration: input })
    },
    commit: (request): Promise<CommitResultV2> => {
      const identity = request.identity
      const rejected = (reason: 'facts_not_json' | 'command_limit' | 'combination_unregistered') =>
        Promise.resolve<CommitResultV2>({
          kind: 'rejected_before_accept',
          identity,
          reason,
          diagnostic: null,
        })
      if (!request.commands.every(command => isJson(command.facts)))
        return rejected('facts_not_json')
      if (
        request.commands.some(
          command => Buffer.byteLength(canonical(command), 'utf8') > maxCommandBytes,
        )
      )
        return rejected('command_limit')
      const domain = domainOf(identity.scope, identity.transactionDomain, false)
      if (domain === null) return rejected('combination_unregistered')
      const existing = identity.recall === 'never' ? null : saved(domain, identity)
      if (existing !== null)
        return Promise.resolve(
          existing.inputDigest === inputDigestV2(request)
            ? { ...existing, recalled: true }
            : { kind: 'identity_conflict', identity, existing },
        )
      return Promise.resolve({ ...run(domain, request), recalled: false })
    },
    query: (identity): Promise<QueryResultV2> => {
      const domain = domainOf(identity.scope, identity.transactionDomain, false)
      if (identity.recall === 'never') return Promise.resolve({ kind: 'not_recallable', identity })
      if (domain === null)
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: 'domain_unavailable' })
      return Promise.resolve(
        saved(domain, identity) ?? { kind: 'not_committed', identity, proofs: PROOFS },
      )
    },
    read: (request: ReadRequest): Promise<ReadResult> => {
      const unavailable = (
        reason: 'domain_unavailable' | 'handler_unavailable' | 'read_failed',
      ): Promise<ReadResult> =>
        Promise.resolve({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason,
          diagnostic: null,
        })
      const domain = domainOf(request.domain.scope, request.domain.transactionDomain, false)
      if (domain === null) return unavailable('domain_unavailable')
      const module = HANDLERS.find(item => item.handler === request.handler)
      if (module === undefined || module.protocol !== request.protocol)
        return unavailable('handler_unavailable')
      let outcome: ReturnType<ReadHandlerModule['read']>
      try {
        outcome = module.read(structuredClone(request.input), {
          execute: (sql, params) => {
            if (!/^\s*SELECT/iu.test(sql)) throw new Error('a read handler ran a write')
            return observed(domain.db, sql, params)
          },
        })
      } catch {
        return unavailable('read_failed')
      }
      if (outcome.kind !== 'read' || !isJson(outcome.output)) return unavailable('read_failed')
      if (Buffer.byteLength(JSON.stringify(outcome.output), 'utf8') > READ_OUTPUT_BYTES)
        return unavailable('read_failed')
      return Promise.resolve({
        kind: 'read',
        requestKey: request.requestKey,
        output: structuredClone(outcome.output) as JsonValue,
      })
    },
  }

  return {
    storage,
    inspect: (name, sql, params = []) => {
      const domain = domains.get(name)
      if (domain === undefined) throw new Error(`no open domain ${name}`)
      return rowsOf(domain.db, sql, params)
    },
    failStatement: ordinal => {
      failing = ordinal
    },
    executed: () => ({ ...counts }),
    close: () => {
      for (const domain of domains.values()) domain.db.close()
      domains.clear()
    },
  }
}

export function domainRef(tenant: string, transactionDomain: string): DomainRef {
  return { scope: { kind: 'tenant', tenant }, transactionDomain }
}

export function migratedPort(): Readonly<{
  port: ParticipantPort
  rows(sql: string, params?: readonly SqlValue[]): Row[]
}> {
  const db = new DatabaseSync(':memory:')
  const port: ParticipantPort = {
    execute: (sql, params) => execute(db, sql, params),
    requireFact: () => null,
    provideFact: () => undefined,
  }
  for (const step of MIGRATIONS) step.up(port)
  return { port, rows: (sql, params = []) => rowsOf(db, sql, params) }
}
