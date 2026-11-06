import { z } from 'zod'

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/)
const text = z.string().trim().min(1).max(2048)
const values = z.array(id).max(64)
export const PermissionOriginSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('asset'), assetId: id, releaseRef: id }),
  z.strictObject({ kind: z.literal('independent'), providerId: id, definitionRef: id }),
])
export const PermissionDefinitionRefSchema = z.strictObject({
  origin: PermissionOriginSchema,
  itemId: id,
  revision: id,
})
export const PermissionRuleSchema = z.strictObject({
  pick: id.nullable(),
  allowedSet: values.nullable(),
})
export const PermissionDefinitionSchema = z.strictObject({
  reference: PermissionDefinitionRefSchema,
  capabilityId: id,
  enforcementKey: id,
  title: text,
  description: text,
  approvalEffect: text,
  supportedScopes: z
    .array(
      z.strictObject({
        kind: z.enum(['one-time-call', 'session', 'tenant']),
        description: text,
      }),
    )
    .min(1)
    .max(3),
  assignmentLayers: z.array(z.enum(['organization', 'tenant', 'session'])).max(3),
  values: z
    .array(z.strictObject({ id, title: text, description: text, permitsOperation: z.boolean() }))
    .min(1)
    .max(64),
  comparison: z
    .strictObject({
      strictOrder: values,
      distances: z.array(z.array(z.number().finite().nonnegative()).max(64)).max(64),
    })
    .nullable(),
  defaultRule: PermissionRuleSchema,
  settings: z
    .strictObject({
      providerId: id,
      definitionId: id,
      version: id,
      itemId: id,
      groupId: id,
      groupTitle: text,
      groupDescription: text,
    })
    .nullable(),
})
export const PermissionScopeSchema = z.strictObject({
  tenantId: id,
  targetId: id,
  organizationId: id.nullable(),
  sessionId: id.nullable(),
  deploymentId: id,
  logicalServiceId: id,
})
export const PermissionSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('absent'), revision: id }),
  z.strictObject({ kind: z.literal('unavailable'), sourceRef: id }),
  z.strictObject({
    kind: z.literal('available'),
    sourceRef: id,
    revision: id,
    scope: PermissionScopeSchema,
    definition: PermissionDefinitionRefSchema,
    rule: PermissionRuleSchema,
  }),
])
export const PermissionConstraintSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id, kind: z.literal('unavailable'), sourceRef: id }),
  z.strictObject({
    id,
    kind: z.literal('available'),
    sourceRef: id,
    revision: id,
    scope: PermissionScopeSchema,
    capabilityId: id,
    enforcementKey: id,
    effect: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('prohibition') }),
      z.strictObject({ kind: z.literal('bound'), allowedSet: values }),
    ]),
  }),
])
export const PermissionEvaluationSchema = z.strictObject({
  scope: PermissionScopeSchema,
  definition: PermissionDefinitionRefSchema,
  capabilityId: id,
  enforcementKey: id,
  declaration: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('available'), definition: PermissionDefinitionSchema }),
    z.strictObject({ kind: z.literal('unavailable'), sourceRef: id }),
  ]),
  sources: z.strictObject({
    organization: PermissionSourceSchema,
    tenant: PermissionSourceSchema,
    session: PermissionSourceSchema,
  }),
  requiredConstraintIds: z.array(id).max(64),
  constraints: z.array(PermissionConstraintSchema).max(64),
  adoptionRevision: id,
  targetRevision: id,
})
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>
export type PermissionDefinitionRef = z.infer<typeof PermissionDefinitionRefSchema>
export type PermissionRule = z.infer<typeof PermissionRuleSchema>
export type PermissionScope = z.infer<typeof PermissionScopeSchema>
export type PermissionSource = z.infer<typeof PermissionSourceSchema>
export type PermissionConstraint = z.infer<typeof PermissionConstraintSchema>
export type PermissionEvaluation = z.infer<typeof PermissionEvaluationSchema>
export type PermissionInputFailure = {
  kind: 'invalid-input'
  reason: 'structure' | 'definition' | 'binding' | 'rule'
}
