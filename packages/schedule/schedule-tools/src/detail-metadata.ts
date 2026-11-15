import { z } from 'zod'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolWaitId,
  decodeToolResultVersion,
  decodeToolDeliveryId,
} from '@omne-harness/tool-contract/provider'
import { evidenceSchema, toolIdentitySchema } from './protocol.ts'

const interruption = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('control'),
    operation: toolIdentitySchema(decodeToolOperationId),
    withdrawn: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('foreground-limit') }),
  z.strictObject({ kind: z.literal('resume-rejected'), exclusion: evidenceSchema }),
])
const terminal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed') }),
  z.strictObject({
    kind: z.literal('failed'),
    cause: z.enum(['arguments', 'environment', 'executor', 'runtime-lost', 'result']),
    diagnostic: z.string(),
  }),
  z.strictObject({ kind: z.literal('unavailable'), reason: z.string() }),
  z.strictObject({ kind: z.literal('interrupted'), cause: interruption }),
  z.strictObject({
    kind: z.literal('no-response'),
    wait: toolIdentitySchema(decodeToolWaitId),
    reason: z.string(),
  }),
])
export const detailPageSchema = z.strictObject({
  result: toolIdentitySchema(decodeToolResultVersion),
  terminal,
  actualTerminal: terminal.nullable(),
  effect: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('not-started') }),
    z.strictObject({ kind: z.enum(['not-occurred', 'occurred']), evidence: evidenceSchema }),
    z.strictObject({ kind: z.literal('unknown'), diagnostic: z.string() }),
  ]),
  relation: z.enum(['original', 'late']),
  delivery: toolIdentitySchema(decodeToolDeliveryId),
  source: evidenceSchema,
  value: z.unknown(),
  next: z.string().min(1).nullable(),
})
