import { SegmentUnreadable, viewOf, type View } from './fork.ts'
import { big, handler, oneRow, PAGE_ROWS, scopeOf, text, type Row } from './support.ts'
import { viewMessageText } from './shared-messages.ts'

type Input = Readonly<{
  epoch: string | null
  upper: string | null
  after: string | null
  pageBytes: number
}>

/** The rows of a page, or null when a segment the view stands on cannot be read: never a part of them. */
function readable(view: View, after: bigint, upper: bigint): Row[] | null {
  try {
    return view.rows(after, upper, PAGE_ROWS + 1)
  } catch (error) {
    if (error instanceof SegmentUnreadable) return null
    throw error
  }
}

export default handler('session.model-view', (raw, port) => {
  const scope = scopeOf(raw)
  const input = raw as unknown as Input
  if (scope === null || !Number.isInteger(input.pageBytes) || input.pageBytes < 1)
    throw new Error('invalid input')
  const bind = [scope.tenant, scope.session]
  const journal = oneRow(
    port,
    'SELECT epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    bind,
  )
  if (journal === undefined) return { kind: 'absent' }
  const epoch = text(journal['epoch'])
  const view = viewOf(port, scope, epoch)
  const current = { epoch, upper: String(view.upper()) }
  if (input.epoch !== null && input.epoch !== epoch) return { kind: 'epoch-changed', current }
  const upper = input.upper === null ? BigInt(current.upper) : BigInt(input.upper)
  const after = input.after === null ? 0n : BigInt(input.after)
  if (after < 0n || upper > BigInt(current.upper) || after > upper)
    return { kind: 'invalid-bounds' }
  const rows = readable(view, after, upper)
  if (rows === null) return { kind: 'unreadable' }
  const taken: typeof rows = []
  let bytes = 0
  for (const row of rows.slice(0, PAGE_ROWS)) {
    const size = Number(row['bytes'])
    if (taken.length > 0 && bytes + size > input.pageBytes) break
    taken.push(row)
    bytes += size
  }
  const lastTaken = taken[taken.length - 1]
  const lastSeq = lastTaken === undefined ? after : big(lastTaken['seq'])
  return {
    kind: 'page',
    basis: { epoch, upper: String(upper) },
    rows: taken.map(row => ({
      seq: String(row['seq']),
      entry: text(row['entry']),
      bytes: Number(row['bytes']),
      prefixDigest: text(row['prefix_digest']),
      ...(row['provenance'] == null ? {} : { provenance: JSON.parse(text(row['provenance'])) }),
      message: JSON.parse(viewMessageText(port, scope.tenant, text(row['message']))),
    })),
    next: lastSeq < upper ? String(lastSeq) : null,
  }
})
