import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { sessionCommandFacts } from '@omne-harness/session-storage-sql/participants'
import { GovernanceExternalWriteExecutionSchema } from '@omne-harness/governance-local'
import { PermissionDefinitionRefSchema, PermissionRuleSchema } from '@omne-harness/permissions'
import {
  commandDigest,
  type SessionCheckedAccess,
  type SessionAccessRequest,
  type SessionPermissionWriteQualification,
  type SessionCommand,
  type GuardCommand,
  type SessionIntakeLimits,
} from '@omne-harness/session-contract'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../authorization/session-permission-write.ts'

const text = z.string().min(1)
export const sessionPermissionQualificationSchema = z.strictObject({
  protocol: z.literal('harness-session-permission-qualification/1'),
  tenantRef: text,
  session: text,
  operation: text,
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
  permissionRevision: z.string().regex(/^(0|[1-9][0-9]*)$/),
  principalRef: text,
  policy: z.strictObject({ owner: text, record: text, revision: text, digest: text }),
  commandFacts: GovernanceExternalWriteExecutionSchema.shape.commands.element.extend({
    participant: z.literal('session'),
  }),
  change: z.strictObject({
    capabilityId: text,
    enforcementKey: text,
    definition: PermissionDefinitionRefSchema,
    rule: PermissionRuleSchema.nullable(),
  }),
})
export type SessionPermissionQualification = z.infer<typeof sessionPermissionQualificationSchema>

function admittedTenant(
  request: Extract<SessionAccessRequest<ActingForTenantPrincipal>, { operation: 'change' }>,
  command: Extract<SessionCommand, { kind: 'change' }>,
  qualification: SessionPermissionWriteQualification,
): string | null {
  const tenant = tenantCodec.encode(command.input.tenant)
  if (!tenant.ok) return null
  const matches =
    request.target.session === command.input.session &&
    commandDigest(request.target.command) === commandDigest(command) &&
    tenantEquals(request.access.tenant, command.input.tenant) &&
    tenantEquals(request.access.principal.tenant, command.input.tenant) &&
    tenantEquals(qualification.tenant, command.input.tenant)
  return matches ? tenant.value : null
}

/** Serializes an already admitted operation; parsing this record never grants authority. */
export function sessionPermissionQualification(
  checked: SessionCheckedAccess<ActingForTenantPrincipal>,
  command: SessionCommand,
  guards: readonly GuardCommand[] = [],
  intakeLimits?: SessionIntakeLimits,
): SessionPermissionQualification | null {
  if (command.kind !== 'change' || command.input.declaration.kind !== 'permission-assignment')
    return null
  const { request, writeQualification: original } = checked
  if (original === undefined || request.operation !== 'change') return null
  const digest = commandDigest(command)
  const declaration = command.input.declaration
  const tenantRef = admittedTenant(request, command, original)
  if (tenantRef === null) return null
  const expected = {
    session: command.input.session,
    operation: command.input.operation,
    commandDigest: digest,
    permissionRevision: declaration.expectedRevision,
    principalRef: standingPrincipalRef(request.access.principal),
    policy: SESSION_PERMISSION_OWN_LOGIN_POLICY,
  }
  const { tenant: _tenant, ...received } = original
  if (
    canonicalText(received) !== canonicalText(expected) ||
    canonicalText(declaration.authorization) !== canonicalText(expected.policy)
  )
    return null
  const encoded = sessionCommandFacts(command, guards, intakeLimits)
  const parsed = sessionPermissionQualificationSchema.safeParse({
    protocol: 'harness-session-permission-qualification/1',
    tenantRef,
    ...expected,
    commandFacts: {
      ...encoded,
      facts: { ...encoded.facts, evidence: z.json().parse(checked.evidence) },
    },
    change: {
      capabilityId: declaration.capabilityId,
      enforcementKey: declaration.enforcementKey,
      definition: declaration.definition,
      rule: declaration.rule,
    },
  })
  return parsed.success ? parsed.data : null
}
