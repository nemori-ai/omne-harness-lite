import { z } from 'zod'
import {
  ScheduleAdoptedBasisSchema,
  ScheduleAuthorSchema,
  ScheduleCallContextSchema,
  ScheduleCandidateSchema,
  ScheduleCommandSchema,
  ScheduleConsentAdoptionSchema,
  ScheduleCreateRequestSchema,
  ScheduleDefinitionSchema,
  ScheduleDomainErrorSchema,
  ScheduleFingerprintSchema,
  ScheduleIdSchema,
  ScheduleInstantSchema,
  ScheduleOperationAddressSchema,
  ScheduleOperationRefSchema,
  ScheduleOperationViewSchema,
  ScheduleOwnerSchema,
  ScheduleRefSchema,
  ScheduleRevisionViewSchema,
  ScheduleStandingSchema,
  ScheduleViewSchema,
} from '@omne-harness/schedule-contract'
import { createScheduleDefinitionRef } from '@omne-harness/schedule'

export const DOMAIN = 'schedule.management'
export const PARTICIPANT = 'schedule.management.persistence'
export const PROTOCOL = 'schedule-management-persistence/1'
export const HANDLER = 'schedule.management.repository'
export const GUARD_FACT = {
  key: 'schedule.management.guards',
  protocol: 'schedule-management-guards/1',
}
export const RESULT_FACT = { key: 'schedule.management.result', protocol: PROTOCOL }
export const MIGRATION = { owner: PARTICIPANT, id: 'schedule-management-1' }
export const TABLES = [
  'sc_schedules',
  'sc_definitions',
  'sc_revisions',
  'sc_observations',
  'sc_operations',
  'sc_outbox',
]
const ref = ScheduleRefSchema
export const storageScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tenant'), tenant: ref }),
  z.strictObject({ kind: z.literal('system') }),
])
export const recoveryScopeSchema = z.strictObject({
  owner: ScheduleOwnerSchema,
  principalRef: ref,
  actor: ScheduleCallContextSchema.unwrap().shape.actor,
  originatingSessionRef: ref.nullable(),
})
export const operationSchema = z.strictObject({
  scope: recoveryScopeSchema,
  address: ScheduleOperationAddressSchema,
  fingerprint: ScheduleFingerprintSchema,
  operationRef: ScheduleOperationRefSchema,
})
export const consentLockSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('clear') }),
  z.strictObject({
    kind: z.literal('reconfirmationRequired'),
    grantRef: ref,
    revokedGeneration: z.int().nonnegative(),
  }),
])
export const quotaHoldingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('held'), reservationRef: ref }),
  z.strictObject({ kind: z.literal('released'), releaseRef: ref }),
  z.strictObject({
    kind: z.literal('transferred'),
    reservationRef: ref,
    successorId: ScheduleIdSchema,
  }),
])
export const recordSchema = z
  .strictObject({
    view: ScheduleViewSchema,
    activationExclusive: ScheduleInstantSchema.nullable(),
    consentLock: consentLockSchema,
    quota: quotaHoldingSchema,
    adoptedBasis: ScheduleAdoptedBasisSchema.nullable(),
    definitionRef: ref,
  })
  .refine(
    record => record.definitionRef === createScheduleDefinitionRef(record.view),
    'Definition reference does not match its owner and content',
  )
export const revisionSchema = z.strictObject({
  view: ScheduleRevisionViewSchema,
  revision: z.int().positive(),
  beforeRecordRef: ref.nullable(),
  afterRecordRef: ref,
})
const requestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create'), input: ScheduleCreateRequestSchema }),
  z.strictObject({ kind: z.literal('execute'), input: ScheduleCommandSchema }),
])
const consentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('notRequired'), guardRef: ref }),
  z.strictObject({
    kind: z.literal('adopt'),
    guardRef: ref,
    adoption: ScheduleConsentAdoptionSchema,
  }),
  z.strictObject({
    kind: z.literal('retain'),
    guardRef: ref,
    adoption: ScheduleConsentAdoptionSchema.nullable(),
  }),
])
const accessSchema = z.strictObject({
  authority: z.strictObject({
    scope: recoveryScopeSchema,
    authorOnCreate: ScheduleAuthorSchema,
    role: z.enum(['owner', 'author', 'system']),
    authorityVersion: ref,
    guardRef: ref,
  }),
  consent: consentSchema,
  currentStanding: ScheduleStandingSchema,
  consentLock: consentLockSchema,
})
const definitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('notNeeded') }),
  z.strictObject({
    kind: z.literal('resolved'),
    definition: ScheduleDefinitionSchema,
    basis: ScheduleAdoptedBasisSchema,
    next: ScheduleCandidateSchema.nullable(),
    complete: z.literal(true),
    referenceExclusive: ScheduleInstantSchema,
    basisGuardRef: ref,
  }),
])
export const commitSchema = z.strictObject({
  kind: z.enum(['saveDefinition', 'replaceDefinition']),
  input: z.strictObject({
    requestId: ref,
    operation: operationSchema,
    request: requestSchema,
    current: recordSchema.nullable(),
    access: accessSchema,
    definition: definitionSchema,
    now: ScheduleInstantSchema,
    allocatedId: ScheduleIdSchema.nullable(),
    quotaObservation: z.strictObject({
      guardRef: ref,
      resultingHolding: quotaHoldingSchema.nullable(),
    }),
  }),
})
export const quotaEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('reserve'),
    owner: ScheduleOwnerSchema,
    author: ScheduleAuthorSchema,
    scheduleId: ScheduleIdSchema,
  }),
  z.strictObject({ kind: z.literal('release'), reservationRef: ref, scheduleId: ScheduleIdSchema }),
  z.strictObject({
    kind: z.literal('transfer'),
    reservationRef: ref,
    predecessorId: ScheduleIdSchema,
    successorId: ScheduleIdSchema,
    owner: ScheduleOwnerSchema,
    author: ScheduleAuthorSchema,
  }),
])
export const bindingSchema = z.strictObject({
  scope: storageScopeSchema,
  operation: operationSchema,
  commandDigest: ScheduleFingerprintSchema,
  command: commitSchema,
})
export const guardRequirementSchema = z.strictObject({
  binding: bindingSchema,
  quotaEffect: quotaEffectSchema,
  resultingHolding: quotaHoldingSchema.nullable(),
})
export const guardFactSchema = guardRequirementSchema.extend({ decisionAt: ScheduleInstantSchema })
export const rejectionSchema = z.strictObject({
  binding: bindingSchema,
  error: ScheduleDomainErrorSchema,
})
export const responseSchema = z.strictObject({
  binding: bindingSchema,
  view: ScheduleOperationViewSchema,
})
export const readAccessSchema = z.strictObject({
  owner: ScheduleOwnerSchema,
  principalRef: ref,
  authorityRevision: ref,
  visibilityDigest: ScheduleFingerprintSchema,
  visibility: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ownerAll') }),
    z.strictObject({
      kind: z.literal('authoredIds'),
      author: ScheduleAuthorSchema,
      scheduleIds: z.array(ScheduleIdSchema).readonly(),
    }),
    z.strictObject({
      kind: z.literal('grantedIds'),
      scheduleIds: z.array(ScheduleIdSchema).readonly(),
    }),
  ]),
})
