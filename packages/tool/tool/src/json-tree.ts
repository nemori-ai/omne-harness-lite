// The tagged JSON tree of a wait request as an untrusted value: a closed check that rebuilds a
// frozen copy, and the canonical JSON text of that copy.
//
// The check is `judgeJsonValue` of @omne-harness/json-text: it walks with an explicit stack, so a
// deep tree cannot exhaust the call stack, rejects a container on its own path as a cycle, and
// counts a shared subtree each time it is reached. The text and its UTF-8 size are this scope's
// own: they are built part by part from the copy, and the build stops as soon as the text exceeds
// the byte budget.
//
// The byte budget also bounds the check. Every node that the check visits is written once, and
// its text takes at least one byte (`0`, `[` and `{` are one byte; the other nodes take more),
// so a tree that the check accepts has at most as many visits as the text has bytes. The check
// therefore runs with at most `maxBytes` visits, and a tree with more visits has a text over
// `maxBytes`: it is `too-large`, and the walk stops before it has read the rest of that tree.
// Only when `maxBytes` reaches JSON_TREE_MAX_NODES does the node limit itself bound the check,
// and then more visits than that is `budget`.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { judgeJsonValue, type JsonTreePath, type JsonValue } from '@omne-harness/json-text'

export type { JsonValue }

export type FixedJsonTree = Readonly<{ value: JsonValue; text: string; bytes: number }>
export type JsonTreeRejection = Readonly<{
  reason: 'invalid' | 'too-large' | 'cycle' | 'budget'
  detail: string
}>

/** The most nodes one check visits. */
export const JSON_TREE_MAX_NODES = 1_000_000

/** A path in the words of the rejection detail, such as `entries[1].key`. The root is `the root`. */
function describePath(path: JsonTreePath): string {
  if (path.length === 0) return 'the root'
  return path
    .map((segment, position) =>
      typeof segment === 'number' ? `[${segment}]` : `${position === 0 ? '' : '.'}${segment}`,
    )
    .join('')
}

type Rejected = Extract<ReturnType<typeof judgeJsonValue>, { rejected: string }>

/** A `budget` judgment that the byte budget caused is a tree whose text is over that budget. */
function rejection(judgment: Rejected, maxBytes: number): JsonTreeRejection {
  switch (judgment.rejected) {
    case 'cycle':
      return { reason: 'cycle', detail: 'a container is inside itself' }
    case 'budget':
      return maxBytes < JSON_TREE_MAX_NODES
        ? { reason: 'too-large', detail: `more than ${maxBytes} bytes` }
        : { reason: 'budget', detail: `more than ${JSON_TREE_MAX_NODES} nodes` }
    default:
      return { reason: 'invalid', detail: `${judgment.rejected} at ${describePath(judgment.path)}` }
  }
}

/** What is left to write: a node, or a piece of text that is already known. */
type Pending = JsonValue | string

/** The first part of a node's text, and the parts that follow it, in text order. */
type Opened = Readonly<{ first: string; rest: readonly Pending[] }>

function open(node: JsonValue): Opened {
  switch (node.kind) {
    case 'null':
      return { first: 'null', rest: [] }
    case 'boolean':
      return { first: String(node.value), rest: [] }
    case 'string':
      return { first: JSON.stringify(node.value), rest: [] }
    case 'number':
      return { first: node.lexeme, rest: [] }
    case 'array':
      return {
        first: '[',
        rest: [...node.items.flatMap((child, index) => (index > 0 ? [',', child] : [child])), ']'],
      }
    case 'object':
      return {
        first: '{',
        rest: [
          ...node.entries.flatMap((entry, index) => [
            ...(index > 0 ? [','] : []),
            `${JSON.stringify(entry.key)}:`,
            entry.value,
          ]),
          '}',
        ],
      }
  }
}

/** The first part of a node, with the parts after it pushed so that they pop in text order. */
function begin(node: JsonValue, pending: Pending[]): string {
  const opened = open(node)
  for (const part of opened.rest.toReversed()) pending.push(part)
  return opened.first
}

/**
 * Writes the text of a checked tree and counts its UTF-8 bytes, part by part. The work stops at
 * the first part that takes the text over `maxBytes`.
 */
function writeText(
  tree: JsonValue,
  maxBytes: number,
): Outcome<Readonly<{ text: string; bytes: number }>, JsonTreeRejection> {
  const parts: string[] = []
  const pending: Pending[] = [tree]
  let bytes = 0
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const part = typeof next === 'string' ? next : begin(next, pending)
    bytes += Buffer.byteLength(part)
    if (bytes > maxBytes)
      return fail({ reason: 'too-large', detail: `more than ${maxBytes} bytes` })
    parts.push(part)
  }
  return succeed({ text: parts.join(''), bytes })
}

/**
 * Checks and copies one tagged JSON tree and gives its canonical text. `maxBytes` bounds the
 * UTF-8 size of that text and, by the note at the top, the visits of the check: a larger tree is
 * rejected as `too-large` before the text is whole, and a tree with more visits than `maxBytes`
 * is rejected as `too-large` at once. `maxBytes` must be a positive safe integer. A container
 * inside itself is `cycle`; with `maxBytes` at JSON_TREE_MAX_NODES or more, more than
 * JSON_TREE_MAX_NODES visits is `budget`; any other fault, including a read that throws, is
 * `invalid`.
 */
export function fixJsonTree(
  source: unknown,
  maxBytes: number,
): Outcome<FixedJsonTree, JsonTreeRejection> {
  const judgment = judgeJsonValue(source, { maxVisits: Math.min(JSON_TREE_MAX_NODES, maxBytes) })
  if ('rejected' in judgment) return fail(rejection(judgment, maxBytes))
  const written = writeText(judgment.ok, maxBytes)
  if ('failure' in written) return written
  return succeed({ value: judgment.ok, ...written.ok })
}
