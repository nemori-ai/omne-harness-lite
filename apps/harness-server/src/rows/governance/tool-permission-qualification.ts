import { capturedInquirySchema } from './permission-inquiry.ts'
import { canonicalText } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type {
  InvocationQualification,
  LocalInvocationQualifier,
} from '@omne-harness/tool-host-local'
import type { ToolRelease } from '../../entry/tool-release.ts'
import { sameAdoption } from '../../entry/tool-release-manifest.ts'
import {
  releasedToolPermission,
  toolPermissionRequestMatches,
  type ToolPermissionAction,
  type ToolPermissionContext,
} from '../authorization/current-tool-permission.ts'
import {
  qualifyOriginalToolAgent,
  type ToolAgentPermissionSource,
} from './tool-agent-permission.ts'
import type { PermissionQualification } from './permission-qualification.ts'
import {
  readBoundSessionPermission,
  type SessionPermissionCaptureReader,
} from './permission-session-current.ts'

function originalCallMatches(action: ToolPermissionAction): action is ToolPermissionAction & {
  origin: Extract<ToolPermissionAction['origin'], { kind: 'tool-call' }>
} {
  return (
    action.origin.kind === 'tool-call' &&
    action.operation.owner === 'tool' &&
    action.operation.operationId === action.origin.call &&
    sameAdoption(action.definition, action.origin.request.availability.definition.adoption) &&
    action.effectiveArguments === action.origin.request.arguments.effective
  )
}

function answersGivenCall(
  original: InvocationQualification,
  given: InvocationQualification['request'],
  permission: PermissionBasisRequest,
): boolean {
  const tenant = tenantCodec.encode(given.tenant)
  return (
    tenant.ok &&
    tenant.value === permission.scope.tenantId &&
    canonicalText(original.request) === canonicalText(given) &&
    original.records.every(record => tenantEquals(record.domain.tenant, given.tenant))
  )
}

export async function qualifyToolPermission(
  input: Readonly<{
    action: ToolPermissionContext
    permission: PermissionBasisRequest
    release: ToolRelease
    qualifier: LocalInvocationQualifier<ActingForTenantPrincipal>
    readSession: SessionPermissionCaptureReader
    agent?: ToolAgentPermissionSource | undefined
  }>,
): Promise<PermissionQualification> {
  const unavailable = (): PermissionQualification => ({
    kind: 'unavailable',
    sourceRef: 'tool.invocation',
  })
  try {
    const action = {
      ...input.action,
      inquiry: capturedInquirySchema.parse(input.action.inquiry),
      operation: { ...input.action.operation },
      definition: { ...input.action.definition },
      origin: structuredClone(input.action.origin),
    }
    const permission = PermissionBasisRequestSchema.parse(input.permission)
    if (!originalCallMatches(action)) return { kind: 'denied' }
    const available = releasedToolPermission(input.release, action)
    if (available === undefined) return unavailable()
    const released = structuredClone(available)
    if (!toolPermissionRequestMatches(action, permission, released.interpretation))
      return { kind: 'denied' }
    const definition = structuredClone(released.entry.governance.declaration.reference)
    const { principal, tenant, origin } = action
    const given = {
      tenant,
      call: origin.call,
      admission: origin.admission,
      request: origin.request,
    }
    const result = await input.qualifier.qualify({ principal, ...given })
    if ('failure' in result)
      return result.failure.kind === 'denied' ? { kind: 'denied' } : unavailable()
    const original = result.ok
    if (!answersGivenCall(original, given, permission)) return unavailable()
    const session = await readBoundSessionPermission(input.readSession, permission, action.inquiry)
    if (session === undefined) return unavailable()
    const agent = await qualifyOriginalToolAgent({
      principal,
      tenant,
      origin: structuredClone(original.origin),
      source: input.agent,
      permission,
      definition: released.interpretation.definition,
    })
    if ('failure' in agent) return agent.failure
    return {
      kind: 'qualified',
      origin: {
        configuration: released.interpretation.definition.settings === null ? 'unmapped' : 'mapped',
        principalRef: standingPrincipalRef(principal),
        definition,
        session,
        constraints: agent.ok === null ? [] : [agent.ok],
      },
    }
  } catch {
    return unavailable()
  }
}
