import { z } from 'zod'
import { SettingsIdSchema } from '@omne-harness/settings'
import {
  changeHoldingSchema,
  domainSchema,
  grantsSchema,
  holdSchema,
  receiptSchema,
} from './schema.ts'

const sourceIds = z
  .array(SettingsIdSchema)
  .min(1)
  .max(32)
  .refine(ids => new Set(ids).size === ids.length)
const historicalHold = z
  .strictObject(holdSchema.shape)
  .omit({ sources: true })
  .extend({
    kind: z.literal('hold'),
    sourceIds,
  })
  .refine(command => command.grants.every(grant => command.sourceIds.includes(grant.sourceId)))
const historicalSources = z.strictObject({
  kind: z.literal('updateSources'),
  sourceIds,
  grants: grantsSchema,
})
const historicalChange = changeHoldingSchema.extend({
  kind: z.literal('changeHolding'),
  change: historicalSources,
})

// Historical command bytes identify a receipt; they never authorize a new mutation.
export const recordedReceiptSchema = z.union([
  receiptSchema,
  receiptSchema.extend({
    binding: z.strictObject({
      domain: domainSchema,
      command: z.union([historicalHold, historicalChange]),
    }),
  }),
])
