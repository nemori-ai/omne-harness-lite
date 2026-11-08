import { capturedInquirySchema } from './permission-inquiry.ts'
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type { GovernancePermissionQualification } from '@omne-harness/governance-local'
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
import { toolPermissionObservationSchema } from './tool-permission-observation.ts'
import {
  readBoundSessionPermission,
  type SessionPermissionCaptureReader,
} from './permission-session-current.ts'

type Qualification =
  | Readonly<{ kind: 'qualified'; qualification: GovernancePermissionQualification }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; sourceRef: string }>

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

function currentRecords(
  original: InvocationQualification,
  given: InvocationQualification['request'],
) {
  const encoded = tenantCodec.encode(given.tenant)
  if (
    !encoded.ok ||
    canonicalText(original.request) !== canonicalText(given) ||
    original.records.some(record => !tenantEquals(record.domain.tenant, given.tenant))
  )
    return undefined
  return {
    tenant: encoded.value,
    records: original.records.map(record => ({
      kind: record.domain.kind,
      name: record.domain.kind === 'call' ? record.domain.call : record.domain.key,
      key: record.key,
      digest: record.digest,
    })),
  }
}

/** Used inside the trusted Governance resolver, after its Identity check, before capture. */
export async function qualifyToolPermission(
  input: Readonly<{
    action: ToolPermissionContext
    permission: PermissionBasisRequest
    release: ToolRelease
    qualifier: LocalInvocationQualifier<ActingForTenantPrincipal>
    readSession: SessionPermissionCaptureReader
    agent?: ToolAgentPermissionSource | undefined
  }>,
): Promise<Qualification> {
  const unavailable = (): Qualification => ({ kind: 'unavailable', sourceRef: 'tool.invocation' })
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
    const originalOrigin = structuredClone(original.origin)
    const invocation = z.json().parse(original.request)
    const current = currentRecords(original, given)
    if (current === undefined) return unavailable()
    const session = await readBoundSessionPermission(input.readSession, permission, action.inquiry)
    if (session === undefined) return unavailable()
    const agent = await qualifyOriginalToolAgent({
      principal,
      tenant,
      origin: originalOrigin,
      source: input.agent,
      permission,
      definition: released.interpretation.definition,
      session,
    })
    if ('failure' in agent) return agent.failure
    const observation = toolPermissionObservationSchema.parse({
      owner: 'harness.tool-invocation',
      protocol: 'tool-permission-observation/5',
      observation: {
        configuration: released.interpretation.definition.settings === null ? 'unmapped' : 'mapped',
        principalRef: standingPrincipalRef(principal),
        permission,
        definition,
        invocation,
        current,
        inquiry: action.inquiry,
        session,
        agent: agent.ok,
      },
    })
    return {
      kind: 'qualified',
      qualification: { ...observation, observation: z.json().parse(observation.observation) },
    }
  } catch {
    return unavailable()
  }
}
