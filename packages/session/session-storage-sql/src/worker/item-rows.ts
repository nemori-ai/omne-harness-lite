import type { JsonValue } from '@omne-harness/sql-contract'
import { sessionHead } from './fact-rows.ts'
import {
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

export function itemOutput(row: Row): JsonValue {
  return {
    family: text(row['family']),
    item: text(row['item']),
    open: big(row['open']) === 1n,
    pub: text(row['pub']),
    body: JSON.parse(packed(row['body'])) as JsonValue,
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
