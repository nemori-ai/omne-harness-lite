// The version of the `readWork` answer of one session (SPEC RT-04): the Session tail and the Agent
// publication count, by two primary-key point reads in one snapshot. It reads no snapshot row (not
// even `sl_state.covered`, which SQLite reaches only past the overflow pages of the snapshot text),
// no entry and no index row, so its rows and bytes do not depend on the size of the session.
import { handler, readVersion, scopeOf } from './support.ts'

export default handler('session.work-version', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const version = readVersion(port, scope)
  return version === undefined ? { kind: 'absent' } : { kind: 'version', ...version }
})
