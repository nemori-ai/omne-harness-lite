// R1: the authoritative snapshot of one session, with the history index of its pending inputs read
// in the same snapshot (the memory pair of session-contract answers `readWork` the same way). The
// index is a read projection: it is never stored in the snapshot row. Over the read bound the
// snapshot comes without an index, which the pure layer reads as unknown, never as empty. The
// answer names the version it was read at, so the work cache keeps it under that version.
import { encodeValue } from '../codec.ts'
import { workIndexOf } from './history-index.ts'
import { readState } from './state-rows.ts'
import { big, handler, readVersion, scopeOf } from './support.ts'

export default handler('session.work', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const version = readVersion(port, scope)
  if (version === undefined) return { kind: 'absent' }
  const stored = readState(port, scope.tenant, scope.session, big(version.tail))
  if (stored === 'behind') return { kind: 'behind' }
  const { snapshot } = stored
  const history = workIndexOf(port, scope.tenant, scope.session, snapshot)
  return {
    kind: 'state',
    // The version this answer was read at, from the same snapshot (SPEC RT-04), and the length of
    // the stored text, which the work cache counts against its byte bound.
    tail: version.tail,
    covered: version.tail,
    published: version.published,
    bytes: stored.layout.bytes,
    snapshot:
      history === 'too-many'
        ? encodeValue(snapshot)
        : encodeValue({ ...snapshot, historyIndex: history.index }),
  }
})
