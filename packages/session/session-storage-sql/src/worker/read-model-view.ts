// R5: one byte-bounded page of the model view of one epoch.
import { big, handler, oneRow, PAGE_ROWS, rowsOf, scopeOf, text } from './support.ts'

type Input = Readonly<{
  epoch: string | null
  upper: string | null
  after: string | null
  pageBytes: number
}>

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
  const head = oneRow(
    port,
    'SELECT COALESCE(MAX(seq), 0) AS s FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ?',
    [...bind, epoch],
  )
  const current = { epoch, upper: String(head?.['s'] ?? 0) }
  if (input.epoch !== null && input.epoch !== epoch) return { kind: 'epoch-changed', current }
  const upper = input.upper === null ? BigInt(current.upper) : BigInt(input.upper)
  const after = input.after === null ? 0n : BigInt(input.after)
  if (after < 0n || upper > BigInt(current.upper) || after > upper)
    return { kind: 'invalid-bounds' }
  const rows = rowsOf(
    port,
    `SELECT seq, entry, bytes, prefix_digest, message FROM sl_model_view
      WHERE tenant = ? AND session = ? AND epoch = ? AND seq > ? AND seq <= ? ORDER BY seq LIMIT ?`,
    [...bind, epoch, after, upper, BigInt(PAGE_ROWS + 1)],
  )
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
      message: JSON.parse(text(row['message'])),
    })),
    next: lastSeq < upper ? String(lastSeq) : null,
  }
})
