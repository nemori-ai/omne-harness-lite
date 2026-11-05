import { z } from 'zod'
import type { JsonValue } from '@omne-harness/assets'
export const bodySchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('null') }),
    z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
    z.strictObject({ kind: z.literal('string'), value: z.string() }),
    z.strictObject({
      kind: z.literal('number'),
      lexeme: z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/),
    }),
    z.strictObject({ kind: z.literal('array'), items: z.array(bodySchema) }),
    z.strictObject({
      kind: z.literal('object'),
      entries: z
        .array(z.strictObject({ key: z.string(), value: bodySchema }))
        .refine(entries => new Set(entries.map(entry => entry.key)).size === entries.length),
    }),
  ]),
)
