import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  PermissionBasisRequestSchema,
  PermissionBasisReadingSchema,
  type PermissionBasisReading,
  type PermissionBasisRequest,
  type PermissionBasisSource,
} from '@omne-harness/permissions'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { tenantCodec, organizationCodec } from '@omne-harness/legal-identity'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { DomainRef, FactCommandV2 } from '@omne-harness/sql-contract'
import {
  permissionCaptureCommandSchema,
  requestRef,
  type OperationBinding,
  type Execution,
} from './operation-schema.ts'
import { PERMISSION_SNAPSHOT, permissionReadingSchema } from './permission-capture-schema.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import type { GovernanceStandingCoordinator } from './standing-coordinator.ts'
import type { GovernanceSourceCoordinator } from './source-coordinator.ts'
import { persistStageSchema, sqlEnvelopeSchema } from './sql-stage-schema.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import { canonical, digest, equal, json, operationIdentity } from './encoding.ts'
import { mutationCombinationSchema, type MutationCombination } from './registrar-execution.ts'
import { isTerminal } from './registrar-results.ts'

type Principal = ActingForTenantPrincipal
export const permissionReadPlanSchema = permissionCaptureCommandSchema
  .pick({ permission: true, target: true, source: true, qualification: true })
  .extend({ kind: z.literal('resolved') })
export type PermissionReadPlan = z.infer<typeof permissionReadPlanSchema>
export type PermissionProjectionRequest = Readonly<{
  binding: OperationBinding
  epoch: string
  transactionDomain: string
  command: z.infer<typeof permissionCaptureCommandSchema>
}>
export type GovernancePermissionOptions<ReadContext = Principal> = Readonly<{
  sourceRoute: string
  principalOf(context: ReadContext): Principal
  resolve(
    principal: Principal,
    request: PermissionBasisRequest,
    context: ReadContext,
  ): Promise<PermissionReadPlan | Exclude<PermissionBasisReading, { kind: 'current' }>>
  project(input: PermissionProjectionRequest): PermissionProjection
}>
export type PermissionProjection = Readonly<{
  combination: MutationCombination
  commands: readonly FactCommandV2[]
}>
const projectionSchema = z.strictObject({
  combination: mutationCombinationSchema,
  commands: z.array(sqlEnvelopeSchema.shape.commands.element).min(1).max(126),
})
type Options<ReadContext> = GovernancePermissionOptions<ReadContext> &
  Readonly<{
    scope: GovernanceScope
    domain: DomainRef
    epoch: string
    destination: string
    identity: { verifier: PrincipalVerifier; standing: TenantStandingSource }
    sql: SqlOperationCoordinator
    standing: GovernanceStandingCoordinator
    sources: GovernanceSourceCoordinator<Principal>
    accepting(): boolean
    cleanup(call: () => Promise<unknown>): void
  }>
const unavailable = (): PermissionBasisReading => ({
  kind: 'unavailable',
  sourceRef: 'governance.permission-current',
})

export class GovernancePermissionReader<
  ReadContext = Principal,
> implements PermissionBasisSource<ReadContext> {
  private readonly options: Options<ReadContext>
  constructor(options: Options<ReadContext>) {
    this.options = options
  }

  private matchesScope(principal: Principal, request: PermissionBasisRequest) {
    const tenant = tenantCodec.encode(principal.tenant),
      organization = organizationCodec.encode(principal.tenant.organization)
    const scope = this.options.scope
    if (
      !tenant.ok ||
      !organization.ok ||
      tenant.value !== scope.tenantRef ||
      request.scope.tenantId !== tenant.value ||
      request.scope.organizationId !== organization.value ||
      request.scope.deploymentId !== scope.deploymentId ||
      request.scope.logicalServiceId !== scope.logicalServiceId
    )
      return false
    return true
  }

  private async qualify(principal: Principal, request: PermissionBasisRequest) {
    const checked = await this.options.identity.verifier.verify(principal)
    if (checked.kind === 'unavailable') return unavailable()
    if (
      checked.kind !== 'verified' ||
      checked.principal !== principal ||
      checked.principal.kind !== 'acting-for-tenant'
    )
      return { kind: 'denied' as const }
    if (!this.matchesScope(principal, request)) return { kind: 'denied' as const }
    const member = await this.options.identity.standing.read({ tenant: principal.tenant })
    return member.kind === 'member'
      ? { kind: 'qualified' as const }
      : member.kind === 'not-member'
        ? { kind: 'denied' as const }
        : unavailable()
  }

  private async submit(binding: OperationBinding, command: PermissionProjectionRequest['command']) {
    const options = this.options
    const projection = projectionSchema.parse(
      options.project(
        structuredClone({
          binding,
          command,
          epoch: options.epoch,
          transactionDomain: options.domain.transactionDomain,
        }),
      ),
    )
    const execution: Execution = {
      ...projection.combination,
      authority: {
        protocol: 'governance-permission-admission/1',
        principalRef: binding.ref.principalRef,
        requestDigest: binding.requestDigest,
      },
    }
    if (!options.accepting()) return
    await options.sql.executeControl(binding, { kind: 'submit', binding, execution })
    const observed = await options.sql.observe(binding)
    if (
      observed.kind !== 'found' ||
      observed.record.state !== 'submitted' ||
      !equal(observed.record.execution, execution)
    )
      return
    const request = { binding, execution }
    const envelope = {
      identity: operationIdentity(options.domain.transactionDomain, binding.ref),
      ...projection.combination,
      commands: [
        ...projection.commands,
        { participant: PERMISSION_SNAPSHOT.participant, facts: { request: json(request) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
      ],
    }
    if (!options.accepting()) return
    const saved = await options.sql.save(
      persistStageSchema.parse({ binding, stage: 'apply', envelope }),
    )
    if (saved.kind === 'stored' && options.accepting()) await options.sql.send(binding, 'apply')
  }

  private async finish(
    binding: OperationBinding,
    request: PermissionBasisRequest,
  ): Promise<PermissionBasisReading> {
    const { sql, standing, sources } = this.options
    let current = await sql.observe(binding)
    if (current.kind !== 'found') return unavailable()
    if (!isTerminal(current.record)) {
      await sql.executeControl(binding, { kind: 'seal', binding })
      current = await sql.observe(binding)
    }
    if (current.kind !== 'found' || !isTerminal(current.record)) return unavailable()
    this.options.cleanup(() =>
      Promise.allSettled([standing.settle(binding), sources.settle(binding)]),
    )
    const parsed = permissionReadingSchema.safeParse(current.record.result)
    if (!parsed.success || !equal(parsed.data, current.record.result)) return unavailable()
    return parsed.data.kind === 'current' && !equal(parsed.data.request, request)
      ? unavailable()
      : parsed.data
  }

  private async capture(
    principal: Principal,
    plan: PermissionReadPlan,
  ): Promise<PermissionBasisReading> {
    const options = this.options
    const { kind: _kind, ...resolved } = plan
    const command = permissionCaptureCommandSchema.parse({
      ...resolved,
      scope: options.scope,
      operationId: randomUUID(),
      sourceRoute: options.sourceRoute,
    })
    const request = { owner: 'internal.capture' as const, command }
    const principalRef = standingPrincipalRef(principal)
    const binding = { ref: requestRef(principalRef, request), requestDigest: digest(request) }
    try {
      if (!options.accepting()) return unavailable()
      const accepted = await options.sql.accept({
        principalRef,
        epoch: options.epoch,
        transactionDomain: options.domain.transactionDomain,
        request,
      })
      if (accepted.kind !== 'found') return unavailable()
      const held = await options.standing.reserve(
        { operation: binding, destination: options.destination, required: [] },
        principal,
      )
      if (held.kind === 'held') {
        await options.sources.reserve(binding, principal)
        await this.submit(binding, command)
      }
      return await this.finish(binding, plan.permission)
    } catch {
      return this.finish(binding, plan.permission).catch(unavailable)
    }
  }

  async readCurrent(
    context: ReadContext,
    raw: PermissionBasisRequest,
  ): Promise<PermissionBasisReading> {
    const parsed = PermissionBasisRequestSchema.safeParse(raw)
    if (!parsed.success) return { kind: 'invalid-input', reason: 'structure' }
    const request = parsed.data
    try {
      if (!this.options.accepting()) return unavailable()
      const principal = this.options.principalOf(context)
      const qualified = await this.qualify(principal, request)
      if (qualified.kind !== 'qualified') return qualified
      const plan = await this.options.resolve(principal, request, context)
      if (plan.kind !== 'resolved') return PermissionBasisReadingSchema.parse(plan)
      const captured = permissionReadPlanSchema.parse(plan)
      if (
        !equal(captured.permission, request) ||
        request.scope.targetId !== canonical(captured.target)
      )
        return { kind: 'invalid-input', reason: 'binding' }
      return this.capture(principal, captured)
    } catch {
      return unavailable()
    }
  }
}
