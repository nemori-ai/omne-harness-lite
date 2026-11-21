import type { SessionCallKeys } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue, isCount } from '../codec.ts'
import { callsLeft } from './call-left.ts'
import { handler, scopeOf } from './support.ts'

export default handler('session.calls-left', (input, port) => {
  const scope = scopeOf(input)
  const { keys, through } = input as Readonly<Record<string, JsonValue>>
  if (scope === null || keys === undefined || !isCount(through)) throw new Error('invalid input')
  const calls = callsLeft(port, scope, BigInt(through))(decodeValue(keys) as SessionCallKeys)
  return { kind: 'calls', calls: encodeValue(calls) }
})
