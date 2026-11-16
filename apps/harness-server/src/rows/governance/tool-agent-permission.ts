import type { AgentAdoptions, AgentToolQualification } from '@omne-harness/agent-contract'
import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import { canonicalText } from '@omne-harness/authorization'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  PermissionBasisRequest,
  PermissionConstraint,
  PermissionDefinition,
} from '@omne-harness/permissions'
import type { InvocationOrigin } from '@omne-harness/tool-host-local'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { readAgentPermissionConstraint } from './agent-permission-bound.ts'

export type ToolAgentPermissionSource = Readonly<{
  qualifier: AgentToolQualification<ActingForTenantPrincipal>
  adoptions: Pick<AgentAdoptions<ActingForTenantPrincipal>, 'resolve'>
}>
type Failure = Readonly<{ kind: 'denied' }> | Readonly<{ kind: 'unavailable'; sourceRef: string }>
const unavailable = (): Outcome<never, Failure> =>
  fail({ kind: 'unavailable', sourceRef: 'agent.tool-origin' })

export async function qualifyOriginalToolAgent(
  input: Readonly<{
    principal: ActingForTenantPrincipal
    tenant: TenantId
    origin: InvocationOrigin
    source: ToolAgentPermissionSource | undefined
    permission: PermissionBasisRequest
    definition: PermissionDefinition
  }>,
): Promise<Outcome<PermissionConstraint | null, Failure>> {
  if (input.origin.request.consumer.owner !== AGENT_CONSUMER_OWNER) return succeed(null)
  if (input.source === undefined) return unavailable()
  const { invocation: _invocation, ...request } = input.origin.request
  const given = {
    tenant: input.tenant,
    call: input.origin.call,
    admission: input.origin.admission,
    request,
  }
  const result = await input.source.qualifier.qualify({ ...given, principal: input.principal })
  if ('failure' in result)
    return result.failure.kind === 'denied' ? fail({ kind: 'denied' }) : unavailable()
  if (canonicalText(result.ok.request) !== canonicalText(given)) return unavailable()
  return succeed(
    await readAgentPermissionConstraint({
      adoptions: input.source.adoptions,
      resolution: {
        principal: input.principal,
        tenant: input.tenant,
        adoption: result.ok.agentDefinition,
      },
      scope: input.permission.scope,
      definition: input.definition,
    }),
  )
}
