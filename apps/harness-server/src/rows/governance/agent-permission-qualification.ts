import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import { capturedInquirySchema } from './permission-inquiry.ts'
import type { AgentActionQualification, AgentAdoptions } from '@omne-harness/agent-contract'
import { canonicalText } from '@omne-harness/authorization'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type { PermissionQualification } from './permission-qualification.ts'
import {
  agentPermissionOperation,
  declaredPermission,
  toolPermissionRequestMatches,
  type ToolPermissionContext,
} from '../authorization/current-tool-permission.ts'
import { agentActionConsumer } from '../authorization/authorization-facts.ts'
import {
  readBoundSessionPermission,
  type SessionPermissionCaptureReader,
} from './permission-session-current.ts'
import { readAgentPermissionConstraint } from './agent-permission-bound.ts'

type AgentPermissionQualificationInput = Readonly<{
  action: ToolPermissionContext
  permission: PermissionBasisRequest
  declarations: readonly PermissionDeclaration[]
  qualifier: AgentActionQualification<ActingForTenantPrincipal>
  adoptions: Pick<AgentAdoptions<ActingForTenantPrincipal>, 'resolve'>
  readSession: SessionPermissionCaptureReader
}>

type AgentActionOrigin = Extract<ToolPermissionContext['origin'], { kind: 'agent-action' }>
type AgentActionPosition = Omit<AgentActionOrigin, 'kind' | 'carrier' | 'pass'>
type JudgedAgentAction = Readonly<{
  action: ToolPermissionContext & { origin: AgentActionOrigin }
  permission: PermissionBasisRequest
  released: NonNullable<ReturnType<typeof declaredPermission>>
  position: AgentActionPosition
}>

const unavailable = (): PermissionQualification => ({
  kind: 'unavailable',
  sourceRef: 'agent.action',
})

function capturedAction(source: ToolPermissionContext): ToolPermissionContext {
  return {
    ...source,
    inquiry: capturedInquirySchema.parse(source.inquiry),
    operation: { ...source.operation },
    definition: { ...source.definition },
    origin: structuredClone(source.origin),
  }
}

function matchesJudgedAction(judged: JudgedAgentAction): boolean {
  // The judging pass only shares reads; the Agent's journal knows the call, not the pass.
  const expectedOperation = agentPermissionOperation(judged.position)
  return (
    canonicalText(judged.action.operation) === canonicalText(expectedOperation) &&
    toolPermissionRequestMatches(judged.action, judged.permission, judged.released.interpretation)
  )
}

function givenCall(judged: JudgedAgentAction) {
  const { action, position } = judged
  const { carrier } = action.origin
  // The Agent's journal holds the call it made; a carried target is qualified through that call.
  return {
    tenant: action.tenant,
    ...position,
    definition: carrier?.definition ?? action.definition,
    effectiveArguments: carrier?.effectiveArguments ?? action.effectiveArguments,
  }
}

async function qualifyOriginalCall(
  input: AgentPermissionQualificationInput,
  judged: JudgedAgentAction,
): Promise<PermissionQualification> {
  const { action, permission, released, position } = judged
  const given = givenCall(judged)
  const original = await input.qualifier.qualify({ ...given, principal: action.principal })
  if ('failure' in original)
    return original.failure.kind === 'denied' ? { kind: 'denied' } : unavailable()
  if (canonicalText(original.ok.request) !== canonicalText(given)) return unavailable()
  const bound = await readBoundSessionPermission(
    input.readSession,
    permission,
    action.inquiry,
    // Only an action a person answered can hold a once authorization; a pass asks for none.
    action.origin.pass === undefined ? agentActionConsumer(position) : null,
  )
  if (bound === undefined) return unavailable()
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
  return {
    kind: 'qualified',
    origin: {
      configuration: released.interpretation.definition.settings === null ? 'unmapped' : 'mapped',
      principalRef: standingPrincipalRef(action.principal),
      definition: released.entry.governance.declaration.reference,
      session: bound.current,
      consumer: bound.consumer,
      authorizations: bound.authorizations,
      constraints: [constraint],
    },
  }
}

async function qualifyCaptured(
  input: AgentPermissionQualificationInput,
): Promise<PermissionQualification> {
  const action = capturedAction(input.action)
  if (action.origin.kind !== 'agent-action') return { kind: 'denied' }
  const permission = PermissionBasisRequestSchema.parse(input.permission)
  const available = declaredPermission(input.declarations, action)
  if (available === undefined) return unavailable()
  const released = structuredClone(available)
  const { kind: _kind, carrier: _carrier, pass: _pass, ...position } = action.origin
  const judged = { action: { ...action, origin: action.origin }, permission, released, position }
  if (!matchesJudgedAction(judged)) return { kind: 'denied' }
  return qualifyOriginalCall(input, judged)
}

/** Original Agent facts select the immutable definition; caller-provided names never do. */
export async function qualifyAgentPermission(
  input: AgentPermissionQualificationInput,
): Promise<PermissionQualification> {
  try {
    return await qualifyCaptured(input)
  } catch {
    return unavailable()
  }
}
