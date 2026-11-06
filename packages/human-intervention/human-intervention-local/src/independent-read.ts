import { stringCell } from './string-cell.ts'
import { z } from 'zod'
import {
  HitlIdentifierSchema,
  ReceiverGenerationSchema,
  TenantRefSchema,
  WaitRefSchema,
} from '@omne-harness/human-intervention'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { json } from './encoding.ts'
import { WAIT_HANDLER, WAIT_PROTOCOL } from './independent-schema.ts'
import {
  readActiveHeader,
  readInboxEntry,
  readInboxKeys,
  readReceipts,
  readWait,
  waitKey,
} from './wait-record.ts'
import { countSchema } from './relational-values.ts'
import { pageBudget, readLimited, itemBytes, READ_BYTES } from './read-budget.ts'
const querySchema = z.strictObject({
  tenantRef: TenantRefSchema,
  waitRef: WaitRefSchema,
  actorRef: HitlIdentifierSchema,
  kind: z.enum(['state', 'inbox', 'snapshot']),
  receiverGeneration: ReceiverGenerationSchema.optional(),
  offset: z.number().int().min(0).max(64).default(0),
  limit: z.number().int().min(1).max(100).default(64),
})
export default {
  handler: WAIT_HANDLER,
  protocol: WAIT_PROTOCOL,
  read(input, port) {
    const parsed = querySchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'wait_query' }
    const q = parsed.data,
      state = readWait(port, q.tenantRef, q.waitRef, q.actorRef)
    if (!state) return { kind: 'read', output: { kind: 'denied' } }
    if (q.kind !== 'inbox') {
      const receipts = readReceipts(port, q.tenantRef, q.waitRef)
      if (receipts.length !== state.receiptCount) throw new TypeError('Receipt count mismatch')
      const active = readActiveHeader(port, q.tenantRef, q.waitRef) ?? null
      const hasDecisions = readInboxKeys(port, q.tenantRef, q.waitRef, 0, 1).length !== 0
      const snapshot = { kind: 'snapshot', state: { ...state, receipts }, active, hasDecisions }
      return {
        kind: 'read',
        output: json(itemBytes(snapshot) > READ_BYTES ? readLimited : snapshot),
      }
    }
    if (state.preparation.ownerActor !== q.actorRef)
      return { kind: 'read', output: { kind: 'denied' } }
    if (state.receiver.kind !== 'bound' || state.receiver.generation !== q.receiverGeneration)
      return { kind: 'read', output: { kind: 'stale-generation' } }
    const count = countSchema.parse(
      port.execute(
        'SELECT count(*) FROM hi_wait_inbox_v2 WHERE tenant_ref=? AND wait_key=? LIMIT 1',
        [stringCell(q.tenantRef), waitKey(q.tenantRef, q.waitRef)],
      ).rows[0]?.[0],
    )
    if (q.offset > count)
      return { kind: 'read', output: { kind: 'conflict', reason: 'inbox-position' } }
    const keys = readInboxKeys(port, q.tenantRef, q.waitRef, q.offset, Math.min(q.limit + 1, 64))
    const decisions = [],
      budget = pageBudget()
    for (const key of keys.slice(0, q.limit)) {
      const loaded = readInboxEntry(port, q.tenantRef, key.sequence)
      if (loaded.key !== waitKey(q.tenantRef, q.waitRef) || loaded.ordinal !== key.ordinal)
        throw new TypeError('Inbox key mismatch')
      if (!budget.accept(loaded.entry)) {
        if (!decisions.length) return { kind: 'read', output: json(readLimited) }
        break
      }
      decisions.push(loaded.entry)
    }
    const after = q.offset + decisions.length
    return {
      kind: 'read',
      output: json({ kind: 'page', decisions, next: after < count ? after : null }),
    }
  },
} satisfies ReadHandlerModule
