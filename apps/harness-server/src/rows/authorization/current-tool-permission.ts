import type { ActionAdmission, AdmissionDecision } from '@omne-harness/agent-contract'
import {
  canonicalText,
  decideRelease,
  decisionEvidence,
  digestOf,
  effectiveArgumentsOf,
  type DecisionEvidence,
  type GateVerdict,
  type ReleaseDecision,
  type SessionFacts,
} from '@omne-harness/authorization'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { organizationCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  PermissionBasisReadingSchema,
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type { StartCondition } from '@omne-harness/tool-host-local'
import type {
  Adoption,
  FixedToolRequest,
  ToolCallId,
  ToolOperationId,
} from '@omne-harness/tool-contract'
import type { SessionInquiryView } from '@omne-harness/session-adapters'
import type { AuthorizationConsumer, OnceAuthorization } from '@omne-harness/session-contract'
import type { SessionAuthorizations } from '@omne-harness/session-storage-sql/participants'
import { onceAuthorizationFor, sessionGrantFor } from './authorization-facts.ts'
import { capturedInquirySchema } from '../governance/permission-inquiry.ts'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import { interpretPermission } from '../governance/permission-interpreter.ts'
import { sameAdoption } from '../../entry/tool-release-manifest.ts'
import {
  resolvePermissionInterpretation,
  type PermissionInterpretation,
} from '../governance/permission-interpretation.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

export type ToolPermissionAction = Readonly<{
  principal: ActingForTenantPrincipal
  tenant: TenantId
  operation: PermissionBasisRequest['operation']
  definition: Adoption
  effectiveArguments: string
  /** The call only carries another action: only a prohibition of this gate counts. */
  carrier?: true
  origin:
    | (Readonly<{
        kind: 'agent-action'
        /** Set when this action is the target the Agent's call carries; the call is qualified. */
        carrier?: Readonly<{ definition: Adoption; effectiveArguments: string }>
        /** The judging pass over the Agent's batch: facts of the session are read once per pass. */
        pass?: string
      }> &
        Pick<
          Parameters<ActionAdmission<unknown>['admit']>[0],
          'advance' | 'execution' | 'passage' | 'action' | 'original'
        >)
    | Readonly<{
        kind: 'tool-call'
        call: ToolCallId
        admission: ToolOperationId
        request: FixedToolRequest
      }>
}>
export function agentPermissionOperation(
  position: Pick<
    Extract<ToolPermissionAction['origin'], { kind: 'agent-action' }>,
    'execution' | 'passage' | 'action'
  >,
): PermissionBasisRequest['operation'] {
  return {
    owner: 'agent',
    operationId: `action/${digestOf([position.execution, position.passage, position.action])}`,
  }
}

type Decision = Exclude<AdmissionDecision, { kind: 'need-decision' }>
/** The gate that asks, and the revision of its verdict: what a release for the session rests on. */
export type AskedGate = Readonly<{ capabilityId: string; enforcementKey: string; basis: string }>
export type ToolPermissionDecision =
  | (Extract<Decision, { kind: 'allow' }> &
      Readonly<{
        condition: StartCondition | null
        authorization?: OnceAuthorization
      }>)
  | Readonly<{ kind: 'ask'; evidence: DecisionEvidence; gate?: AskedGate }>
  | Exclude<Decision, { kind: 'allow' }>
export type ToolPermissionCheck = Readonly<{
  check(input: ToolPermissionAction): Promise<ToolPermissionDecision>
}>
export type CurrentPermissionRead = Readonly<{
  request: unknown
  reading: unknown
  condition: StartCondition | null
  authorizations?: SessionAuthorizations | null
  consumer?: AuthorizationConsumer | null
}>
export type CurrentPermissionSource = Readonly<{
  readCurrent(context: ToolPermissionContext): Promise<CurrentPermissionRead>
}>
export type ToolPermissionContext = ToolPermissionAction &
  Readonly<{ inquiry: SessionInquiryView | null }>
export type ToolPermissionPorts = Readonly<{
  declarations(): readonly PermissionDeclaration[]
  source(): CurrentPermissionSource | undefined
  inquiry(input: ToolPermissionAction): Promise<SessionInquiryView | null>
}>

const unavailable = (diagnostic: string) => ({ kind: 'unavailable' as const, diagnostic })
const undecidable = (diagnostic: string) => ({ kind: 'undecidable' as const, diagnostic })

// A gate is found by the capability's identity in the declarations its category owners registered.
export function declaredPermission(
  declarations: readonly PermissionDeclaration[],
  input: Pick<ToolPermissionAction, 'definition'>,
) {
  const entries = declarations.filter(entry => sameAdoption(entry.asset.adoption, input.definition))
  if (entries.length !== 1) return undefined
  const entry = entries[0]!
  const bindings = entry.governance.declaration.enforcementBindings.filter(
    binding => binding.action === 'invoke' && binding.enforcementKey === 'tool.invoke',
  )
  if (bindings.length !== 1) return undefined
  const expected = bindings[0]!
  const interpretations = entry.governance.interpretations.filter(
    value => canonicalText(value.binding) === canonicalText(expected),
  )
  if (interpretations.length !== 1) return undefined
  const resolved = resolvePermissionInterpretation(interpretations[0], expected)
  return resolved.kind === 'supported'
    ? { entry, interpretation: resolved.interpretation }
    : undefined
}

function matchesAction(input: ToolPermissionAction, request: PermissionBasisRequest) {
  const tenant = tenantCodec.encode(input.tenant)
  const organization = organizationCodec.encode(input.tenant.organization)
  const work = sessionWorkOf(input.principal, input.tenant)
  return (
    tenant.ok &&
    organization.ok &&
    work !== undefined &&
    request.scope.tenantId === tenant.value &&
    request.scope.organizationId === organization.value &&
    request.scope.sessionId === work.session &&
    canonicalText(request.operation) === canonicalText(input.operation) &&
    request.argumentsDigest === effectiveArgumentsOf(input.effectiveArguments).digest
  )
}

function matchesRelease(request: PermissionBasisRequest, interpretation: PermissionInterpretation) {
  const { binding, definition } = interpretation
  return (
    request.implementationRef === binding.implementationRef &&
    request.capabilityId === binding.capabilityId &&
    request.enforcementKey === binding.enforcementKey &&
    canonicalText(request.definition) === canonicalText(definition.reference)
  )
}

export function toolPermissionRequestMatches(
  input: ToolPermissionAction,
  request: PermissionBasisRequest,
  interpretation: PermissionInterpretation,
) {
  return matchesAction(input, request) && matchesRelease(request, interpretation)
}

function interpretReading(
  input: ToolPermissionAction,
  request: PermissionBasisRequest,
  interpretation: PermissionInterpretation,
  read: CurrentPermissionRead,
  inquiry: SessionInquiryView | null,
): ToolPermissionDecision {
  const { reading: raw, condition } = read
  const parsed = PermissionBasisReadingSchema.safeParse(raw)
  if (!parsed.success) return undecidable('The permission reading is malformed.')
  const reading = parsed.data
  const evidence = decisionEvidence('current-tool-permission', '2', {
    request,
    interpretation,
    reading,
    inquiry,
  })
  if (reading.kind === 'denied')
    return { kind: 'deny', category: 'rule', reason: 'permission-source-denied', evidence }
  if (reading.kind !== 'current' || canonicalText(reading.request) !== canonicalText(request))
    return undecidable('The permission reading does not answer this request.')
  const decision = interpretPermission({
    released: interpretation,
    action: { binding: interpretation.binding, request },
    current: reading,
  })
  const kind =
    decision.kind === 'deny'
      ? 'prohibited'
      : decision.kind === 'allow'
        ? 'allowed'
        : decision.kind === 'need-decision'
          ? 'decision-required'
          : undefined
  if (kind === undefined)
    return undecidable('The permission interpretation answered outside its contract.')
  // The verdict belongs to the gate: its revision does not depend on the action that asked.
  const revision = digestOf(reading.evaluation)
  return permissionDecisionOf({ kind, revision }, inquiry, input.carrier === true, {
    evidence,
    condition,
    once: onceAuthorizationFor(input, read),
    gate: {
      capabilityId: request.capabilityId,
      enforcementKey: request.enforcementKey,
      basis: revision,
    },
    sessionBasis: sessionGrantFor(request, read),
  })
}

type Found = Readonly<{
  evidence: DecisionEvidence
  condition: StartCondition | null
  once?: OnceAuthorization | null
  gate?: AskedGate
  sessionBasis?: string | null
}>

export function permissionDecisionOf(
  verdict: Exclude<GateVerdict, { kind: 'unavailable' }>,
  inquiry: SessionInquiryView | null,
  carrier: boolean,
  found: Found,
): ToolPermissionDecision {
  const session = sessionFactsOf(inquiry, (found.once ?? null) !== null, found.sessionBasis ?? null)
  return releaseDecision(decideRelease({ carrier, verdict, session }), found)
}

function sessionFactsOf(
  inquiry: SessionInquiryView | null,
  once: boolean,
  sessionGrantBasis: string | null,
): SessionFacts {
  if (inquiry === null) return { kind: 'unavailable' }
  return {
    kind: 'read',
    revision: inquiry.basis.permissionRevision,
    policy: inquiry.inquiry.policy,
    once,
    sessionGrantBasis,
  }
}

function releaseDecision(
  decided: ReleaseDecision,
  { evidence, condition, once, gate }: Found,
): ToolPermissionDecision {
  switch (decided.kind) {
    case 'release':
      return decided.by === 'once' && once
        ? { kind: 'allow', evidence, condition, authorization: once }
        : { kind: 'allow', evidence, condition }
    case 'refuse':
      return {
        kind: 'deny',
        category: 'rule',
        reason: decided.reason === 'prohibited' ? 'permission-policy' : 'inquiry-policy',
        evidence,
      }
    case 'ask':
      return gate === undefined ? { kind: 'ask', evidence } : { kind: 'ask', evidence, gate }
    case 'unavailable':
      return unavailable('The session inquiry policy could not be read now.')
  }
}

export function createCurrentToolPermission(ports: ToolPermissionPorts): ToolPermissionCheck {
  return {
    async check(input) {
      try {
        const captured = {
          ...input,
          operation: { ...input.operation },
          definition: { ...input.definition },
          origin: structuredClone(input.origin),
        }
        const released = declaredPermission(ports.declarations(), captured)
        if (released === undefined)
          return unavailable('No permission declaration names this capability and gate.')
        const { interpretation } = released
        const source = ports.source()
        if (source === undefined)
          return unavailable('The current permission source is not provided now.')
        const inquiry = capturedInquirySchema.parse(await ports.inquiry(captured).catch(() => null))
        const read = await source.readCurrent({ ...captured, inquiry })
        const reading = PermissionBasisReadingSchema.safeParse(read.reading)
        if (reading.success && reading.data.kind === 'unavailable')
          return unavailable('The permission basis could not be read now.')
        const parsed = PermissionBasisRequestSchema.safeParse(read.request)
        if (!parsed.success || !toolPermissionRequestMatches(captured, parsed.data, interpretation))
          return undecidable('The permission source answered for another request.')
        return interpretReading(captured, parsed.data, interpretation, read, inquiry)
      } catch {
        return undecidable('The current permission check failed.')
      }
    },
  }
}
