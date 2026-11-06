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
import { readActive, readControl, readInboxEntries, waitKey } from './independent-records.ts'
const querySchema = z.strictObject({
  tenantRef: TenantRefSchema,
  waitRef: WaitRefSchema,
  actorRef: HitlIdentifierSchema,
  kind: z.enum(['state', 'inbox', 'snapshot']),
  receiverGeneration: ReceiverGenerationSchema.optional(),
})
export default {
  handler: WAIT_HANDLER,
  protocol: WAIT_PROTOCOL,
  read(input, port) {
    const parsed = querySchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'wait_query' }
    const query = parsed.data
    const key = waitKey(query.tenantRef, query.waitRef)
    const state = readControl(port, key)
    if (!state || !state.preparation.readers.includes(query.actorRef))
      return { kind: 'read', output: { kind: 'denied' } }
    if (query.kind === 'snapshot')
      return {
        kind: 'read',
        output: json({
          kind: 'snapshot',
          state,
          active: readActive(port, key) ?? null,
          decisions: readInboxEntries(port, key),
        }),
      }
    if (query.kind === 'state')
      return {
        kind: 'read',
        output: json({ kind: 'found', state, active: readActive(port, key) ?? null }),
      }
    if (state.preparation.registration.operation.actorRef !== query.actorRef)
      return { kind: 'read', output: { kind: 'denied' } }
    if (state.receiver.kind !== 'bound' || query.receiverGeneration !== state.receiver.generation)
      return { kind: 'read', output: { kind: 'stale-generation' } }
    return {
      kind: 'read',
      output: json({ kind: 'page', decisions: readInboxEntries(port, key), next: null }),
    }
  },
} satisfies ReadHandlerModule
