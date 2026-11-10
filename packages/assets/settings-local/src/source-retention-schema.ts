import { z } from 'zod'
import {
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsTargetSchema,
  SettingsStateSchema,
} from '@omne-harness/settings'
import { domainSchema } from './schema.ts'
import { intentIdentitySchema } from './intent-schema.ts'
import { SettingsTargetProjectionSchema } from './projection.ts'
import { equal } from './encoding.ts'

export const SOURCE_SNAPSHOT_PARTICIPANT = 'settings.source-snapshot'
export const SOURCE_SNAPSHOT_PROTOCOL = 'settings-source-snapshot/1'
export const SOURCE_SNAPSHOT_FACT = {
  key: SOURCE_SNAPSHOT_PARTICIPANT,
  protocol: SOURCE_SNAPSHOT_PROTOCOL,
}
export const SOURCE_RETENTION_OWNER = 'settings.source-retention'
export const SOURCE_RETENTION_PROTOCOL = 'settings-source-retention/1'
export const SOURCE_RETENTION_TABLES = ['st_source_gate', 'st_source_reservation']
export const SOURCE_RETENTION_MIGRATION = {
  owner: SOURCE_RETENTION_OWNER,
  id: 'settings-source-retention-1',
}
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const sourceReferenceSchema = z.strictObject({
  domain: domainSchema,
  target: SettingsTargetSchema,
})
export const sourceDestinationSchema = z.strictObject({
  ownerRef: SettingsReferenceSchema,
  identity: z.strictObject({
    domain: domainSchema,
    principalRef: SettingsReferenceSchema,
    operation: z.record(z.string(), z.json()),
  }),
  attemptId: SettingsIdSchema,
  commandDigest: digestSchema,
  route: SettingsReferenceSchema,
})
export const sourceRequestSchema = z.strictObject({
  source: sourceReferenceSchema,
  destination: sourceDestinationSchema,
})
export const sourceSnapshotSchema = z
  .strictObject({
    source: sourceReferenceSchema,
    projection: SettingsTargetProjectionSchema,
    state: SettingsStateSchema,
    presence: z.enum(['absent', 'present']),
  })
  .refine(
    snapshot =>
      equal(snapshot.source.target, snapshot.projection.target) &&
      equal(
        snapshot.state.sources.map(source => source.id),
        snapshot.projection.sources.map(source => source.sourceId),
      ) &&
      (snapshot.presence !== 'absent' ||
        (snapshot.state.revision === 0 &&
          snapshot.state.sources.every(source => source.values.length === 0))),
    { message: 'Source snapshot must bind the target, ordered source layout and absent state' },
  )
export const sourceUpdateSchema = z
  .strictObject({
    source: sourceReferenceSchema,
    identity: intentIdentitySchema,
    commandDigest: digestSchema,
  })
  .refine(
    update =>
      equal(update.source, {
        domain: update.identity.domain,
        target: update.identity.operation.target,
      }),
    { message: 'A source update belongs to the source domain and target' },
  )
export const sourceSettlementSchema = z.strictObject({
  request: sourceRequestSchema,
  outcome: z.enum(['committed', 'aborted']),
})
export const sourcePageSchema = z.strictObject({
  after: digestSchema.nullable(),
  limit: z.number().int().min(1).max(100),
})
export type SourceReference = z.infer<typeof sourceReferenceSchema>
export type SourceRequest = z.infer<typeof sourceRequestSchema>
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>
export type SourceUpdate = z.infer<typeof sourceUpdateSchema>
export type SourceSettlement = z.infer<typeof sourceSettlementSchema>
export type SourcePage = z.infer<typeof sourcePageSchema>
