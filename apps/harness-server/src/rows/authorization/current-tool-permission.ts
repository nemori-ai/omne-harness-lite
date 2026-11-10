import type { ActionAdmission, AdmissionDecision } from '@omne-harness/agent-contract'
import {
  canonicalText,
  decideInquiry,
  decisionEvidence,
  digestOf,
  effectiveArgumentsOf,
} from '@omne-harness/authorization'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { organizationCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  PermissionBasisReadingSchema,
  PermissionBasisRequestSchema,
  type PermissionBasisRequest,
  type PermissionBasisSource,
} from '@omne-harness/permissions'
import type {
  Adoption,
  FixedToolRequest,
  ToolCallId,
  ToolOperationId,
} from '@omne-harness/tool-contract'
import type { SessionInquiryView } from '@omne-harness/session-adapters'
import { capturedInquirySchema } from '../governance/permission-inquiry.ts'
import type { ToolRelease } from '../../entry/tool-release.ts'
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
  origin:
    | (Readonly<{ kind: 'agent-action' }> &
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

export type ToolPermissionCheck = Readonly<{
  check(input: ToolPermissionAction): Promise<Exclude<AdmissionDecision, { kind: 'need-decision' }>>
}>
export type ToolPermissionContext = ToolPermissionAction &
  Readonly<{ inquiry: SessionInquiryView | null }>
export type ToolPermissionPorts = Readonly<{
  release(): ToolRelease
  source(): PermissionBasisSource<ToolPermissionContext> | undefined
  inquiry(input: ToolPermissionAction): Promise<SessionInquiryView | null>
  request(input: ToolPermissionAction): Promise<PermissionBasisRequest | undefined>
}>

const unavailable = () => ({
  kind: 'unavailable' as const,
  diagnostic: 'Current permission source or binding is unavailable.',
})

export function releasedToolPermission(release: ToolRelease, input: ToolPermissionAction) {
  if (release.kind !== 'trusted') return undefined
  const entries = release.manifest.entries.filter(entry =>
    sameAdoption(entry.asset.adoption, input.definition),
  )
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
  request: PermissionBasisRequest,
  interpretation: PermissionInterpretation,
  raw: unknown,
  inquiry: SessionInquiryView | null,
): Awaited<ReturnType<ToolPermissionCheck['check']>> {
  const parsed = PermissionBasisReadingSchema.safeParse(raw)
  if (!parsed.success) return unavailable()
  const reading = parsed.data
  const evidence = decisionEvidence('current-tool-permission', '2', {
    request,
    interpretation,
    reading,
    inquiry,
  })
  if (reading.kind === 'denied')
    return { kind: 'deny', reason: 'permission-source-denied', evidence }
  if (reading.kind !== 'current' || canonicalText(reading.request) !== canonicalText(request))
    return unavailable()
  const decision = interpretPermission({
    released: interpretation,
    action: { binding: interpretation.binding, request },
    current: reading,
  })
  if (decision.kind === 'deny') return { kind: 'deny', reason: 'permission-policy', evidence }
  if (decision.kind === 'allow') return { kind: 'allow', evidence }
  if (decision.kind !== 'need-decision') return unavailable()
  const disposition = decideInquiry('required', inquiry?.inquiry.policy ?? null)
  if (disposition === 'deny') return { kind: 'deny', reason: 'inquiry-policy', evidence }
  return disposition === 'continue' ? { kind: 'allow', evidence } : unavailable()
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
        const released = releasedToolPermission(ports.release(), captured)
        if (released === undefined) return unavailable()
        const { interpretation } = released
        const parsed = PermissionBasisRequestSchema.safeParse(await ports.request(captured))
        if (!parsed.success || !toolPermissionRequestMatches(captured, parsed.data, interpretation))
          return unavailable()
        const source = ports.source()
        if (source === undefined) return unavailable()
        const inquiry = capturedInquirySchema.parse(await ports.inquiry(captured).catch(() => null))
        return interpretReading(
          parsed.data,
          interpretation,
          await source.readCurrent({ ...captured, inquiry }, parsed.data),
          inquiry,
        )
      } catch {
        return unavailable()
      }
    },
  }
}
