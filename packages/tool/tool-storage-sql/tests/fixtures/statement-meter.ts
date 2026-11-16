import { unpackText, type SqlValue } from '@omne-harness/sql-contract/worker'
import type { ObservedStatement, StatementObserver } from './sqlite-storage.ts'

export type Cost = {
  statements: number
  rowsRead: number
  rowsWritten: number
  bytes: number
  decimal: number
}

export type OwnedCost = Readonly<{ tool: Cost; host: Cost }>

const zero = (): Cost => ({ statements: 0, rowsRead: 0, rowsWritten: 0, bytes: 0, decimal: 0 })

function bytesOf(value: SqlValue): number {
  if (value === null) return 0
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8')
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return 8
  return value.byteLength
}

function decimalBytesOf(value: SqlValue): number {
  if (typeof value !== 'string') return 0
  if (/^\d+$/u.test(value)) return value.length
  let digits = 0
  for (const match of value.matchAll(/(?<=")\d+(?=\\*")/gu)) digits += match[0].length
  return digits
}

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
      const packed = /\btl_record\b/u.test(statement.sql)
      const logical = (value: SqlValue): SqlValue =>
        packed && value instanceof Uint8Array ? unpackText(value) : value
      let bytes = 0
      let decimal = 0
      for (const value of [...statement.params, ...statement.result.rows.flat()]) {
        bytes += bytesOf(logical(value))
        decimal += decimalBytesOf(logical(value))
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
