// The due entries of one tenant with `due_at <= now` (`domain-serial`): oldest first, then by
// domain and key, at most `limit`. It is ordered after every commit admitted before it, so an
// entry a committed commit scheduled is in the answer.
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parseDueReadInput, type DomainKind, type DueReadOutput } from './facts.ts'
import { DUE_READ_ENTRIES, DUE_READ_HANDLER, PROTOCOL } from './schema.ts'
import { rowsOf, text } from './support.ts'

const isDomainKind = (value: string): value is DomainKind =>
  value === 'call' || value === 'queue' || value === 'host'

const handler: ReadHandlerModule = {
  handler: DUE_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const query = parseDueReadInput(input)
    if (query === null) return { kind: 'failed', diagnostic: 'not a due query' }
    if (query.limit > DUE_READ_ENTRIES)
      return {
        kind: 'failed',
        diagnostic: `a due read returns at most ${DUE_READ_ENTRIES} entries`,
      }
    const rows = rowsOf(
      port,
      `SELECT kind, name, key, due_at FROM tl_due WHERE tenant = ? AND due_at <= ?
        ORDER BY due_at, key, kind, name LIMIT ?`,
      [query.tenant, query.now, BigInt(query.limit)],
    )
    const entries: Readonly<{ kind: DomainKind; name: string; key: string; dueAt: string }>[] = []
    for (const row of rows) {
      const kind = text(row['kind'])
      if (!isDomainKind(kind))
        return { kind: 'failed', diagnostic: 'a due row names no domain kind' }
      entries.push({
        kind,
        name: text(row['name']),
        key: text(row['key']),
        dueAt: text(row['due_at']),
      })
    }
    const output: DueReadOutput = { entries }
    return { kind: 'read', output }
  },
}
export default handler
