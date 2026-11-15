import { handler, readVersion, scopeOf } from './support.ts'

export default handler('session.work-version', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const version = readVersion(port, scope)
  return version === undefined ? { kind: 'absent' } : { kind: 'version', ...version }
})
