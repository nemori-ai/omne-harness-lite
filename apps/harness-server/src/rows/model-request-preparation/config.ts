// The row configuration of `model-request-preparation`. Every number is the operator's: the
// OpenAI family and the lease bound have no default (model-host-local SPEC), so a missing or
// out-of-range value fails the load. The schema checks shape and range; the family and the plugin
// check their own rules again when they are built.
import { z } from 'zod'

const text = z.string().min(1)
const count = z.number().int().positive()
const adoption = z.strictObject({ owner: text, name: text, revision: text, digest: text })

const family = z.strictObject({
  /** The decoder buffer limits of every binding of the family. */
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
  /** The margin of every input estimate: a non-negative decimal integer percent, and its adoption. */
  margin: z.strictObject({
    percent: z.string().regex(/^(0|[1-9][0-9]*)$/),
    source: adoption,
  }),
})

export const modelRequestPreparationConfig = z.strictObject({
  /** The most distinct calls one lineage may name. */
  maxCitedCalls: count,
  /** The only family of the single-machine profiles: `ModelProfilesLocalPlugin` publishes OpenAI. */
  openai: family,
})

export type ModelRequestPreparationConfig = z.output<typeof modelRequestPreparationConfig>
