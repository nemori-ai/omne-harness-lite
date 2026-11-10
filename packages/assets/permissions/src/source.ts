import { z } from 'zod'
import {
  PermissionDefinitionRefSchema,
  PermissionDefinitionSchema,
  PermissionEvaluationSchema,
  PermissionScopeSchema,
} from './schema.ts'

const id = PermissionDefinitionSchema.shape.capabilityId
export const PermissionBasisRequestSchema = z.strictObject({
  scope: PermissionScopeSchema,
  operation: z.strictObject({ owner: id, operationId: id }),
  implementationRef: id,
  argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
  capabilityId: id,
  enforcementKey: id,
  definition: PermissionDefinitionRefSchema,
})
export const PermissionCurrentBasisSchema = z
  .strictObject({
    kind: z.literal('current'),
    request: PermissionBasisRequestSchema,
    evaluation: PermissionEvaluationSchema,
  })
  .refine(
    ({ request, evaluation }) =>
      JSON.stringify(request.scope) === JSON.stringify(evaluation.scope) &&
      JSON.stringify(request.definition) === JSON.stringify(evaluation.definition) &&
      request.capabilityId === evaluation.capabilityId &&
      request.enforcementKey === evaluation.enforcementKey,
    { message: 'Permission basis must match the requested scope, definition and enforcement' },
  )
export type PermissionBasisRequest = z.infer<typeof PermissionBasisRequestSchema>
export type PermissionCurrentBasis = z.infer<typeof PermissionCurrentBasisSchema>
export const PermissionBasisReadingSchema = z.union([
  PermissionCurrentBasisSchema,
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({ kind: z.literal('unavailable'), sourceRef: z.string() }),
  z.strictObject({ kind: z.literal('invalid-input'), reason: z.enum(['structure', 'binding']) }),
])
export type PermissionBasisReading = z.infer<typeof PermissionBasisReadingSchema>

/** Reads qualified facts for one operation; a reading is not a future execution permit. */
export interface PermissionBasisSource<Context> {
  readCurrent(context: Context, request: PermissionBasisRequest): Promise<PermissionBasisReading>
}
