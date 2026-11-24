import { arrangementOf } from '@omne-harness/canvas'
import { canvasIdSchema } from '@omne-harness/canvas-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { sqlFacts } from './facts.ts'
import { HANDLER, PROTOCOL } from './schema.ts'

/** One request per read of the store: the canvas of one tenant. */
export const readRequestSchema = z.strictObject({
  read: z.literal('look'),
  tenant: z.string().min(1),
  canvas: canvasIdSchema,
})
export type ReadRequest = z.infer<typeof readRequestSchema>

export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const request = readRequestSchema.safeParse(input)
    if (!request.success) return { kind: 'failed', diagnostic: 'invalid_canvas_read' }
    const { tenant, canvas } = request.data
    const arrangement = arrangementOf(sqlFacts(port, tenant), canvas)
    return { kind: 'read', output: JSON.parse(JSON.stringify(arrangement)) as JsonValue }
  },
} satisfies ReadHandlerModule
