import { z } from 'zod'
import {
  calendarIdSchema,
  calendarSnapshotSchema,
  calendarVersionIdSchema,
  contentHashSchema,
  instantSchema,
  localDateSchema,
} from '@omne-harness/calendar-contract'
import type {
  CalendarDispositionCommand,
  CalendarPublicationReceipt,
  CalendarReactionAcknowledgement,
} from '@omne-harness/calendar'

export const PARTICIPANT = 'calendar.persistence'
export const PROTOCOL = 'calendar-persistence/1'
export const HANDLER = 'calendar.repository'
export const DOMAIN = 'system.calendar'
export const AUTHORITY_FACT = {
  key: 'calendar.persistence-authority',
  protocol: 'calendar-persistence-authority/1',
} as const
export const RESULT_FACT = { key: 'calendar.persistence-result', protocol: PROTOCOL } as const
export const TABLES = ['ca_current', 'ca_versions', 'ca_candidates', 'ca_outbox'] as const
export const MIGRATION = { owner: PARTICIPANT, id: 'calendar-schema-1' } as const
export const PAGE_LIMIT = 100
const text = z.string().min(1)
const refs = z.array(text).min(1).readonly()
export const addressSchema = z.strictObject({
  protocol: z.literal('omne.calendar-schedule/1'),
  systemScopeRef: text,
  operation: z.enum(['refresh', 'importSeed']),
  calendarId: calendarIdSchema,
  operationKey: z
    .string()
    .min(1)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 128),
})
const unpublishedSnapshot = z.record(z.string(), z.unknown()).transform((value, context) => {
  if ('publicationGeneration' in value) {
    context.addIssue({ code: 'custom', message: 'Candidate must not assign publicationGeneration' })
    return z.NEVER
  }
  const parsed = calendarSnapshotSchema.safeParse({ ...value, publicationGeneration: 0 })
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: 'Invalid candidate snapshot' })
    return z.NEVER
  }
  const { publicationGeneration: _generation, ...snapshot } = parsed.data
  return snapshot
})
const sourceSchema = z.strictObject({
  sourceId: text,
  role: z.enum(['truth', 'oracle', 'exceptionFeed', 'horizonProbe']),
  lineageRef: text,
  authorityRef: text,
  acquiredAt: instantSchema,
  knowledgeAsOf: instantSchema,
  rawHash: contentHashSchema,
  rawReference: text,
})
export const commandSchema: z.ZodType<CalendarDispositionCommand> = z
  .strictObject({
    address: addressSchema,
    expectedFingerprint: contentHashSchema,
    expectedGeneration: z.int().nonnegative(),
    authorityGuardRefs: refs,
    policyHash: contentHashSchema,
    candidate: z.strictObject({
      snapshot: unpublishedSnapshot.nullable(),
      semanticBoundary: text,
      sources: z.array(sourceSchema).readonly(),
      differences: z.array(z.string()).readonly(),
      reasons: z.array(z.string()).readonly(),
    }),
    disposition: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('publish'), snapshot: unpublishedSnapshot }),
      z.strictObject({ kind: z.enum(['noChange', 'withheld', 'rejected']) }),
    ]),
  })
  .superRefine((command, context) => {
    const snapshots = [
      command.candidate.snapshot,
      command.disposition.kind === 'publish' ? command.disposition.snapshot : null,
    ]
    if (
      snapshots.some(
        snapshot => snapshot !== null && snapshot.calendarId !== command.address.calendarId,
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Candidate calendar differs from operation address',
      })
  })
export const publishedSchema = z.strictObject({
  versionId: calendarVersionIdSchema,
  publicationGeneration: z.int().positive(),
})
export const receiptSchema: z.ZodType<CalendarPublicationReceipt> = z.strictObject({
  operationRef: text,
  address: addressSchema,
  fingerprint: contentHashSchema,
  candidateRef: text,
  disposition: z.enum(['published', 'noChange', 'withheld', 'rejected']),
  current: publishedSchema.nullable(),
  outboxId: text.nullable(),
})
export const candidateRecordSchema = z.strictObject({
  candidateRef: text,
  command: commandSchema,
  receipt: receiptSchema,
})
export const ackSchema: z.ZodType<CalendarReactionAcknowledgement> = z.strictObject({
  acknowledgementKey: z
    .string()
    .min(1)
    .refine(value => Buffer.byteLength(value, 'utf8') <= 128),
  id: text,
  operationRef: text,
  handoffRef: text,
  authorityGuardRefs: refs,
})
export const directorySchema = z.strictObject({
  calendarId: calendarIdSchema,
  semanticBoundary: text,
  timezone: text,
  current: publishedSchema,
})
export const versionSchema = z.strictObject({
  calendarId: calendarIdSchema,
  versionId: calendarVersionIdSchema,
  publicationGeneration: z.int().positive(),
  coverageStart: localDateSchema,
  coverageEnd: localDateSchema,
  knowledgeAsOf: instantSchema,
  synthesizedAt: instantSchema,
  contentHash: contentHashSchema,
  provenanceRefs: refs,
})
export const reactionSchema = z.strictObject({
  id: text,
  operationRef: text,
  calendarId: calendarIdSchema,
  versionId: calendarVersionIdSchema,
  publicationGeneration: z.int().positive(),
})
export const pageSchema = z.strictObject({
  after: text.nullable(),
  limit: z.int().min(1).max(PAGE_LIMIT),
})
export const readSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('calendar'), calendarId: calendarIdSchema }),
  pageSchema.extend({ kind: z.literal('calendars') }),
  pageSchema.extend({ kind: z.literal('versions'), calendarId: calendarIdSchema }),
  pageSchema.extend({ kind: z.literal('candidates'), calendarId: calendarIdSchema }),
  pageSchema.extend({ kind: z.literal('reactions') }),
  z.strictObject({
    kind: z.literal('snapshot'),
    calendarId: calendarIdSchema,
    version: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('current') }),
      z.strictObject({ kind: z.literal('pinned'), versionId: calendarVersionIdSchema }),
    ]),
  }),
  z.strictObject({ kind: z.literal('candidate'), candidateRef: text }),
  z.strictObject({ kind: z.literal('operation'), operationRef: text }),
])
export type RepositoryRead = z.infer<typeof readSchema>
export const workerCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('disposition'), command: commandSchema }),
  z.strictObject({ action: z.literal('ackReaction'), acknowledgement: ackSchema }),
])
export type WorkerCommand = z.infer<typeof workerCommandSchema>
export const operationQuerySchema = z.strictObject({
  address: addressSchema,
  expectedFingerprint: contentHashSchema,
})
