import { encodeValue } from '../codec.ts'
import { readCompactionWindow } from './compaction-window.ts'
import { handler, scopeOf } from './support.ts'

export default handler('session.compaction-context', (raw, port) => {
  const scope = scopeOf(raw)
  const input = raw as Readonly<{ epoch: unknown; upper: unknown; coverTo: unknown }>
  if (
    scope === null ||
    typeof input.epoch !== 'string' ||
    typeof input.upper !== 'string' ||
    (input.coverTo !== null && typeof input.coverTo !== 'string')
  )
    throw new TypeError('invalid compaction context request')
  return encodeValue(
    readCompactionWindow(port, {
      ...scope,
      epoch: input.epoch,
      upper: input.upper,
      coverTo: input.coverTo,
    }),
  )
})
