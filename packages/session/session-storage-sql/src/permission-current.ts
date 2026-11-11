import { z } from 'zod'
import { PermissionDefinitionRefSchema, PermissionRuleSchema } from '@omne-harness/permissions'
import type { FactCommandV2 } from '@omne-harness/sql-contract'

export const SESSION_PERMISSION_CURRENT_HANDLER = 'session.permission-current'
export const SESSION_PERMISSION_MODE_HANDLER = 'session.permission-mode'
export const SESSION_PERMISSION_GUARD = 'session-permission-guard'
export const SESSION_PERMISSION_CURRENT_FACT = {
  key: 'session.permission-current',
  protocol: '1',
} as const
const text = z.string().min(1)
const count = z.string().regex(/^(0|[1-9][0-9]*)$/)
const adoption = z.strictObject({ owner: text, name: text, revision: text, digest: text })
const evidence = z.strictObject({ owner: text, record: text, revision: text, digest: text })
const permissionMode = z.enum(['never', 'auto_permission', 'bypass-permissions'])
const modeAdoption = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tenant-default'), source: adoption }),
  z.strictObject({
    kind: z.literal('explicit'),
    value: z.strictObject({
      permission: permissionMode,
      environment: adoption,
      collaboration: z.enum(['co-work', 'auto-drive']),
    }),
  }),
])

export const SessionPermissionReadSchema = z.strictObject({
  tenant: text,
  session: text,
  capabilityId: text,
  enforcementKey: text,
})
export type SessionPermissionRead = z.infer<typeof SessionPermissionReadSchema>
export const SessionPermissionCurrentSchema = z.strictObject({
  kind: z.literal('current'),
  ...SessionPermissionReadSchema.shape,
  revision: count,
  source: evidence,
  mode: z.strictObject({
    adopted: modeAdoption,
    override: z.strictObject({ value: permissionMode, source: evidence }).nullable(),
  }),
  assignment: z
    .strictObject({
      capabilityId: text,
      enforcementKey: text,
      definition: PermissionDefinitionRefSchema,
      rule: PermissionRuleSchema,
      source: evidence,
    })
    .nullable(),
})
export type SessionPermissionCurrent = z.infer<typeof SessionPermissionCurrentSchema>
export const SessionPermissionHeadSchema = SessionPermissionCurrentSchema.omit({
  capabilityId: true,
  enforcementKey: true,
  assignment: true,
})
export const SessionPermissionModeSchema = SessionPermissionHeadSchema.extend({
  creationSource: evidence,
})
export type SessionPermissionMode = z.infer<typeof SessionPermissionModeSchema>
export type SessionPermissionModeResult = SessionPermissionMode | Readonly<{ kind: 'not-ready' }>

export function decodeSessionPermissionMode(
  value: unknown,
): SessionPermissionModeResult | 'malformed' {
  const parsed = z
    .union([SessionPermissionModeSchema, z.strictObject({ kind: z.literal('not-ready') })])
    .safeParse(value)
  return parsed.success ? parsed.data : 'malformed'
}
export const SessionPermissionGuardSchema = z.strictObject({
  request: SessionPermissionCurrentSchema.pick({
    tenant: true,
    session: true,
    capabilityId: true,
    enforcementKey: true,
    revision: true,
    source: true,
  }),
})

/** The owner re-reads values; only the locator and original version cross into the transaction. */
export function sessionPermissionGuardFacts(current: SessionPermissionCurrent): FactCommandV2 {
  const { tenant, session, capabilityId, enforcementKey, revision, source } = current
  return {
    participant: SESSION_PERMISSION_GUARD,
    facts: { request: { tenant, session, capabilityId, enforcementKey, revision, source } },
  }
}
export type SessionPermissionReadResult = SessionPermissionCurrent | Readonly<{ kind: 'not-ready' }>

/** A missing projection is distinct from a present projection with no assignment. */
export function decodeSessionPermissionCurrent(
  value: unknown,
): SessionPermissionReadResult | 'malformed' {
  const parsed = z
    .union([SessionPermissionCurrentSchema, z.strictObject({ kind: z.literal('not-ready') })])
    .safeParse(value)
  return parsed.success ? parsed.data : 'malformed'
}
