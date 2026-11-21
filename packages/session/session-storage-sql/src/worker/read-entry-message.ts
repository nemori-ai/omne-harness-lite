import { encodeValue, plainOf } from '../codec.ts'
import { judgeMessage, projectMessage } from '@omne-harness/message'
import { modelViewPrefix } from '../model-view-identity.ts'
import { readSharedEntry } from './shared-messages.ts'
import { entrySession, viewOf } from './fork.ts'
import { handler, oneRow, packed, scopeOf, text } from './support.ts'

export default handler('session.entry-message', (raw, port) => {
  const scope = scopeOf(raw)
  const input = raw as Readonly<{ entry: unknown; epoch: unknown }>
  if (
    scope === null ||
    typeof input.entry !== 'string' ||
    !/^[1-9][0-9]*$/.test(input.entry) ||
    (input.epoch !== null && typeof input.epoch !== 'string')
  )
    throw new TypeError('invalid input')
  if (input.epoch !== null) {
    const head = oneRow(
      port,
      'SELECT epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
      [scope.tenant, scope.session],
    )
    if (
      head === undefined ||
      `${modelViewPrefix(scope.tenant, scope.session)}${text(head['epoch'])}` !== input.epoch
    )
      return { kind: 'changed' }
    const visible = viewOf(port, scope, text(head['epoch'])).rowOf(input.entry)
    if (visible === undefined) return { kind: 'absent' }
  }
  // An entry at or below the fork of the session was written by a session up its chain.
  const position = BigInt(input.entry)
  const row = oneRow(
    port,
    'SELECT entry FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
    [scope.tenant, entrySession(port, scope, position), position],
  )
  if (row === undefined) return { kind: 'absent' }
  const entry = readSharedEntry(port, scope.tenant, packed(row['entry']))
  const body = plainOf(entry.payload)
  if (
    !entry.kind.startsWith('message.') ||
    body === null ||
    typeof body !== 'object' ||
    !('message' in body)
  )
    return { kind: 'absent' }
  const judged = judgeMessage(body.message)
  const projected = 'ok' in judged ? projectMessage(judged.ok, 'toModel') : null
  return projected === null
    ? { kind: 'absent' }
    : { kind: 'message', message: encodeValue(projected.message) }
})
