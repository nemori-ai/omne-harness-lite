import { z } from 'zod'
import { blobDigest, canonicalText } from '../codec.ts'
import { modelViewPrefix } from '../model-view-identity.ts'
import { MAX_COMPACTION_ROWS, readCompactionWindow } from './compaction-window.ts'
import { handler, oneRow, rowsOf, scopeOf, text } from './support.ts'

const historyShape = z.object({
  epoch: z.string(),
  origin: z.string(),
  upper: z.string(),
  base: z.unknown(),
  logOrder: z.array(z.string()),
  barriers: z.array(z.string()),
  protected: z.array(z.string()),
  entries: z.array(z.object({ ref: z.string(), sequence: z.string(), message: z.string() })),
})

export default handler('session.compaction-input-check', (raw, port) => {
  const scope = scopeOf(raw)
  const input = historyShape.safeParse((raw as { history?: unknown }).history)
  if (scope === null || !input.success)
    return { kind: 'invalid', reason: 'invalid history manifest' }
  const history = input.data
  const journal = oneRow(
    port,
    'SELECT epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (journal === undefined) return { kind: 'unavailable' }
  const epoch = text(journal['epoch'])
  if (history.epoch !== `${modelViewPrefix(scope.tenant, scope.session)}${epoch}`)
    return { kind: 'changed' }
  const current = readCompactionWindow(port, { ...scope, epoch, upper: null, coverTo: null })
  if (current.kind !== 'context') return { kind: 'unavailable' }
  const window = current.value
  const stored = rowsOf(
    port,
    `SELECT entry, seq FROM sl_model_view
    WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY seq LIMIT ?`,
    [scope.tenant, scope.session, epoch, BigInt(MAX_COMPACTION_ROWS + 1)],
  )
  const rows = [...window.covered, ...window.after]
  const messages = new Map(
    rows.filter(row => row.message !== null).map(row => [String(row.ref), row.message]),
  )
  const entries = stored.filter(row => messages.has(text(row['entry'])))
  const visible = new Set(entries.map(row => text(row['entry'])))
  if (
    entries.length !== history.entries.length ||
    entries.some((row, index) => {
      const entry = history.entries[index]
      const ref = text(row['entry'])
      const message = messages.get(ref)
      return (
        entry?.ref !== ref ||
        entry.sequence !== String(BigInt(String(row['seq'])) - 1n) ||
        message === undefined ||
        entry.message !== blobDigest(canonicalText(message))
      )
    })
  )
    return {
      kind: 'invalid',
      reason: 'the supplied messages are not the complete current model view',
    }
  const expected = {
    origin: window.origin,
    upper: window.covered.at(-1)?.ref,
    base: window.base,
    logOrder: rows.map(row => row.ref),
    barriers: window.open.filter(ref => !visible.has(ref)),
    protected: window.open.filter(ref => visible.has(ref)),
  }
  const actual = {
    origin: history.origin,
    upper: history.upper,
    base: history.base,
    logOrder: history.logOrder,
    barriers: history.barriers,
    protected: history.protected,
  }
  return canonicalText(actual) === canonicalText(expected)
    ? { kind: 'verified' }
    : {
        kind: 'invalid',
        reason: 'the history provenance or protection differs from the current log',
      }
})
