import { z } from 'zod'
import { settingsAttemptBindingSchema } from './attempt-binding.ts'
import { intentAllocationSchema } from './intent-schema.ts'
import {
  sourceCustodyReferenceSchema,
  sourceCustodyPlanSchema,
  sourceCustodyMemberSchema,
  sourceCustodyRecordSchema,
} from './source-custody-schema.ts'
import {
  standingPlanInputSchema,
  standingReceiptInputSchema,
  standingSettlementInputSchema,
} from './standing-custody.ts'
import { equal } from './encoding.ts'

export const CHECKPOINT_COMMAND = {
  key: 'settings.checkpoint-command',
  protocol: 'settings-checkpoint/1',
}
export const checkpointCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('allocate'), input: intentAllocationSchema }),
  z.strictObject({ kind: z.literal('standing-plan'), input: standingPlanInputSchema }),
  z.strictObject({ kind: z.literal('standing-request'), input: sourceCustodyReferenceSchema }),
  z.strictObject({ kind: z.literal('standing-held'), input: standingReceiptInputSchema }),
  z.strictObject({ kind: z.literal('standing-settled'), input: standingSettlementInputSchema }),
  z.strictObject({ kind: z.literal('sources-plan'), input: sourceCustodyPlanSchema }),
  z.strictObject({ kind: z.literal('source-request'), input: sourceCustodyMemberSchema }),
  z.strictObject({ kind: z.literal('source-record'), input: sourceCustodyRecordSchema }),
])
export const checkpointRequestSchema = z
  .strictObject({
    kind: z.literal('checkpoint'),
    binding: settingsAttemptBindingSchema,
    command: checkpointCommandSchema,
  })
  .refine(
    request =>
      equal(request.binding.identity, request.command.input.identity) &&
      request.binding.attemptId === request.command.input.attemptId,
    { message: 'Checkpoint command must bind the exact requested attempt' },
  )
export type CheckpointRequest = z.infer<typeof checkpointRequestSchema>
