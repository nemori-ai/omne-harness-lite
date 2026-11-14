// Frames, pages and entries as the `session/v1` client hands them over: `json` values are trees.
import type { ObserveSessionFrame } from '@omne-harness/session-protocol'
import type { Instant } from '@omne-harness/utc-instant'
import type { WireEntry } from '../../src/model/content.ts'
import { toTree, type JsonTree, type Plain } from '../../src/model/plain.ts'

export function stateFrame(run: string | null, revision: string): ObserveSessionFrame {
  return {
    kind: 'state',
    run,
    revision,
    phase: run === null ? null : 'running',
    target: run === null ? null : { projection: 'model-output-v1' },
  }
}

type Block = readonly [index: string, text: string] | Readonly<{ index: string; block: Plain }>

function blocks(list: readonly Block[]): Plain[] {
  return list.map(block =>
    Array.isArray(block)
      ? { kind: 'growing', index: block[0], mode: 'append', content: 'text', value: block[1] }
      : {
          kind: 'sealed',
          index: (block as { index: string }).index,
          block: (block as { block: Plain }).block,
        },
  )
}

export function snapshotTree(cursor: string, revision: string, list: readonly Block[]): JsonTree {
  return toTree({
    projection: 'model-output-v1',
    phase: 'running',
    cursor,
    revision,
    blocks: blocks(list),
  })
}

export function deltaTree(
  base: Readonly<{ cursor: string; revision: string }>,
  cursor: string,
  revision: string,
  list: readonly Block[],
): JsonTree {
  return toTree({ projection: 'model-output-v1', base, cursor, revision, blocks: blocks(list) })
}

const visibility = { toHuman: true, toModel: true }

export function messageEntry(
  entryId: string,
  revision: string,
  role: 'user' | 'assistant' | 'tool',
  messageBlocks: readonly Plain[],
  messageId = `msg_${entryId}`,
): WireEntry {
  return {
    entryId,
    revision,
    kind: `message.${role}`,
    payload: toTree({
      kind: `message.${role}`,
      message: { id: messageId, role, blocks: [...messageBlocks] },
    }),
  }
}

export function userEntry(
  entryId: string,
  revision: string,
  text: string,
  messageId?: string,
): WireEntry {
  return messageEntry(
    entryId,
    revision,
    'user',
    [{ kind: 'text', id: 'b', visibility, text }],
    messageId,
  )
}

export function assistantEntry(entryId: string, revision: string, text: string): WireEntry {
  return messageEntry(entryId, revision, 'assistant', [{ kind: 'text', id: 'b', visibility, text }])
}

export function toolCallBlock(callId: string, name: string, args: Plain): Plain {
  return { kind: 'tool_call', id: `t_${callId}`, visibility, callId, name, arguments: args }
}

export function toolResultEntry(
  entryId: string,
  revision: string,
  callId: string,
  text: string,
): WireEntry {
  return messageEntry(entryId, revision, 'tool', [
    { kind: 'tool_result', id: `r_${callId}`, visibility, callId },
    { kind: 'text', id: `rt_${callId}`, visibility, text },
  ])
}

export function plainEntry(
  entryId: string,
  revision: string,
  kind: string,
  payload: Plain,
): WireEntry {
  return { entryId, revision, kind, payload: toTree(payload) }
}

/**
 * A history page whose traversal is pinned to the session revision `upper`. `scannedThrough` is a
 * scan position on another axis: a value that would mislead any code comparing it with a revision.
 */
export function page(
  entries: readonly WireEntry[],
  upper: string,
  next: string | null = null,
): {
  entries: WireEntry[]
  next: string | null
  exhausted: boolean
  scannedThrough: string
  upper: string
} {
  return { entries: [...entries], next, exhausted: next === null, scannedThrough: '900', upper }
}

type Lifecycle = 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived'

/** One `list-sessions` item. The two instants stay null: tests have no way to mint an `Instant`. */
export function listed(
  session: string,
  title: string | null = null,
  lifecycle: Lifecycle = 'dormant',
): {
  session: string
  createdAt: null
  lastActivityAt: Instant | null
  lifecycle: Lifecycle
  title: string | null
} {
  return { session, createdAt: null, lastActivityAt: null, lifecycle, title }
}

export function listPage(
  sessions: readonly ReturnType<typeof listed>[],
  next: string | null = null,
  completeness: 'complete' | 'partial' = 'complete',
) {
  return { outcome: 'succeeded' as const, body: { sessions: [...sessions], next, completeness } }
}
