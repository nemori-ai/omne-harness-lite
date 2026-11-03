// The basis a committed batch was reduced on, reproduced in a read Worker (SPEC RT-04, C-TOPOLOGY
// §2.9 H2): the history index and reads of the decision, read as the log was when it ended at the
// position before the batch. The Session rows of a position do not change once written, and the
// Agent rows change only with the publication count, so a read bounded at that position with the
// same count gives what the participant read inside its transaction. Another count, a position whose
// row is not of the revision before the batch, or a kept index past the position is `stale`, and the
// work cache then reads the snapshot whole.
import type { SessionInputScope, WorkSnapshot } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from '../codec.ts'
import { BelowKept, readHistory, type HistoryFocus } from './history-index.ts'
import { handler, oneRow, scopeOf, text } from './support.ts'

const count = /^\d+$/
const isCount = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && count.test(value)

export default handler('session.work-reads', (input, port) => {
  const scope = scopeOf(input)
  const { revision, published, upto, inputs, focus, snapshot } = input as Readonly<
    Record<string, JsonValue>
  >
  if (
    scope === null ||
    !isCount(revision) ||
    !isCount(published) ||
    !isCount(upto) ||
    inputs === undefined ||
    focus === undefined ||
    snapshot === undefined
  )
    throw new Error('invalid input')
  const root = oneRow(
    port,
    'SELECT published FROM er_root WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if ((root === undefined ? '0' : text(root['published'])) !== published) return { kind: 'stale' }
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
      decodeValue(snapshot) as WorkSnapshot,
      decodeValue(inputs) as SessionInputScope,
      undefined,
      decodeValue(focus) as HistoryFocus,
      BigInt(upto),
    )
    return history === 'too-many'
      ? { kind: 'stale' }
      : { kind: 'basis', basis: encodeValue({ index: history.index, reads: history.reads }) }
  } catch (error) {
    if (error instanceof BelowKept) return { kind: 'stale' }
    throw error
  }
})
