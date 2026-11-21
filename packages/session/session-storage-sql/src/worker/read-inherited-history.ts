import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { readEntryText, writeEntryText } from '../entry-codec.ts'
import { entryOwners, FIRST_EPOCH, roleOf, SegmentUnreadable, viewOf } from './fork.ts'
import { readSharedEntry } from './shared-messages.ts'
import { big, handler, oneRow, packed, PAGE_ROWS, scopeOf, text, type Scope } from './support.ts'

type Input = Readonly<{ after: string; pageBytes: number; kinds: readonly string[] }>

function inputOf(raw: unknown): Readonly<{ scope: Scope; input: Input }> {
  const scope = scopeOf(raw)
  const input = raw as Input
  const valid =
    scope !== null &&
    typeof input.after === 'string' &&
    /^[0-9]+$/u.test(input.after) &&
    Array.isArray(input.kinds) &&
    Number.isInteger(input.pageBytes) &&
    input.pageBytes >= 1
  if (!valid) throw new Error('invalid input')
  return { scope, input }
}

type Page = { from: string | null; entries: string[]; last: bigint; interpreter: JsonValue }

/** Reads rows after `after` into a page until the source session changes or the page is full.
 * Null: an entry a row names is not there. */
function pageOf(port: ReadPort, scope: Scope, input: Input, inherited: bigint): Page | null {
  const after = BigInt(input.after)
  const ownerOf = entryOwners(port, scope)
  const page: Page = { from: null, entries: [], last: after, interpreter: null }
  let bytes = 0
  const view = viewOf(port, scope, FIRST_EPOCH)
  for (const row of view.rows(after, inherited, PAGE_ROWS, 'seq, entry, message')) {
    const position = BigInt(text(row['entry']))
    const owner = ownerOf(position)
    if (page.from !== null && owner !== page.from) break
    const stored = oneRow(
      port,
      'SELECT entry, bytes FROM sl_entry WHERE tenant = ? AND session = ? AND position = ? LIMIT 1',
      [scope.tenant, owner, position],
    )
    if (stored === undefined) return null
    const size = Number(stored['bytes'])
    if (page.entries.length > 0 && bytes + size > input.pageBytes) break
    page.from = owner
    page.last = big(row['seq'])
    page.interpreter ??= readEntryText(packed(stored['entry'])).schema as unknown as JsonValue
    // A row is of the kind of its message: a delivered user input is a user message.
    const kind = `message.${String(roleOf(text(row['message'])))}`
    if (input.kinds.length > 0 && !input.kinds.includes(kind)) continue
    page.entries.push(writeEntryText(readSharedEntry(port, scope.tenant, packed(stored['entry']))))
    bytes += size
  }
  return page
}

/** The entries behind the prefix of a forked session, a page for each source session.
 * `none`: the session has no prefix, or all of it was given. */
export default handler('session.history-inherited', (raw, port) => {
  const { scope, input } = inputOf(raw)
  const journal = oneRow(
    port,
    'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (journal === undefined) return { kind: 'absent' }
  const { inherited } = viewOf(port, scope, FIRST_EPOCH)
  if (BigInt(input.after) >= inherited) return { kind: 'none' }
  try {
    const page = pageOf(port, scope, input, inherited)
    if (page === null) return { kind: 'unreadable' }
    return { kind: 'page', ...page, last: String(page.last), upper: String(journal['tail']) }
  } catch (error) {
    if (error instanceof SegmentUnreadable) return { kind: 'unreadable' }
    throw error
  }
})
