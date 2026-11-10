// The current permission of one action, by reads only. Tenant-domain facts come from one
// projection read. Identity standing and the organization source are in other domains: they are
// read here, at the time of the check, and never cached. The read answers the reading and the
// condition that a later commit uses to check that the tenant-domain facts did not change.
import { randomUUID } from 'node:crypto'
import type {
  AgentActionQualification,
  AgentAdoptions,
  AgentToolQualification,
} from '@omne-harness/agent-contract'
import { canonicalText } from '@omne-harness/authorization'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import { GovernanceTargetBindingSchema } from '@omne-harness/governance-local'
import type {
  ActingForTenantPrincipal,
  PrincipalVerifier,
  TenantStandingSource,
} from '@omne-harness/identity'
import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import {
  PermissionBasisRequestSchema,
  PermissionCurrentBasisSchema,
  evaluatePermission,
  type PermissionBasisReading,
  type PermissionBasisRequest,
  type PermissionEvaluation,
  type PermissionSource,
} from '@omne-harness/permissions'
import { readSettingsSource } from '@omne-harness/settings-local'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type { LocalInvocationQualifier, StartCondition } from '@omne-harness/tool-host-local'
import type { ToolPermissionContext } from '../authorization/current-tool-permission.ts'
import { qualifyAgentPermission } from './agent-permission-qualification.ts'
import { organizationPermissionSource } from './organization-permission-source.ts'
import {
  permissionBasisCommands,
  permissionBasisGuardCommand,
  permissionBasisRequestSchema,
  permissionBasisSchema,
  type PermissionBasis,
} from './permission-basis.ts'
import { capturedInquirySchema } from './permission-inquiry.ts'
import {
  createPermissionReadMapping,
  type PermissionReadMapping,
  type PermissionReadMappingOptions,
} from './permission-read-mapping.ts'
import { readSessionPermissionForCapture } from './permission-session-current.ts'
import { readProjection, type ProjectionRead } from './projection-read.ts'
import { qualifyToolPermission } from './tool-permission-qualification.ts'

type Principal = ActingForTenantPrincipal

/** The owners of the original action: they prove where the action comes from. */
export type PermissionOrigins = Readonly<{
  action: AgentActionQualification<Principal>
  tool: LocalInvocationQualifier<Principal>
  toolAgent: AgentToolQualification<Principal>
  adoptions: Pick<AgentAdoptions<Principal>, 'resolve'>
}>
type Combination = Readonly<{ combinationVersion: string; manifestDigest: string }>

export type PermissionBasisReadOptions = PermissionReadMappingOptions &
  Readonly<{
    scope: GovernanceScope
    storage: SqlStorage
    domain: DomainRef
    /** The current epoch of the Governance scope; the target projection reads this epoch. */
    epoch: string
    identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>
    read: ProjectionRead
    /** The registered combinations that hold the condition commands with the Tool participant. */
    conditions: Readonly<{ mapped: Combination; unmapped: Combination }>
    origins(): PermissionOrigins | undefined
    accepting(): boolean
  }>

export type CurrentPermissionRead = Readonly<{
  reading: PermissionBasisReading
  /** Present only with a current reading. */
  condition: StartCondition | null
}>

const unavailable = (sourceRef = 'harness.permission-basis'): PermissionBasisReading => ({
  kind: 'unavailable',
  sourceRef,
})
const without = (reading: PermissionBasisReading): CurrentPermissionRead => ({
  reading,
  condition: null,
})

const missingOrganization = (): PermissionSource => ({
  kind: 'unavailable',
  sourceRef: 'settings.organization',
})

export function createPermissionBasisRead(options: PermissionBasisReadOptions) {
  const map = createPermissionReadMapping(options)

  const matchesScope = (principal: Principal, request: PermissionBasisRequest) => {
    const tenant = tenantCodec.encode(principal.tenant)
    const organization = organizationCodec.encode(principal.tenant.organization)
    return (
      tenant.ok &&
      organization.ok &&
      tenant.value === options.scope.tenantRef &&
      request.scope.tenantId === tenant.value &&
      request.scope.organizationId === organization.value &&
      request.scope.deploymentId === options.scope.deploymentId &&
      request.scope.logicalServiceId === options.scope.logicalServiceId
    )
  }

  /** Identity is in another domain. It is read for every check. */
  async function member(principal: Principal, request: PermissionBasisRequest) {
    const checked = await options.identity.verifier.verify(principal)
    if (checked.kind === 'unavailable') return unavailable()
    if (
      checked.kind !== 'verified' ||
      checked.principal !== principal ||
      checked.principal.kind !== 'acting-for-tenant' ||
      !matchesScope(principal, request)
    )
      return { kind: 'denied' as const }
    const standing = await options.identity.standing.read({ tenant: principal.tenant })
    if (standing.kind === 'member') return { kind: 'member' as const }
    return standing.kind === 'not-member' ? { kind: 'denied' as const } : unavailable()
  }

  async function organization(
    mapped: PermissionReadMapping,
    request: PermissionBasisRequest,
    evaluation: PermissionEvaluation,
  ): Promise<PermissionSource> {
    if (mapped.source !== null)
      return evaluation.declaration.kind === 'available'
        ? organizationPermissionSource(
            await readSettingsSource(options.storage, mapped.source),
            evaluation.declaration.definition,
            evaluation.scope,
          )
        : missingOrganization()
    if (
      evaluation.declaration.kind === 'available' &&
      evaluation.declaration.definition.settings === null
    )
      return { kind: 'absent', revision: evaluation.targetRevision }
    return request.scope.organizationId === null
      ? { kind: 'absent', revision: 'not-applicable' }
      : missingOrganization()
  }

  async function qualified(context: ToolPermissionContext, request: PermissionBasisRequest) {
    const origins = options.origins()
    if (origins === undefined) return unavailable('harness.permission-origin')
    const shared = {
      action: context,
      permission: request,
      release: options.release(),
      readSession: (value: PermissionBasisRequest) =>
        readSessionPermissionForCapture(options.storage, options.domain, value),
    }
    return context.origin.kind === 'agent-action'
      ? qualifyAgentPermission({
          ...shared,
          qualifier: origins.action,
          adoptions: origins.adoptions,
        })
      : qualifyToolPermission({
          ...shared,
          qualifier: origins.tool,
          agent: { qualifier: origins.toolAgent, adoptions: origins.adoptions },
        })
  }

  async function read(
    raw: ToolPermissionContext,
    request: PermissionBasisRequest,
  ): Promise<CurrentPermissionRead> {
    const context = {
      ...raw,
      operation: { ...raw.operation },
      definition: { ...raw.definition },
      origin: structuredClone(raw.origin),
      inquiry: capturedInquirySchema.parse(raw.inquiry),
    }
    const standing = await member(context.principal, request)
    if (standing.kind !== 'member') return without(standing)
    const mapped = await map(context)
    if (mapped === undefined) return without(unavailable('harness.permission-target'))
    if (canonicalText(mapped.permission) !== canonicalText(request))
      return without({ kind: 'invalid-input', reason: 'binding' })
    const qualification = await qualified(context, request)
    if (qualification.kind !== 'qualified') return without(qualification)
    const { origin } = qualification
    const commands = permissionBasisCommands(
      permissionBasisRequestSchema.parse({
        snapshot: GovernanceTargetBindingSchema.parse({
          scope: options.scope,
          epoch: options.epoch,
          principalRef: origin.principalRef,
          captureId: randomUUID(),
          transactionDomain: options.domain.transactionDomain,
          mode: 'runtime',
          definition: origin.definition,
          target: mapped.target,
        }),
        permission: request,
        session: origin.session,
        constraints: origin.constraints,
        requiredConstraintIds: origin.constraints.map(constraint => constraint.id),
      }),
      origin.configuration,
    )
    const projected = await readProjection(options.storage, options.domain, options.read, commands)
    if (projected.kind !== 'completed') return without(unavailable())
    const basis: PermissionBasis = permissionBasisSchema.parse(projected.response)
    const current = PermissionCurrentBasisSchema.parse({
      kind: 'current',
      request,
      evaluation: {
        ...basis.evaluation,
        sources: {
          ...basis.evaluation.sources,
          organization: await organization(mapped, request, basis.evaluation),
        },
      },
    })
    if (evaluatePermission(current.evaluation).kind === 'invalid-input')
      return without(unavailable())
    return {
      reading: current,
      condition: {
        ...options.conditions[origin.configuration],
        commands: [...commands, permissionBasisGuardCommand(basis)],
      },
    }
  }

  return {
    requestFor: async (input: Parameters<typeof map>[0]) => (await map(input))?.permission,
    async readCurrent(
      context: ToolPermissionContext,
      raw: PermissionBasisRequest,
    ): Promise<CurrentPermissionRead> {
      const request = PermissionBasisRequestSchema.safeParse(raw)
      if (!request.success) return without({ kind: 'invalid-input', reason: 'structure' })
      try {
        if (!options.accepting()) return without(unavailable())
        const answer = await read(context, request.data)
        return options.accepting() ? answer : without(unavailable())
      } catch {
        return without(unavailable())
      }
    },
  }
}

export type PermissionBasisRead = ReturnType<typeof createPermissionBasisRead>
