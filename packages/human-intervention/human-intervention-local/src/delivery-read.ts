import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { DELIVERY_HANDLER, DeliveryScanSchema, type DeliveryScan } from './delivery-schema.ts'
import {
  WAIT_PROTOCOL,
  IndependentControlSchema,
  InboxEntrySchema,
  type InboxEntry,
  type IndependentControl,
} from './independent-schema.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'
import { equal, json } from './encoding.ts'

function belongs(input: DeliveryScan, control: IndependentControl, entry: InboxEntry) {
  const registration = control.preparation.registration
  return (
    registration.operation.tenantRef === input.tenantRef &&
    registration.operation.actorRef === input.actorRef &&
    registration.origin.wait.destination === input.destination &&
    equal(registration.origin.wait, entry.wait) &&
    !control.receipts.some(receipt => equal(receipt.decision, entry.decision.ref))
  )
}
export default {
  handler: DELIVERY_HANDLER,
  protocol: WAIT_PROTOCOL,
  read(input, port) {
    const parsed = DeliveryScanSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'delivery_query' }
    const query = parsed.data
    const rows = port.execute(
      'SELECT CAST(i.sequence AS TEXT), i.record, c.record FROM hi_wait_inbox i LEFT JOIN hi_wait_controls c ON c.wait_key = i.wait_key WHERE i.sequence > ? ORDER BY i.sequence LIMIT 65',
      [BigInt(query.after)],
    ).rows
    const items: InboxEntry[] = []
    let after = query.after,
      scanned = 0
    for (const row of rows.slice(0, 64)) {
      const entryCell = row[1],
        controlCell = row[2]
      if (typeof entryCell !== 'string' || typeof controlCell !== 'string')
        return { kind: 'failed', diagnostic: 'delivery_record' }
      const entry = InboxEntrySchema.parse(JSON.parse(entryCell))
      const control = IndependentControlSchema.parse(JSON.parse(controlCell))
      if (belongs(query, control, entry)) items.push(entry)
      after = SqlSequenceSchema.parse(row[0])
      scanned++
      if (items.length === query.limit) break
    }
    return {
      kind: 'read',
      output: json({ kind: 'page', items, next: scanned < rows.length ? after : null }),
    }
  },
} satisfies ReadHandlerModule
