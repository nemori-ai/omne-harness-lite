import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { judgeJsonValue, type JsonTreePath, type JsonValue } from '@omne-harness/json-text'

export type { JsonValue }

export type FixedJsonTree = Readonly<{ value: JsonValue; text: string; bytes: number }>
export type JsonTreeRejection = Readonly<{
  reason: 'invalid' | 'too-large' | 'cycle' | 'budget'
  detail: string
}>

export const JSON_TREE_MAX_NODES = 1_000_000

function describePath(path: JsonTreePath): string {
  if (path.length === 0) return 'the root'
  return path
    .map((segment, position) =>
      typeof segment === 'number' ? `[${segment}]` : `${position === 0 ? '' : '.'}${segment}`,
    )
    .join('')
}

type Rejected = Extract<ReturnType<typeof judgeJsonValue>, { rejected: string }>

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

type Pending = JsonValue | string

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

function begin(node: JsonValue, pending: Pending[]): string {
  const opened = open(node)
  for (const part of opened.rest.toReversed()) pending.push(part)
  return opened.first
}

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
