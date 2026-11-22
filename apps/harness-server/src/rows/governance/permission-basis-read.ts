import { canonicalText } from '@omne-harness/authorization'
import { passMemory } from '../authorization/pass-memory.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { randomUUID } from 'node:crypto'
import type { AgentActionQualification, AgentAdoptions } from '@omne-harness/agent-contract'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import { GovernanceTargetBindingSchema } from '@omne-harness/governance-local'
import type {
  ActingForTenantPrincipal,
  PrincipalVerifier,
  TenantStandingSource,
} from '@omne-harness/identity'
import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import {
  PermissionCurrentBasisSchema,
  evaluatePermission,
  type PermissionBasisReading,
  type PermissionBasisRequest,
  type PermissionEvaluation,
  type PermissionSource,
} from '@omne-harness/permissions'
import { readSettingsSource } from '@omne-harness/settings-local'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type { ToolPermissionContext } from '../authorization/current-tool-permission.ts'
import { qualifyAgentPermission } from './agent-permission-qualification.ts'
import { organizationPermissionSource } from './organization-permission-source.ts'
import {
  permissionBasisCommands,
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
import type { AuthorizationConsumer } from '@omne-harness/session-contract'
import type { SessionAuthorizations } from '@omne-harness/session-storage-sql/participants'
import { readSessionPermissionForCapture } from './permission-session-current.ts'
import { readProjection, type ProjectionRead } from './projection-read.ts'

type Principal = ActingForTenantPrincipal

export type PermissionOrigins = Readonly<{
  action: AgentActionQualification<Principal>
  adoptions: Pick<AgentAdoptions<Principal>, 'resolve'>
}>

export type PermissionBasisReadOptions = PermissionReadMappingOptions &
  Readonly<{
    scope: GovernanceScope
    storage: SqlStorage
    domain: DomainRef
    epoch: string
    identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>
    read: ProjectionRead
    origins(): PermissionOrigins | undefined
    accepting(): boolean
  }>

export type CurrentPermissionRead = Readonly<{
  request: PermissionBasisRequest | null
  reading: PermissionBasisReading
  authorizations: SessionAuthorizations | null
  consumer: AuthorizationConsumer | null
}>

const unavailable = (sourceRef = 'harness.permission-basis'): PermissionBasisReading => ({
  kind: 'unavailable',
  sourceRef,
})
const without = (
  reading: PermissionBasisReading,
  request: PermissionBasisRequest | null = null,
): CurrentPermissionRead => ({
  request,
  reading,
  authorizations: null,
  consumer: null,
})

const missingOrganization = (): PermissionSource => ({
  kind: 'unavailable',
  sourceRef: 'settings.organization',
})

type SessionRead = ReturnType<typeof readSessionPermissionForCapture>
type PassKey = (...parts: unknown[]) => string | undefined

async function qualified(
  options: PermissionBasisReadOptions,
  context: ToolPermissionContext,
  request: PermissionBasisRequest,
  shared: Readonly<{
    passKey: PassKey
    sessionOnce: ReturnType<typeof passMemory<Awaited<SessionRead>>>
  }>,
) {
  const origins = options.origins()
  if (origins === undefined) return unavailable('harness.permission-origin')
  const { passKey, sessionOnce } = shared
  const given = {
    action: context,
    permission: request,
    declarations: options.declarations(),
    // The rows of one gate are the same for every action of a pass; a once authorization is not shared.
    readSession: (value: PermissionBasisRequest, consumer: AuthorizationConsumer | null) =>
      sessionOnce(
        consumer === null
          ? passKey('session', value.capabilityId, value.enforcementKey)
          : undefined,
        () => readSessionPermissionForCapture(options.storage, options.domain, value, consumer),
      ),
  }
  return qualifyAgentPermission({
    ...given,
    qualifier: origins.action,
    adoptions: origins.adoptions,
  })
}

export function createPermissionBasisRead(options: PermissionBasisReadOptions) {
  const map = createPermissionReadMapping(options)
  const standingOnce = passMemory<Awaited<ReturnType<typeof member>>>()
  const gateOnce = passMemory<
    Readonly<{ basis: PermissionBasis; organization: PermissionSource }> | undefined
  >()
  const sessionOnce = passMemory<Awaited<SessionRead>>()

  const matchesScope = (principal: Principal) => {
    const tenant = tenantCodec.encode(principal.tenant)
    const organization = organizationCodec.encode(principal.tenant.organization)
    return tenant.ok && organization.ok && tenant.value === options.scope.tenantRef
  }

  async function member(principal: Principal) {
    const checked = await options.identity.verifier.verify(principal)
    if (checked.kind === 'unavailable') return unavailable()
    if (
      checked.kind !== 'verified' ||
      checked.principal !== principal ||
      checked.principal.kind !== 'acting-for-tenant' ||
      !matchesScope(principal)
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

  async function read(raw: ToolPermissionContext): Promise<CurrentPermissionRead> {
    const context = {
      ...raw,
      operation: { ...raw.operation },
      definition: { ...raw.definition },
      origin: structuredClone(raw.origin),
      inquiry: capturedInquirySchema.parse(raw.inquiry),
    }
    const pass = context.origin.kind === 'agent-action' ? context.origin.pass : undefined
    const work = sessionWorkOf(context.principal, context.tenant)
    const passKey = (...parts: unknown[]) =>
      pass === undefined ? undefined : canonicalText([pass, work?.session ?? null, ...parts])
    const standing = await standingOnce(passKey('standing'), () => member(context.principal))
    if (standing.kind !== 'member') return without(standing)
    const mapped = await map(context)
    if (mapped === undefined) return without(unavailable('harness.permission-target'))
    const request = mapped.permission
    const qualification = await qualified(options, context, request, { passKey, sessionOnce })
    if (qualification.kind !== 'qualified') return without(qualification, request)
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
    // The layers of one gate do not depend on the action; one pass reads them once.
    const gate = await gateOnce(
      passKey('gate', mapped.target, request.definition, origin.session, origin.constraints),
      async () => {
        const projected = await readProjection(
          options.storage,
          options.domain,
          options.read,
          commands,
        )
        if (projected.kind !== 'completed') return undefined
        const basis: PermissionBasis = permissionBasisSchema.parse(projected.response)
        return { basis, organization: await organization(mapped, request, basis.evaluation) }
      },
    )
    if (gate === undefined) return without(unavailable(), request)
    const { basis } = gate
    const current = PermissionCurrentBasisSchema.parse({
      kind: 'current',
      request,
      evaluation: {
        ...basis.evaluation,
        sources: { ...basis.evaluation.sources, organization: gate.organization },
      },
    })
    if (evaluatePermission(current.evaluation).kind === 'invalid-input')
      return without(unavailable(), request)
    return {
      request,
      reading: current,
      authorizations: origin.authorizations,
      consumer: origin.consumer,
    }
  }

  return {
    async readCurrent(context: ToolPermissionContext): Promise<CurrentPermissionRead> {
      try {
        if (!options.accepting()) return without(unavailable())
        const answer = await read(context)
        return options.accepting() ? answer : without(unavailable())
      } catch {
        return without(unavailable())
      }
    },
  }
}
