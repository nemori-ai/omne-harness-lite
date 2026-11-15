import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue, isCount } from '../codec.ts'
import { workIndexOf, type WorkIndexInput } from './history-index.ts'
import { handler, readVersion, scopeOf } from './support.ts'

export default handler('session.work-index', (input, port) => {
  const scope = scopeOf(input)
  const { tail, published, snapshot } = input as Readonly<Record<string, JsonValue>>
  if (scope === null || !isCount(tail) || !isCount(published) || snapshot === undefined)
    throw new Error('invalid input')
  const version = readVersion(port, scope)
  if (version === undefined) return { kind: 'stale' }
  const now = version.published
  if (version.tail !== tail || BigInt(now) < BigInt(published)) return { kind: 'stale' }
  const index = workIndexOf(
    port,
    scope.tenant,
    scope.session,
    decodeValue(snapshot) as WorkIndexInput,
  )
  return index === 'too-many'
    ? { kind: 'too-many', published: now }
    : { kind: 'index', published: now, index: encodeValue(index.index) }
})
