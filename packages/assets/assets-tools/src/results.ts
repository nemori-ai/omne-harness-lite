import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { ExtensionsCommandName } from './protocol.ts'

/** The text of a completed call, or why it failed. */
export type Answer = Outcome<string, ToolPrimitiveFailure>

export const TOOL = 'OmneExtensions'

/** A completed call: its head line, its body, and the revision of the tree after it. */
export const done = (head: string, lines: readonly string[], revision: string | null): Answer =>
  succeed(
    [`done ${TOOL} ${head}`, ...lines, ...(revision === null ? [] : [`tree rev ${revision}`])].join(
      '\n',
    ),
  )

const operationOf = (command: ExtensionsCommandName) => `${TOOL}.${command}`

export const NOW_UNAVAILABLE = 'the asset services cannot answer now; nothing was changed'

export const unavailable = (command: ExtensionsCommandName, why = NOW_UNAVAILABLE): Answer =>
  fail({ kind: 'unavailable', operation: operationOf(command), reason: why })

const NOT_KNOWN =
  'it is not known whether this took effect; send the same command again with the same id, or ask result: what took effect is recalled, not done twice'

export const unknown = (command: ExtensionsCommandName, why = NOT_KNOWN): Answer =>
  fail({ kind: 'unknown', operation: operationOf(command), reason: why })

export const invalid = (why: string): Answer => fail({ kind: 'invalid', reason: why })
export const conflict = (why: string): Answer => fail({ kind: 'conflict', reason: why })
export const denied = (): Answer =>
  fail({ kind: 'unsupported', reason: 'this call may not act for the tenant; nothing was changed' })

/** Rows of cells as aligned columns; an empty last cell leaves no trailing space. */
export function columns(rows: readonly (readonly string[])[]): string[] {
  const widths: number[] = []
  for (const row of rows)
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, [...cell].length)
    })
  return rows.map(row =>
    row
      .map((cell, index) =>
        index === row.length - 1
          ? cell
          : cell.padEnd((widths[index] ?? 0) + cell.length - [...cell].length),
      )
      .join('   ')
      .trimEnd(),
  )
}
