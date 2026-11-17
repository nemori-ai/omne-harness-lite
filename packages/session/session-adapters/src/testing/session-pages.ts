import type { SessionId, HistoryEntry, HistoryPage } from '@omne-harness/session-contract'
import { canonical as canonicalText, decodedRow } from './session-values.ts'
import type { SessionState } from './root.ts'

// History pages of the memory Session transactions: cursors and one page of rows.

export const TESTING_OWNER = '@omne-harness/session-adapters/testing'

export type Cursor = Readonly<{
  tenant: string
  session: SessionId
  kinds: readonly string[]
  direction: 'forward' | 'backward'
  upper: number
  scanned: number
  pageBytes: number
}>

export function entryBytes(entry: HistoryEntry): number {
  return Buffer.byteLength(canonicalText(entry), 'utf8')
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(text: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const cursor = parsed as Record<string, unknown>
    if (typeof cursor['tenant'] !== 'string' || typeof cursor['session'] !== 'string') return null
    if (!Array.isArray(cursor['kinds']) || typeof cursor['upper'] !== 'number') return null
    if (typeof cursor['scanned'] !== 'number' || typeof cursor['pageBytes'] !== 'number')
      return null
    if (cursor['direction'] !== 'forward' && cursor['direction'] !== 'backward') return null
    return cursor as Cursor
  } catch {
    return null
  }
}

export function historyPage(store: SessionState, issued: Set<string>, cursor: Cursor): HistoryPage {
  const upper = Math.min(cursor.upper, store.entries.length)
  const forward = cursor.direction === 'forward'
  const matches = (entry: HistoryEntry): boolean =>
    cursor.kinds.length === 0 || cursor.kinds.includes(entry.kind)
  const taken: HistoryEntry[] = []
  let scanned = cursor.scanned
  let bytes = 0
  while (forward ? scanned < upper : scanned < upper) {
    const index = forward ? scanned : upper - scanned - 1
    const entry = store.entries[index] as HistoryEntry
    if (matches(entry)) {
      const size = entryBytes(entry)
      if (taken.length > 0 && bytes + size > cursor.pageBytes) break
      taken.push(entry)
      bytes += size
    }
    scanned += 1
  }
  const exhausted = scanned >= upper
  const next: Cursor = { ...cursor, upper, scanned }
  const token = encodeCursor(next)
  if (!exhausted) issued.add(token)
  return {
    source: TESTING_OWNER,
    interpreter: store.snapshot.interpreter,
    upper: store.entries[upper - 1]?.revision ?? store.snapshot.revision,
    entries: taken,
    scannedThrough: String(scanned),
    next: exhausted ? null : token,
    exhausted,
    annotations: store.entries.slice(0, upper).filter(entry => {
      const decoded = decodedRow(entry)
      return (
        'ok' in decoded &&
        decoded.ok.kind === 'history.annotated' &&
        'targets' in decoded.ok &&
        !taken.includes(entry) &&
        decoded.ok.targets.some(target => taken.some(row => row.id === target))
      )
    }),
  }
}
