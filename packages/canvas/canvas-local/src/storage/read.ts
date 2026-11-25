import { arrangementOf, awayOf, placingOf } from '@omne-harness/canvas'
import { canvasIdSchema, referenceSchema } from '@omne-harness/canvas-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { sqlFacts } from './facts.ts'
import { HANDLER, PROTOCOL } from './schema.ts'

const of = { tenant: z.string().min(1), canvas: canvasIdSchema }

/** One request per read of the store, of the canvas of one tenant. */
export const readRequestSchema = z.discriminatedUnion('read', [
  z.strictObject({ read: z.literal('look'), ...of }),
  z.strictObject({
    read: z.literal('away'),
    ...of,
    limit: z.number().int().positive(),
    before: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ read: z.literal('placing'), ...of, reference: referenceSchema }),
])
export type ReadRequest = z.input<typeof readRequestSchema>

export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    const parsed = readRequestSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'invalid_canvas_read' }
    const request = parsed.data
    const facts = sqlFacts(port, request.tenant)
    const output =
      request.read === 'look'
        ? arrangementOf(facts, request.canvas)
        : request.read === 'away'
          ? awayOf(facts, request.canvas, request)
          : placingOf(facts, request.canvas, request.reference)
    return { kind: 'read', output: JSON.parse(JSON.stringify(output)) as JsonValue }
  },
} satisfies ReadHandlerModule
