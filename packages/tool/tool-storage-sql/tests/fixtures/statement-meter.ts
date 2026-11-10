// What the member's SQL costs while a piece of work runs: statements, rows read, rows written,
// logical bytes and the bytes of decimal texts among them, split by the owner of the rows. A
// revision, an ordinal or a counter is a decimal text whose width grows with the count it holds,
// and that count has a u64 bound; `decimal` lets a comparison deduct that width. A row of a `host` ledger domain belongs to the
// host; every other row (call domains, body chunks and manifests, the due index) belongs to the
// Tool. Every ledger and due statement binds `(tenant, kind, …)`, so the second parameter names
// the domain kind; the body statements bind `(tenant, call, …)` and name no kind.
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import type { ObservedStatement, StatementObserver } from './sqlite-storage.ts'

export type Cost = {
  statements: number
  rowsRead: number
  rowsWritten: number
  bytes: number
  /** The bytes of `bytes` that are decimal texts: whole decimal values and quoted decimals in JSON. */
  decimal: number
}

export type OwnedCost = Readonly<{ tool: Cost; host: Cost }>

const zero = (): Cost => ({ statements: 0, rowsRead: 0, rowsWritten: 0, bytes: 0, decimal: 0 })

/** The logical bytes of one value: UTF-8 for text, eight for a number, the length of a blob. */
function bytesOf(value: SqlValue): number {
  if (value === null) return 0
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return 8
  return value.byteLength
}

/**
 * The decimal bytes of one value: all of a text that is one decimal number, else the digits of
 * every quoted decimal string inside a JSON text, however deep the quoting is escaped.
 */
function decimalBytesOf(value: SqlValue): number {
  if (typeof value !== 'string') return 0
  if (/^\d+$/u.test(value)) return value.length
  let digits = 0
  for (const match of value.matchAll(/(?<=")\d+(?=\\*")/gu)) digits += match[0].length
  return digits
}

/** The cost with its decimal texts deducted: what must not depend on history. */
export function withoutDecimals(cost: OwnedCost): OwnedCost {
  const deduct = ({ statements, rowsRead, rowsWritten, bytes, decimal }: Cost): Cost => ({
    statements,
    rowsRead,
    rowsWritten,
    bytes: bytes - decimal,
    decimal: 0,
  })
  return { tool: deduct(cost.tool), host: deduct(cost.host) }
}

function ownerOf(statement: ObservedStatement): keyof OwnedCost {
  return !/\btl_body_/u.test(statement.sql) && statement.params[1] === 'host' ? 'host' : 'tool'
}

export type StatementMeter = Readonly<{
  observe: StatementObserver
  /** Runs `work` and answers what the member's statements cost while it ran. */
  count(work: () => Promise<void>): Promise<OwnedCost>
}>

export function statementMeter(): StatementMeter {
  let active: { tool: Cost; host: Cost } | null = null
  return {
    observe: statement => {
      if (active === null) return
      const cost = active[ownerOf(statement)]
      cost.statements += 1
      cost.rowsRead += statement.result.rows.length
      cost.rowsWritten += Number(statement.result.changes)
      let bytes = 0
      let decimal = 0
      for (const value of statement.params) {
        bytes += bytesOf(value)
        decimal += decimalBytesOf(value)
      }
      for (const row of statement.result.rows)
        for (const cell of row) {
          bytes += bytesOf(cell)
          decimal += decimalBytesOf(cell)
        }
      cost.bytes += bytes
      cost.decimal += decimal
    },
    count: async work => {
      if (active !== null) throw new Error('the meter counts one piece of work at a time')
      const counted = { tool: zero(), host: zero() }
      active = counted
      try {
        await work()
      } finally {
        active = null
      }
      return counted
    },
  }
}
