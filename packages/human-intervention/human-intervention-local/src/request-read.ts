import { RequestRefSchema } from '@omne-harness/human-intervention'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { json } from './encoding.ts'
import { REQUEST_HANDLER, REQUEST_PROTOCOL } from './request-schema.ts'
import { readRequest } from './request-record.ts'
export default {
  handler: REQUEST_HANDLER,
  protocol: REQUEST_PROTOCOL,
  read(input, port) {
    const parsed = RequestRefSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'hitl_request_query' }
    return { kind: 'read', output: json(readRequest(port, parsed.data) ?? null) }
  },
} satisfies ReadHandlerModule
