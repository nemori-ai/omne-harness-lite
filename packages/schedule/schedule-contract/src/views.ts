import { z } from 'zod'
import {
  ScheduleRefSchema as ref,
  ScheduleIdSchema,
  ScheduleOwnerSchema,
  ScheduleInstantSchema,
  ScheduleRevisionSchema,
  ScheduleOperationRefSchema,
  ScheduleCallContextSchema,
} from './values.ts'
import { ScheduleDefinitionSchema } from './definition.ts'
import { ScheduleCandidateSchema } from './candidates.ts'
export const ScheduleAuthorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('human'), actorRef: ref }),
  z.strictObject({ kind: z.literal('agent'), actorRef: ref, originatingSessionRef: ref }),
  z.strictObject({ kind: z.literal('system'), principalRef: ref }),
])
export const ScheduleConsentAdoptionSchema = z.strictObject({
  grantRef: ref,
  generation: z.int().nonnegative(),
  adoptionKind: z.enum(['granular', 'blanket']),
  scope: z.enum(['session', 'standing']),
  adoptedAt: ScheduleInstantSchema,
})
export const ScheduleAuthorityEvidenceSchema = z.strictObject({
  authorityRef: ref,
  subjectRef: ref,
  version: ref,
  disposition: z.enum(['allowed', 'denied', 'unavailable', 'terminallyInvalidated']),
  observedAt: ScheduleInstantSchema,
  reasonCode: ref,
})
export const ScheduleControlSchema = z.enum([
  'draft',
  'active',
  'paused',
  'stopped',
  'exhausted',
  'discarded',
  'superseded',
])
export const ScheduleStandingKindSchema = z.enum(['ready', 'blocked', 'terminallyInvalidated'])
const standing = {
  generation: z.int().nonnegative(),
  authorityEvidence: z.array(ScheduleAuthorityEvidenceSchema),
  since: ScheduleInstantSchema,
  observedAt: ScheduleInstantSchema,
}
export const ScheduleStandingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...standing, kind: z.literal('ready'), reasons: z.array(ref).length(0) }),
  z.strictObject({
    ...standing,
    kind: z.enum(['blocked', 'terminallyInvalidated']),
    reasons: z.array(ref).min(1),
  }),
])
export const ScheduleViewSchema = z.strictObject({
  scheduleId: ScheduleIdSchema,
  owner: ScheduleOwnerSchema,
  author: ScheduleAuthorSchema,
  createdBy: ref,
  createdAt: ScheduleInstantSchema,
  definition: ScheduleDefinitionSchema,
  revision: ScheduleRevisionSchema,
  definitionRevision: ScheduleRevisionSchema,
  stateRevision: ScheduleRevisionSchema,
  timeRuleRevision: ScheduleRevisionSchema,
  control: ScheduleControlSchema,
  standing: ScheduleStandingSchema,
  nextOccurrence: ScheduleCandidateSchema.nullable(),
  predecessorId: ScheduleIdSchema.nullable(),
  successorId: ScheduleIdSchema.nullable(),
  promotedBy: ref.nullable(),
  promotedAt: ScheduleInstantSchema.nullable(),
  discardedBy: ref.nullable(),
  discardedAt: ScheduleInstantSchema.nullable(),
  sourceScheduleKey: ref.nullable(),
  consentAdoption: ScheduleConsentAdoptionSchema.nullable(),
  eligibleConsumed: z.int().nonnegative(),
  acceptedJobCount: z.int().nonnegative(),
  observedAt: ScheduleInstantSchema,
})
export const ScheduleRevisionViewSchema = z.strictObject({
  scheduleId: ScheduleIdSchema,
  stateRevision: ScheduleRevisionSchema,
  definitionRevision: ScheduleRevisionSchema,
  actor: ScheduleCallContextSchema.unwrap().shape.actor,
  action: z.enum([
    'create',
    'update',
    'reviseDraft',
    'reconfirmConsent',
    'pause',
    'resume',
    'stop',
    'promote',
    'discard',
    'replace',
  ]),
  occurredAt: ScheduleInstantSchema,
  reason: z.string().nullable(),
  beforeDefinitionRef: ref.nullable(),
  afterDefinitionRef: ref,
  operationRef: ScheduleOperationRefSchema,
})
export type ScheduleView = z.infer<typeof ScheduleViewSchema>
export type ScheduleRevisionView = z.infer<typeof ScheduleRevisionViewSchema>
export type ScheduleConsentAdoption = z.infer<typeof ScheduleConsentAdoptionSchema>
export type ScheduleAuthorityEvidence = z.infer<typeof ScheduleAuthorityEvidenceSchema>
export type ScheduleAuthor = z.infer<typeof ScheduleAuthorSchema>
export type ScheduleStanding = z.infer<typeof ScheduleStandingSchema>
export type ScheduleControl = z.infer<typeof ScheduleControlSchema>
