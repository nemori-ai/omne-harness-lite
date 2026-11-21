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

const consumer = z.strictObject({ owner: text, work: text, position: text })
/** The row and, by key, the authorizations in force for it: the gate's, and the named action's. */
export const SessionPermissionCurrentRequestSchema = SessionPermissionReadSchema.extend({
  consumer: consumer.nullable().optional(),
})
export const SessionAuthorizationsSchema = z.strictObject({
  revision: count,
  once: z
    .strictObject({ consumer, target: text, argumentsDigest: text, source: evidence })
    .nullable(),
  session: z
    .strictObject({ capabilityId: text, enforcementKey: text, basis: text, source: evidence })
    .nullable(),
})
export type SessionAuthorizations = z.infer<typeof SessionAuthorizationsSchema>
/** What `session.permission-current` answers: the permission row with those authorizations. */
export const SessionPermissionCurrentReadSchema = SessionPermissionCurrentSchema.extend({
  authorizations: SessionAuthorizationsSchema,
})
export type SessionPermissionCurrentRead = z.infer<typeof SessionPermissionCurrentReadSchema>
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

export const SESSION_AUTHORIZATION_GUARD = 'session-authorization-guard'
/** The one authorization a start was released on: its row must still hold with the same source. */
export const SessionAuthorizationGuardSchema = z.strictObject({
  request: z.strictObject({
    tenant: text,
    session: text,
    grant: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('once'), consumer, source: evidence }),
      z.strictObject({
        kind: z.literal('session'),
        capabilityId: text,
        enforcementKey: text,
        source: evidence,
      }),
    ]),
  }),
})
export type SessionAuthorizationGuard = z.infer<typeof SessionAuthorizationGuardSchema>['request']

export function sessionAuthorizationGuardFacts(request: SessionAuthorizationGuard): FactCommandV2 {
  return { participant: SESSION_AUTHORIZATION_GUARD, facts: { request } }
}

export function sessionPermissionGuardFacts(current: SessionPermissionCurrent): FactCommandV2 {
  const { tenant, session, capabilityId, enforcementKey, revision, source } = current
  return {
    participant: SESSION_PERMISSION_GUARD,
    facts: { request: { tenant, session, capabilityId, enforcementKey, revision, source } },
  }
}
export type SessionPermissionReadResult = SessionPermissionCurrent | Readonly<{ kind: 'not-ready' }>

export function decodeSessionPermissionRead(
  value: unknown,
): SessionPermissionCurrentRead | Readonly<{ kind: 'not-ready' }> | 'malformed' {
  const parsed = z
    .union([SessionPermissionCurrentReadSchema, z.strictObject({ kind: z.literal('not-ready') })])
    .safeParse(value)
  return parsed.success ? parsed.data : 'malformed'
}

export function decodeSessionPermissionCurrent(
  value: unknown,
): SessionPermissionReadResult | 'malformed' {
  const parsed = z
    .union([SessionPermissionCurrentSchema, z.strictObject({ kind: z.literal('not-ready') })])
    .safeParse(value)
  return parsed.success ? parsed.data : 'malformed'
}
