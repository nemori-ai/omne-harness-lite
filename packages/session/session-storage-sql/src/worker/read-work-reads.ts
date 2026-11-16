import type { SessionInputScope } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue, isCount } from '../codec.ts'
import { BelowKept, readHistory, type HistoryFocus, type WorkIndexInput } from './history-index.ts'
import { handler, oneRow, readVersion, scopeOf, text } from './support.ts'

type Request = Readonly<{
  revision: string
  published: string
  upto: string
  inputs: JsonValue
  focus: JsonValue
  snapshot: JsonValue
}>

function requestOf(input: JsonValue): Request {
  const { revision, published, upto, inputs, focus, snapshot } = input as Readonly<
    Record<string, JsonValue>
  >
  const counts = [revision, published, upto].every(isCount)
  if (!counts || inputs === undefined || focus === undefined || snapshot === undefined)
    throw new Error('invalid input')
  return { revision, published, upto, inputs, focus, snapshot } as Request
}

export default handler('session.work-reads', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const { revision, published, upto, inputs, focus, snapshot } = requestOf(input)
  if (readVersion(port, scope)?.published !== published) return { kind: 'stale' }
  const last = oneRow(
    port,
    'SELECT revision FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
    [scope.tenant, scope.session, BigInt(upto)],
  )
  if (last === undefined || text(last['revision']) !== revision) return { kind: 'stale' }
  try {
    const history = readHistory(
      port,
      scope.tenant,
      scope.session,
      decodeValue(snapshot) as WorkIndexInput,
      decodeValue(inputs) as SessionInputScope,
      { focus: decodeValue(focus) as HistoryFocus, upto: BigInt(upto) },
    )
    return history === 'too-many'
      ? { kind: 'stale' }
      : { kind: 'basis', basis: encodeValue({ index: history.index, reads: history.reads }) }
  } catch (error) {
    if (error instanceof BelowKept) return { kind: 'stale' }
    throw error
  }
})
