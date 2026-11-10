import { capturedInquirySchema } from './permission-inquiry.ts'
import { z } from 'zod'
import {
  GovernanceDefinitionRefSchema,
  GovernanceIdSchema,
} from '@omne-harness/governance-contract'
import { PermissionBasisRequestSchema, PermissionConstraintSchema } from '@omne-harness/permissions'
import { parseToolRecordsCurrent } from '@omne-harness/tool-storage-sql'
import { ExecutionCurrentSchema } from '@omne-harness/session-storage-sql/participants'
import { sessionPermissionObservationSchema } from './permission-session-current.ts'

const currentRecordsSchema = z.json().transform((value, ctx) => {
  const parsed = parseToolRecordsCurrent({ request: value })
  if (parsed !== null) return parsed
  ctx.addIssue({ code: 'custom', message: 'Invalid original Tool record observation' })
  return z.NEVER
})

export const toolAgentObservationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('agent'),
    origin: z.json(),
    qualification: z.json(),
    current: ExecutionCurrentSchema,
    constraint: PermissionConstraintSchema,
  }),
])

/** Created by the trusted original-source adapter; the envelope alone grants no authority. */
export const toolPermissionObservationSchema = z.strictObject({
  owner: z.literal('harness.tool-invocation'),
  protocol: z.literal('tool-permission-observation/5'),
  observation: z.strictObject({
    principalRef: GovernanceIdSchema,
    permission: PermissionBasisRequestSchema,
    configuration: z.enum(['mapped', 'unmapped']),
    definition: GovernanceDefinitionRefSchema,
    invocation: z.json(),
    current: currentRecordsSchema,
    session: sessionPermissionObservationSchema,
    inquiry: capturedInquirySchema,
    agent: toolAgentObservationSchema,
  }),
})
