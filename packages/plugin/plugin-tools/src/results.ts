import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'
import type { ExtensionPointsCommandName } from './protocol.ts'

/** The text of a completed call, or why it failed. */
export type Answer = Outcome<string, ToolPrimitiveFailure>

export const TOOL = 'OmneExtensionPoints'

/** A completed call: its head line, its body, and the revision of the tree it was read at. */
export const done = (head: string, lines: readonly string[], revision: string | null): Answer =>
  succeed(
    [`done ${TOOL} ${head}`, ...lines, ...(revision === null ? [] : [`tree rev ${revision}`])].join(
      '\n',
    ),
  )

export const unavailable = (command: ExtensionPointsCommandName, why: string): Answer =>
  fail({ kind: 'unavailable', operation: `${TOOL}.${command}`, reason: why })

export const invalid = (why: string): Answer => fail({ kind: 'invalid', reason: why })

export const CANNOT_READ = 'cannot be read now'
