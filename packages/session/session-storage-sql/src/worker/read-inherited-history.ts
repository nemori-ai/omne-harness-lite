import type { JsonValue } from '@omne-harness/sql-contract'
import { readEntryText, writeEntryText } from '../entry-codec.ts'
import { entryOwners, FIRST_EPOCH, roleOf, SegmentUnreadable, viewOf } from './fork.ts'
import { readSharedEntry } from './shared-messages.ts'
import { big, handler, oneRow, packed, PAGE_ROWS, scopeOf, text } from './support.ts'

type Input = Readonly<{ after: string; pageBytes: number; kinds: readonly string[] }>

/** The entries behind the prefix of a forked session, a page for each source session. A row is of the
 * kind of its message: a delivered user input is a user message. `none`: no prefix left to give. */
export default handler('session.history-inherited', (raw, port) => {
  const scope = scopeOf(raw)
  const input = raw as unknown as Input
  if (
    scope === null ||
    typeof input.after !== 'string' ||
    !/^[0-9]+$/u.test(input.after) ||
    !Array.isArray(input.kinds) ||
    !Number.isInteger(input.pageBytes) ||
    input.pageBytes < 1
  )
    throw new Error('invalid input')
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (journal === undefined) return { kind: 'absent' }
  const view = viewOf(port, scope, FIRST_EPOCH)
  const after = BigInt(input.after)
  if (after >= view.inherited) return { kind: 'none' }
  const ownerOf = entryOwners(port, scope)
  const taken: string[] = []
  let from: string | null = null
  let interpreter: JsonValue = null
  let bytes = 0
  let last = after
  try {
    for (const row of view.rows(after, view.inherited, PAGE_ROWS, 'seq, entry, message')) {
      const position = BigInt(text(row['entry']))
      const owner = ownerOf(position)
      if (from !== null && owner !== from) break
      const stored = oneRow(
        port,
        'SELECT entry, bytes FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
        [scope.tenant, owner, position],
      )
      if (stored === undefined) return { kind: 'unreadable' }
      const size = Number(stored['bytes'])
      if (taken.length > 0 && bytes + size > input.pageBytes) break
      from = owner
      last = big(row['seq'])
      interpreter ??= readEntryText(packed(stored['entry'])).schema as unknown as JsonValue
      const kind = `message.${String(roleOf(text(row['message'])))}`
      if (input.kinds.length > 0 && !input.kinds.includes(kind)) continue
      taken.push(writeEntryText(readSharedEntry(port, scope.tenant, packed(stored['entry']))))
      bytes += size
    }
  } catch (error) {
    if (error instanceof SegmentUnreadable) return { kind: 'unreadable' }
    throw error
  }
  return {
    kind: 'page',
    from,
    entries: taken,
    last: String(last),
    upper: String(journal['tail']),
    interpreter,
  }
})
