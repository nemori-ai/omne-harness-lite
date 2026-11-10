import { agentPermissionObservationSchema } from './agent-permission-observation.ts'
import type {
  AgentActionQualification,
  AgentToolQualification,
  AgentAdoptions,
} from '@omne-harness/agent-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { canonicalText } from '@omne-harness/authorization'
import type {
  GovernancePermissionOptions,
  PermissionProjectionRequest,
} from '@omne-harness/governance-local'
import type { LocalInvocationQualifier } from '@omne-harness/tool-host-local'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type { ToolPermissionContext } from '../authorization/current-tool-permission.ts'
import {
  createPermissionReadMapping,
  type PermissionReadMappingOptions,
} from './permission-read-mapping.ts'
import { qualifyAgentPermission } from './agent-permission-qualification.ts'
import { qualifyToolPermission } from './tool-permission-qualification.ts'
import { readSessionPermissionForCapture } from './permission-session-current.ts'
import { agentPermissionCurrentCommands } from './agent-permission-current.ts'
import { toolPermissionCurrentCommands } from './tool-permission-current.ts'
import { toolPermissionObservationSchema } from './tool-permission-observation.ts'
import type { governanceStorageCombinations } from './storage-combinations.ts'
import { capturedInquirySchema } from './permission-inquiry.ts'

type Principal = ActingForTenantPrincipal
export type PermissionOrigins = Readonly<{
  action: AgentActionQualification<Principal>
  tool: LocalInvocationQualifier<Principal>
  toolAgent: AgentToolQualification<Principal>
  adoptions: Pick<AgentAdoptions<Principal>, 'resolve'>
}>
type Combinations = ReturnType<typeof governanceStorageCombinations>
type Options = PermissionReadMappingOptions &
  Readonly<{
    sourceRoute: string
    storage: SqlStorage
    domain: DomainRef
    combinations: Combinations
    origins(): PermissionOrigins | undefined
  }>

function combinationReference({
  combinationVersion,
  manifestDigest,
}: Combinations['permissionAgent']) {
  return { combinationVersion, manifestDigest }
}

function projectPermission(combinations: Combinations, input: PermissionProjectionRequest) {
  if (input.command.qualification.owner === 'harness.agent-action') {
    const { observation } = agentPermissionObservationSchema.parse(input.command.qualification)
    return {
      combination: combinationReference(
        observation.configuration === 'unmapped'
          ? combinations.permissionAgentUnmapped
          : combinations.permissionAgent,
      ),
      commands: agentPermissionCurrentCommands(input),
    }
  }
  const { observation } = toolPermissionObservationSchema.parse(input.command.qualification)
  const agent = observation.agent.kind === 'agent'
  const combination =
    observation.configuration === 'unmapped'
      ? agent
        ? combinations.permissionAgentToolUnmapped
        : combinations.permissionToolUnmapped
      : agent
        ? combinations.permissionAgentTool
        : combinations.permissionTool
  return {
    combination: combinationReference(combination),
    commands: toolPermissionCurrentCommands(input),
  }
}

/** Application-only composition; Governance persists the original qualification without interpreting it. */
export function createTenantPermissionRead(options: Options) {
  const map = createPermissionReadMapping(options)
  const permission: GovernancePermissionOptions<ToolPermissionContext> = {
    sourceRoute: options.sourceRoute,
    principalOf: context => context.principal,
    async resolve(principal, request, raw) {
      const context = {
        ...raw,
        operation: { ...raw.operation },
        definition: { ...raw.definition },
        origin: structuredClone(raw.origin),
        inquiry: capturedInquirySchema.parse(raw.inquiry),
      }
      if (context.principal !== principal) return { kind: 'denied' }
      const mapped = await map(context)
      if (mapped === undefined)
        return { kind: 'unavailable', sourceRef: 'harness.permission-target' }
      if (canonicalText(mapped.permission) !== canonicalText(request))
        return { kind: 'invalid-input', reason: 'binding' }
      const origins = options.origins()
      if (origins === undefined)
        return { kind: 'unavailable', sourceRef: 'harness.permission-origin' }
      const shared = {
        action: context,
        permission: request,
        release: options.release(),
        readSession: (value: typeof request) =>
          readSessionPermissionForCapture(options.storage, options.domain, value),
      }
      const qualified =
        context.origin.kind === 'agent-action'
          ? await qualifyAgentPermission({
              ...shared,
              qualifier: origins.action,
              adoptions: origins.adoptions,
            })
          : await qualifyToolPermission({
              ...shared,
              qualifier: origins.tool,
              agent: { qualifier: origins.toolAgent, adoptions: origins.adoptions },
            })
      if (qualified.kind !== 'qualified') return qualified
      return { kind: 'resolved', ...mapped, qualification: qualified.qualification }
    },
    project: input => projectPermission(options.combinations, input),
  }
  return {
    permission,
    requestFor: async (input: Parameters<typeof map>[0]) => (await map(input))?.permission,
  }
}
