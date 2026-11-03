import { z } from 'zod'
import {
  ScheduleIdSchema,
  ScheduleListRequestSchema,
  ScheduleOperationRefSchema,
  ScheduleOwnerSchema,
  ScheduleRevisionsRequestSchema,
} from '@omne-harness/schedule-contract'
import { readAccessSchema, recoveryScopeSchema, storageScopeSchema } from './schema.ts'
export const readRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('schedule'),
    scope: storageScopeSchema,
    owner: ScheduleOwnerSchema,
    scheduleId: ScheduleIdSchema,
  }),
  z.strictObject({
    kind: z.literal('get'),
    scope: storageScopeSchema,
    access: readAccessSchema,
    scheduleId: ScheduleIdSchema,
  }),
  z.strictObject({
    kind: z.literal('list'),
    scope: storageScopeSchema,
    access: readAccessSchema,
    request: ScheduleListRequestSchema,
  }),
  z.strictObject({
    kind: z.literal('revisions'),
    scope: storageScopeSchema,
    access: readAccessSchema,
    request: ScheduleRevisionsRequestSchema,
  }),
  z.strictObject({
    kind: z.literal('operation'),
    scope: storageScopeSchema,
    recovery: recoveryScopeSchema,
    operationRef: ScheduleOperationRefSchema,
  }),
])
export type RepositoryRequest = z.infer<typeof readRequestSchema>
export type PageRequest = Extract<RepositoryRequest, { kind: 'list' | 'revisions' }>
