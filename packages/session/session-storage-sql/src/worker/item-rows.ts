import type { JsonValue } from '@omne-harness/sql-contract'
import { sessionHead } from './fact-rows.ts'
import {
  PAGE_BYTES,
  big,
  oneRow,
  packed,
  scopeOf,
  text,
  type Executor,
  type Row,
  type Scope,
} from './support.ts'

export type ItemKey = Readonly<{ family: string; item: string }>

export const isItemKey = (value: unknown): value is ItemKey =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ItemKey).family === 'string' &&
  (value as ItemKey).family !== '' &&
  typeof (value as ItemKey).item === 'string'

export const ITEM_COLUMNS = 'i.family, i.item, i.open, i.pub, i.body, c.payload AS content'

export const ITEM_FROM = `er_item i LEFT JOIN er_item_content c
    ON c.tenant = i.tenant AND c.execution = i.execution AND c.family = i.family AND c.item = i.item`

const contentOf = (row: Row): string | null =>
  row['content'] === null || row['content'] === undefined ? null : packed(row['content'])

export const itemBytes = (row: Row): number =>
  packed(row['body']).length + (contentOf(row)?.length ?? 0)

/** How many of the rows one page holds: what fits the page's bytes, and always the first row. */
export function pageLength(rows: readonly Row[], limit: number): number {
  let bytes = 0
  let count = 0
  while (count < rows.length && count < limit && (count === 0 || bytes < PAGE_BYTES)) {
    bytes += itemBytes(rows[count]!)
    count += 1
  }
  return count
}

export function itemOutput(row: Row): JsonValue {
  const content = contentOf(row)
  return {
    family: text(row['family']),
    item: text(row['item']),
    open: big(row['open']) === 1n,
    pub: text(row['pub']),
    body: JSON.parse(packed(row['body'])) as JsonValue,
    ...(content === null ? {} : { content }),
  }
}

// The scope and execution an item read names, after the session head is held and the execution, when
// indexed, belongs to the session; the head answer otherwise.
export function itemScope(
  input: JsonValue,
  port: Executor,
):
  | Readonly<{ kind: 'scope'; scope: Scope; execution: string; published: bigint }>
  | Readonly<{ kind: 'answer'; answer: JsonValue }> {
  const scope = scopeOf(input)
  const execution = (input as Readonly<Record<string, unknown>>)['execution']
  if (scope === null || typeof execution !== 'string' || execution === '')
    throw new Error('invalid input')
  const gate = sessionHead(port, scope)
  if (gate.kind !== 'held') return { kind: 'answer', answer: gate }
  const owner = oneRow(
    port,
    'SELECT session FROM er_execution WHERE tenant = ? AND execution = ? LIMIT 1',
    [scope.tenant, execution],
  )
  if (owner !== undefined && text(owner['session']) !== scope.session)
    return { kind: 'answer', answer: { kind: 'denied' } }
  return { kind: 'scope', scope, execution, published: gate.published }
}
