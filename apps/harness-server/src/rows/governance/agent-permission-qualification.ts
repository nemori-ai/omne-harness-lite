import { capturedInquirySchema } from './permission-inquiry.ts'
import { z } from 'zod'
import type { AgentActionQualification, AgentAdoptions } from '@omne-harness/agent-contract'
import { canonicalText } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type { GovernancePermissionQualification } from '@omne-harness/governance-local'
import type { ToolRelease } from '../../entry/tool-release.ts'
import {
  agentPermissionOperation,
  releasedToolPermission,
  toolPermissionRequestMatches,
  type ToolPermissionContext,
} from '../authorization/current-tool-permission.ts'
import {
  readBoundSessionPermission,
  type SessionPermissionCaptureReader,
} from './permission-session-current.ts'
import { readAgentPermissionConstraint } from './agent-permission-bound.ts'
import { agentPermissionObservationSchema } from './agent-permission-observation.ts'

type Qualification =
  | Readonly<{ kind: 'qualified'; qualification: GovernancePermissionQualification }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; sourceRef: string }>

/** Original Agent facts select the immutable definition; caller-provided names never do. */
export async function qualifyAgentPermission(
  input: Readonly<{
    action: ToolPermissionContext
    permission: PermissionBasisRequest
    release: ToolRelease
    qualifier: AgentActionQualification<ActingForTenantPrincipal>
    adoptions: Pick<AgentAdoptions<ActingForTenantPrincipal>, 'resolve'>
    readSession: SessionPermissionCaptureReader
  }>,
): Promise<Qualification> {
  const unavailable = (): Qualification => ({ kind: 'unavailable', sourceRef: 'agent.action' })
  try {
    const action = {
      ...input.action,
      inquiry: capturedInquirySchema.parse(input.action.inquiry),
      operation: { ...input.action.operation },
      definition: { ...input.action.definition },
      origin: structuredClone(input.action.origin),
    }
    if (action.origin.kind !== 'agent-action') return { kind: 'denied' }
    const permission = PermissionBasisRequestSchema.parse(input.permission)
    const available = releasedToolPermission(input.release, action)
    if (available === undefined) return unavailable()
    const released = structuredClone(available)
    const { kind: _kind, ...position } = action.origin
    const expectedOperation = agentPermissionOperation(position)
    if (
      canonicalText(action.operation) !== canonicalText(expectedOperation) ||
      !toolPermissionRequestMatches(action, permission, released.interpretation)
    )
      return { kind: 'denied' }
    const given = {
      tenant: action.tenant,
      ...position,
      definition: action.definition,
      effectiveArguments: action.effectiveArguments,
    }
    const original = await input.qualifier.qualify({ ...given, principal: action.principal })
    if ('failure' in original)
      return original.failure.kind === 'denied' ? { kind: 'denied' } : unavailable()
    if (canonicalText(original.ok.request) !== canonicalText(given)) return unavailable()
    const session = await readBoundSessionPermission(input.readSession, permission, action.inquiry)
    if (session === undefined) return unavailable()
    const constraint = await readAgentPermissionConstraint({
      adoptions: input.adoptions,
      resolution: {
        principal: action.principal,
        tenant: action.tenant,
        adoption: original.ok.agentDefinition,
      },
      scope: permission.scope,
      definition: released.interpretation.definition,
    })
    const observation = agentPermissionObservationSchema.parse({
      owner: 'harness.agent-action',
      protocol: 'agent-permission-observation/3',
      observation: {
        configuration: released.interpretation.definition.settings === null ? 'unmapped' : 'mapped',
        principalRef: standingPrincipalRef(action.principal),
        permission,
        definition: released.entry.governance.declaration.reference,
        action: z.json().parse(original.ok),
        current: {
          tenant: session.tenant,
          session: session.session,
          execution: given.execution,
          revision: original.ok.revision,
        },
        inquiry: action.inquiry,
        session,
        constraint,
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
