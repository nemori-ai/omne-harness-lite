// One read inside a read Worker (SPEC 9.3, 9.4). The read runs in one transaction on the read
// connection: BEGIN, the first SELECT fixes the snapshot, the handler runs, and the transaction has
// ended before the reply leaves. The read port allows SELECT on the tables of the handler and the
// functions of the allow list, counts rows while it iterates, and demands a LIMIT on each statement.
import { constants as C, type DatabaseSync } from 'node:sqlite'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonicalJson, isStrictJson, utf8Length } from '../json.ts'
import { MaterialMismatch, type ModuleCache } from './modules.ts'
import { BASE_FUNCTIONS, type Decision, SqlGateway } from './ports.ts'
import type { HandlerSpec, ReaderReply } from './reader-protocol.ts'

/** Read rule: SELECT on the declared tables and allowed functions. Nothing else. */
export function readDecision(readTables: readonly string[]): Decision {
  const tables = new Set(readTables)
  return (action, arg1, arg2) => {
    switch (action) {
      case C.SQLITE_SELECT:
      case C.SQLITE_RECURSIVE:
        return true
      case C.SQLITE_READ:
        return arg1 !== null && tables.has(arg1)
      case C.SQLITE_FUNCTION:
        return arg2 !== null && BASE_FUNCTIONS.has(arg2.toLowerCase())
      default:
        return false
    }
  }
}

const HAS_LIMIT = /\blimit\b/i

/** The port that the handler sees. It wraps the gateway with the LIMIT rule. */
class HandlerPort implements ReadPort {
  missingLimit = false
  private readonly gateway: SqlGateway

  constructor(gateway: SqlGateway) {
    this.gateway = gateway
  }

  execute(
    sql: string,
    params: Parameters<ReadPort['execute']>[1],
  ): ReturnType<ReadPort['execute']> {
    if (!HAS_LIMIT.test(sql)) {
      this.missingLimit = true
      throw new Error('statement has no LIMIT')
    }
    return this.gateway.execute(sql, params)
  }
}

export type ReaderState = { db: DatabaseSync | null; readonly modules: ModuleCache }

type Settled = ReaderReply & { fatal?: boolean }

const failed = (diagnostic: string): Settled => ({ kind: 'read_failed', diagnostic })

function missingMarkers(db: DatabaseSync, spec: HandlerSpec): boolean {
  const have = new Set(
    (
      db.prepare('select owner, id from _sql_migration').all() as { owner: string; id: string }[]
    ).map(row => JSON.stringify([row.owner, row.id])),
  )
  return spec.requiresMigrations.some(ref => !have.has(JSON.stringify([ref.owner, ref.id])))
}

function judgeOutcome(spec: HandlerSpec, outcome: unknown): Settled {
  const kind = (outcome as { kind?: unknown } | null)?.kind
  if (kind === 'failed') return failed('handler_failed')
  if (kind !== 'read') return failed('handler_outcome_invalid')
  const output = (outcome as { output?: unknown }).output
  if (!isStrictJson(output)) return failed('output_not_json')
  if (utf8Length(canonicalJson(output)) > spec.maxOutputBytes) return { kind: 'read_limit' }
  return { kind: 'read', output: output as JsonValue }
}

/** Runs the handler inside one read transaction and ends the transaction before it returns. */
export async function runRead(
  state: ReaderState,
  spec: HandlerSpec,
  input: JsonValue,
): Promise<Settled> {
  const db = state.db
  if (db === null) return failed('connection_closed')
  let module: ReadHandlerModule
  try {
    module = await state.modules.load<ReadHandlerModule>(spec.moduleUrl, spec.codeDigest)
  } catch (error) {
    return failed(error instanceof MaterialMismatch ? 'material_mismatch' : 'material_unreadable')
  }
  let gateway: SqlGateway | null = null
  let result: Settled
  try {
    db.exec('BEGIN')
    // The first read of the transaction fixes the snapshot.
    if (missingMarkers(db, spec)) result = { kind: 'schema_unavailable' }
    else {
      gateway = new SqlGateway(db, readDecision(spec.readTables), { maxRows: spec.maxRowsRead })
      const port = new HandlerPort(gateway)
      let outcome: unknown
      let threw = false
      try {
        outcome = module.read(input, port)
      } catch {
        threw = true
      }
      if (gateway.rowLimitHit) result = { kind: 'read_limit' }
      else if (gateway.violated || port.missingLimit) result = failed('read_port_violation')
      else if (threw) result = failed('handler_threw')
      else if (gateway.dataFailure || gateway.environmentFailure !== null)
        result = failed('statement_failed')
      else result = judgeOutcome(spec, outcome)
    }
  } catch {
    result = failed('read_error')
  }
  // The statement has ended and the rows are in memory. Now the transaction ends too (SPEC 9.3).
  try {
    gateway?.close()
    if (db.isTransaction) db.exec('ROLLBACK')
    if (db.isTransaction) return { ...failed('cleanup_failed'), fatal: true }
  } catch {
    return { ...failed('cleanup_failed'), fatal: true }
  }
  return result
}
