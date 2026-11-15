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
