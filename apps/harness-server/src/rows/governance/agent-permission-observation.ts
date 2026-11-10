import { capturedInquirySchema } from './permission-inquiry.ts'
import { z } from 'zod'
import {
  GovernanceDefinitionRefSchema,
  GovernanceIdSchema,
} from '@omne-harness/governance-contract'
import { PermissionBasisRequestSchema, PermissionConstraintSchema } from '@omne-harness/permissions'
import { ExecutionCurrentSchema } from '@omne-harness/session-storage-sql/participants'
import { sessionPermissionObservationSchema } from './permission-session-current.ts'

/** The trusted application binds these facts; a serialized envelope is not an authorization. */
export const agentPermissionObservationSchema = z.strictObject({
  owner: z.literal('harness.agent-action'),
  protocol: z.literal('agent-permission-observation/3'),
  observation: z.strictObject({
    principalRef: GovernanceIdSchema,
    permission: PermissionBasisRequestSchema,
    configuration: z.enum(['mapped', 'unmapped']),
    definition: GovernanceDefinitionRefSchema,
    action: z.json(),
    current: ExecutionCurrentSchema,
    session: sessionPermissionObservationSchema,
    inquiry: capturedInquirySchema,
    constraint: PermissionConstraintSchema,
  }),
})
