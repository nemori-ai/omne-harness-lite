// The ledger domain read (`domain-serial`): the revision and every record of one domain of one
// tenant, each with the key it is stored under. A domain larger than the row bound is refused,
// never truncated.
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { parseDomainAddress, type LedgerReadOutput } from './facts.ts'
import { LEDGER_READ_HANDLER, LEDGER_READ_ROWS, PROTOCOL } from './schema.ts'
import { oneRow, rowsOf, text } from './support.ts'

const handler: ReadHandlerModule = {
  handler: LEDGER_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const address = parseDomainAddress(input)
    if (address === null) return { kind: 'failed', diagnostic: 'not a domain address' }
    const domain = [address.tenant, address.kind, address.name] as const
    const head = oneRow(
      port,
      'SELECT revision FROM tl_domain WHERE tenant = ? AND kind = ? AND name = ? LIMIT 1',
      domain,
    )
    const rows = rowsOf(
      port,
      `SELECT key, record FROM tl_record WHERE tenant = ? AND kind = ? AND name = ?
        ORDER BY key LIMIT ?`,
      [...domain, BigInt(LEDGER_READ_ROWS + 1)],
    )
    if (rows.length > LEDGER_READ_ROWS)
      return { kind: 'failed', diagnostic: 'the domain holds more records than one read returns' }
    const output: LedgerReadOutput = {
      revision: head === undefined ? null : text(head['revision']),
      records: rows.map(row => ({
        key: text(row['key']),
        record: JSON.parse(text(row['record'])) as JsonValue,
      })),
    }
    return { kind: 'read', output }
  },
}
export default handler
