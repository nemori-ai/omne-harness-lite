import { z } from 'zod'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { DELIVERY_HANDLER, DeliveryScanSchema } from './delivery-schema.ts'
import { WAIT_PROTOCOL } from './independent-schema.ts'
import { SqlSequenceSchema } from './sql-sequence.ts'
import { json } from './encoding.ts'
import { countSchema } from './relational-values.ts'
import { readInboxEntry } from './wait-record.ts'
import { pageBudget, readLimited } from './read-budget.ts'
export default {
  handler: DELIVERY_HANDLER,
  protocol: WAIT_PROTOCOL,
  read(input, port) {
    const parsed = DeliveryScanSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'delivery_query' }
    const q = parsed.data
    const keys = port.execute(
      `SELECT CAST(inbox_sequence AS TEXT),wait_key,card_ordinal FROM hi_wait_pending_v2 INDEXED BY hi_wait_pending_delivery_v2
 WHERE tenant_ref=? AND owner_actor=? AND destination=? AND inbox_sequence>? ORDER BY inbox_sequence LIMIT ?`,
      [q.tenantRef, q.actorRef, q.destination, BigInt(q.after), q.limit + 1],
    ).rows
    const items = [],
      budget = pageBudget()
    let after = q.after
    for (const key of keys.slice(0, q.limit)) {
      const sequence = SqlSequenceSchema.parse(key[0]),
        loaded = readInboxEntry(port, q.tenantRef, sequence)
      if (
        loaded.key !== z.string().parse(key[1]) ||
        loaded.ordinal !== countSchema.parse(key[2]) ||
        loaded.entry.wait.destination !== q.destination
      )
        throw new TypeError('Pending delivery association mismatch')
      if (!budget.accept(loaded.entry)) {
        if (!items.length) return { kind: 'read', output: json(readLimited) }
        break
      }
      items.push(loaded.entry)
      after = sequence
    }
    return {
      kind: 'read',
      output: json({ kind: 'page', items, next: items.length < keys.length ? after : null }),
    }
  },
} satisfies ReadHandlerModule
