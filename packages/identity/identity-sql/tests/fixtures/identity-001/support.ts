import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  HandlerOutcome,
  ReadHandlerModule,
  ReadPort,
  SqlCell,
  SqlValue,
} from '@omne-harness/sql-contract/worker'
import { PROTOCOL } from './schema.ts'

export type Row = Readonly<Record<string, SqlCell>>

export type Executor = Readonly<{
  execute(
    sql: string,
    params: readonly SqlValue[],
  ): Readonly<{ columns: readonly string[]; rows: readonly (readonly SqlCell[])[] }>
}>

export function rowsOf(port: Executor, sql: string, params: readonly SqlValue[]): Row[] {
  const result = port.execute(sql, params)
  return result.rows.map(cells =>
    Object.fromEntries(result.columns.map((name, index) => [name, cells[index] ?? null])),
  )
}

export function oneRow(port: Executor, sql: string, params: readonly SqlValue[]): Row | undefined {
  return rowsOf(port, sql, params)[0]
}

export const text = (cell: SqlCell | undefined): string => String(cell)

export function handler<Input, Output extends JsonValue>(
  name: string,
  parse: (raw: unknown) => Input | undefined,
  read: (input: Input, port: ReadPort) => Output,
): ReadHandlerModule {
  return {
    handler: name,
    protocol: PROTOCOL,
    read(raw, port): HandlerOutcome {
      const input = parse(raw)
      if (input === undefined) return { kind: 'failed', diagnostic: 'malformed input' }
      return { kind: 'read', output: read(input, port) }
    },
  }
}
