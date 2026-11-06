import { z } from 'zod'
import {
  CardRefSchema,
  HitlIdentifierSchema,
  RequestRefSchema,
} from '@omne-harness/human-intervention'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { json } from './encoding.ts'
import { REQUEST_HANDLER, REQUEST_PROTOCOL } from './request-schema.ts'
import { readCard, readRequest, readRequestHeader, readRequestRoute } from './request-record.ts'
import { itemBytes, READ_BYTES, readLimited } from './read-budget.ts'
export const RequestReadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('request'),
    ref: RequestRefSchema,
    actorRef: HitlIdentifierSchema,
  }),
  z.strictObject({ kind: z.literal('card'), ref: CardRefSchema, actorRef: HitlIdentifierSchema }),
  z.strictObject({
    kind: z.literal('route'),
    ref: RequestRefSchema,
    actorRef: HitlIdentifierSchema,
  }),
])
export default {
  handler: REQUEST_HANDLER,
  protocol: REQUEST_PROTOCOL,
  read(input, port) {
    const parsed = RequestReadSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'hitl_request_query' }
    const query = parsed.data
    if (query.kind === 'route')
      return {
        kind: 'read',
        output: json(readRequestRoute(port, query.ref, query.actorRef) ?? null),
      }
    if (query.kind === 'request') {
      const record = readRequest(port, query.ref, query.actorRef) ?? null
      return { kind: 'read', output: json(itemBytes(record) > READ_BYTES ? readLimited : record) }
    }
    const request = readRequestHeader(port, query.ref.request, query.actorRef)
    const card = request ? readCard(port, request, query.ref.cardId) : undefined
    const item =
      request && card
        ? { card: card.card, origin: request.origin, displayContext: request.displayContext }
        : null
    return { kind: 'read', output: json(itemBytes(item) > READ_BYTES ? readLimited : item) }
  },
} satisfies ReadHandlerModule
