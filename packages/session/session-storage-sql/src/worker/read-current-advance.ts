import { encodeValue } from '../codec.ts'
import { readAdvanceState } from './current-advance.ts'
import { handler, scopeOf } from './support.ts'

export default handler('session.current-advance', (input, port) => {
  const scope = scopeOf(input)
  if (scope === null) throw new Error('invalid input')
  const state = readAdvanceState(port, scope)
  return encodeValue(state.kind === 'advance' ? { kind: state.kind, value: state.value } : state)
})
