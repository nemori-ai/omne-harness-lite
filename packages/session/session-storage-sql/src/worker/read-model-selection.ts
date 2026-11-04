// XC-MODELSEL: the saved model selection with the original commit that saved it.
import { plainOf } from '../codec.ts'
import { readEntryText } from '../entry-codec.ts'
import { readMember } from './state-rows.ts'
import { big, handler, oneRow, scopeOf, text } from './support.ts'

type Selection = { name: string; basis: unknown }

export default handler('session.model-selection', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const bind = [scope.tenant, scope.session] as const
  const state = oneRow(
    port,
    `SELECT s.snapshot AS snapshot, s.covered AS covered, j.tail AS tail
       FROM sl_journal j LEFT JOIN sl_state s ON s.tenant = j.tenant AND s.session = j.session
      WHERE j.tenant = ? AND j.session = ? LIMIT 1`,
    bind,
  )
  if (state === undefined) return { kind: 'absent' }
  if (state['snapshot'] === null || big(state['covered']) !== big(state['tail']))
    return { kind: 'behind' }
  // The head of the stored snapshot (R2-D292): the revision, and `creation` from the head or from
  // its member row. No chunk is read.
  const head = text(state['snapshot'])
  const snapshot = {
    revision: (JSON.parse(head) as { revision: string }).revision,
    creation: readMember(port, scope.tenant, scope.session, head, 'creation') as
      | { initialModelSelection?: Selection }
      | undefined,
  }
  const saved = oneRow(
    port,
    `SELECT entry, revision FROM sl_entry
      WHERE tenant = ? AND session = ? AND kind = 'session.model-selected'
      ORDER BY position DESC LIMIT 1`,
    bind,
  )
  let selection: Selection | undefined
  let at = 1n
  if (saved !== undefined) {
    const entry = readEntryText(text(saved['entry']), 'sl_entry session.model-selected')
    const declaration = (
      plainOf(entry.payload) as {
        declaration?: { kind?: string; name?: string; basis?: unknown }
      } | null
    )?.declaration
    if (declaration?.kind === 'model' && declaration.name !== undefined) {
      selection = { name: declaration.name, basis: declaration.basis }
      at = big(saved['revision'])
    }
  }
  selection ??= snapshot.creation?.initialModelSelection
  if (selection === undefined) return { kind: 'not-ready' }
  const origin = oneRow(
    port,
    'SELECT receipt FROM sl_operation WHERE tenant = ? AND session = ? AND revision = ? LIMIT 1',
    [scope.tenant, scope.session, at],
  )
  if (origin === undefined) return { kind: 'no-origin' }
  return {
    kind: 'selection',
    selection: selection as never,
    revision: snapshot.revision,
    source: (JSON.parse(text(origin['receipt'])) as { source: never }).source,
  }
})
