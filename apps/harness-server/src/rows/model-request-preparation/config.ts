import { z } from 'zod'

const text = z.string().min(1)
const count = z.number().int().positive()
const adoption = z.strictObject({ owner: text, name: text, revision: text, digest: text })

const family = z.strictObject({
  limits: z.strictObject({
    toolArguments: z.strictObject({
      maxBytes: count,
      maxDepth: count,
      maxItems: count,
      maxMembers: count,
      maxStringLength: count,
      maxNumberLength: count,
    }),
    maxReasoningText: count,
  }),
  margin: z.strictObject({
    percent: z.string().regex(/^(0|[1-9][0-9]*)$/),
    source: adoption,
  }),
})

export const modelRequestPreparationConfig = z.strictObject({
  maxCitedCalls: count,
  openai: family,
})

export type ModelRequestPreparationConfig = z.output<typeof modelRequestPreparationConfig>
