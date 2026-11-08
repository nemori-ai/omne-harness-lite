import { z } from 'zod'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type TenantStandingSource,
} from '@omne-harness/identity'
import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { DomainRef, FactCommandV2, SqlIdentity } from '@omne-harness/sql-contract'
import { externalWriteCommandSchema, type ExternalWriteCommand } from './external-write-schema.ts'
import { executionSchema, type OperationBinding, type OperationRecord } from './operation-schema.ts'
import {
  externalWriteExecutionSchema,
  EXTERNAL_WRITE_BASIS,
  EXTERNAL_WRITE_TERMINAL,
} from './external-write-stage.ts'
import { persistStageSchema } from './sql-stage-schema.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import type { GovernanceStandingCoordinator } from './standing-coordinator.ts'
import type { GovernanceSourceCoordinator } from './source-coordinator.ts'
import type { MutationCombination } from './registrar-execution.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import { digest, equal, json, operationIdentity } from './encoding.ts'

const intentSchema = externalWriteCommandSchema.pick({ operationId: true }).extend({
  write: externalWriteCommandSchema.shape.write.omit({ qualification: true }),
})
const qualificationSchema = externalWriteCommandSchema
  .pick({ required: true, source: true })
  .extend({
    kind: z.literal('qualified'),
    qualification: z.json(),
  })
const refusalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('denied') }),
  z.strictObject({ kind: z.literal('unavailable'), owner: z.string().min(1) }),
])
type Principal = ActingForTenantPrincipal
export type GovernanceExternalWriteIntent = z.infer<typeof intentSchema>
export type GovernanceExternalWriteQualification = z.infer<typeof qualificationSchema>
export type GovernanceExternalWriteInput = Readonly<{
  binding: OperationBinding
  epoch: string
  transactionDomain: string
  command: ExternalWriteCommand
}>
export type GovernanceExternalWriteOptions<WriteContext = Principal> = Readonly<{
  sourceRoute: string
  principalOf(context: WriteContext): Principal
  resolve(
    principal: Principal,
    intent: GovernanceExternalWriteIntent,
    context: WriteContext,
  ): Promise<GovernanceExternalWriteQualification | z.infer<typeof refusalSchema>>
  plan(input: GovernanceExternalWriteInput): Readonly<{
    combination: MutationCombination
    writer: string
    commands: readonly FactCommandV2[]
  }>
}>
export type GovernanceExternalWriteOutcome =
  | z.infer<typeof refusalSchema>
  | { kind: 'invalid-input'; reason: 'structure' }
  | { kind: 'conflict'; reason: 'operation' }
  | {
      kind: 'terminal'
      binding: OperationBinding
      sqlIdentity: SqlIdentity
      outcome: 'committed' | 'aborted'
      result: z.infer<ReturnType<typeof z.json>>
    }
export type GovernanceExternalWrites<WriteContext = Principal> = Readonly<{
  execute(context: WriteContext, intent: unknown): Promise<GovernanceExternalWriteOutcome>
}>
type Options<WriteContext> = GovernanceExternalWriteOptions<WriteContext> &
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
const unavailable = () => ({ kind: 'unavailable' as const, owner: 'governance-external-write' })
function originalIntent(command: ExternalWriteCommand): GovernanceExternalWriteIntent {
  const { qualification: _qualification, ...write } = command.write
  return { operationId: command.operationId, write }
}

export class GovernanceExternalWriteCoordinator<
  WriteContext = Principal,
> implements GovernanceExternalWrites<WriteContext> {
  private readonly options: Options<WriteContext>
  constructor(options: Options<WriteContext>) {
    this.options = options
  }

  private async verify(principal: Principal) {
    const checked = await this.options.identity.verifier.verify(principal)
    if (checked.kind === 'unavailable') return unavailable()
    if (
      checked.kind !== 'verified' ||
      checked.principal !== principal ||
      checked.principal.kind !== 'acting-for-tenant'
    )
      return { kind: 'denied' as const }
    const tenant = tenantCodec.encode(principal.tenant)
    return tenant.ok && tenant.value === this.options.scope.tenantRef
      ? { kind: 'verified' as const }
      : { kind: 'denied' as const }
  }

  private async original(
    principal: Principal,
    intent: GovernanceExternalWriteIntent,
    context: WriteContext,
  ) {
    const options = this.options
    const principalRef = standingPrincipalRef(principal)
    const ref = {
      scope: options.scope,
      owner: 'internal.external-write' as const,
      principalRef,
      operationId: intent.operationId,
    }
    const previous = await options.sql.lookup(ref)
    if (previous.kind !== 'absent') return previous
    const member = await options.identity.standing.read({ tenant: principal.tenant })
    if (member.kind !== 'member')
      return member.kind === 'not-member' ? { kind: 'denied' as const } : unavailable()
    const resolved = await options.resolve(principal, structuredClone(intent), context)
    if (resolved.kind !== 'qualified') return refusalSchema.parse(resolved)
    const plan = qualificationSchema.parse(resolved)
    const request = {
      owner: 'internal.external-write' as const,
      command: externalWriteCommandSchema.parse({
        ...intent,
        scope: options.scope,
        sourceRoute: options.sourceRoute,
        write: { ...intent.write, qualification: plan.qualification },
        required: plan.required,
        source: plan.source,
      }),
    }
    if (!options.accepting()) return unavailable()
    return options.sql.accept({
      principalRef,
      epoch: options.epoch,
      transactionDomain: options.domain.transactionDomain,
      request,
    })
  }

  private async submit(
    binding: OperationBinding,
    record: OperationRecord,
    command: ExternalWriteCommand,
  ) {
    const options = this.options
    if (record.state === 'accepted') {
      const plan = options.plan(
        structuredClone({
          binding,
          epoch: record.epoch,
          transactionDomain: options.domain.transactionDomain,
          command,
        }),
      )
      const execution = executionSchema.parse({
        ...plan.combination,
        authority: externalWriteExecutionSchema.parse({
          protocol: 'governance-external-write-execution/1',
          requestDigest: binding.requestDigest,
          writer: plan.writer,
          commands: plan.commands,
        }),
      })
      if (!options.accepting()) return
      await options.sql.executeControl(binding, { kind: 'submit', binding, execution })
    }
    const current = await options.sql.observe(binding)
    if (
      current.kind !== 'found' ||
      current.record.state !== 'submitted' ||
      current.record.execution === null
    )
      return
    const execution = current.record.execution
    const authority = externalWriteExecutionSchema.parse(execution.authority)
    const request = { binding, execution }
    const envelope = {
      identity: operationIdentity(options.domain.transactionDomain, binding.ref),
      combinationVersion: execution.combinationVersion,
      manifestDigest: execution.manifestDigest,
      commands: [
        ...authority.commands,
        { participant: EXTERNAL_WRITE_BASIS, facts: { request: json(request) } },
        { participant: EXTERNAL_WRITE_TERMINAL, facts: { request: json(request) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
      ],
    }
    if (!options.accepting()) return
    const saved = await options.sql.save(
      persistStageSchema.parse({ binding, stage: 'apply', envelope }),
    )
    if (saved.kind === 'stored' && options.accepting()) await options.sql.send(binding, 'apply')
  }

  private async finish(binding: OperationBinding): Promise<GovernanceExternalWriteOutcome> {
    const { sql, standing, sources } = this.options
    let current = await sql.observe(binding)
    if (current.kind !== 'found') return unavailable()
    if (current.record.state === 'accepted' || current.record.state === 'submitted') {
      await sql.executeControl(binding, { kind: 'seal', binding })
      current = await sql.observe(binding)
    }
    if (current.kind !== 'found') return unavailable()
    const { state, result, sqlIdentity } = current.record
    if (state !== 'committed' && state !== 'aborted') return unavailable()
    this.options.cleanup(() =>
      Promise.allSettled([standing.settle(binding), sources.settle(binding)]),
    )
    return { kind: 'terminal', binding, sqlIdentity, outcome: state, result }
  }

  private async advance(
    principal: Principal,
    binding: OperationBinding,
    record: OperationRecord,
    command: ExternalWriteCommand,
  ) {
    const options = this.options
    try {
      if (record.state === 'accepted' || record.state === 'submitted') {
        const held = await options.standing.reserve(
          { operation: binding, destination: options.destination, required: command.required },
          principal,
        )
        if (held.kind === 'held') {
          const source = await options.sources.reserve(binding, principal)
          if (source.kind === 'held' || source.kind === 'not-required')
            await this.submit(binding, record, command)
        }
      }
    } catch {
      // An accepted operation retains its durable custody until seal and settlement are observed.
    }
    return this.finish(binding).catch(unavailable)
  }

  async execute(context: WriteContext, raw: unknown): Promise<GovernanceExternalWriteOutcome> {
    const parsed = intentSchema.safeParse(raw)
    if (!parsed.success) return { kind: 'invalid-input', reason: 'structure' }
    const intent = parsed.data
    try {
      if (!this.options.accepting()) return unavailable()
      const principal = this.options.principalOf(context)
      const checked = await this.verify(principal)
      if (checked.kind !== 'verified') return checked
      const original = await this.original(principal, intent, context)
      if (original.kind !== 'found') {
        if (original.kind === 'denied') return original
        if (original.kind === 'conflict') return { kind: 'conflict', reason: 'operation' }
        return unavailable()
      }
      const record = original.record
      if (
        record.request.owner !== 'internal.external-write' ||
        !equal(originalIntent(record.request.command), intent)
      )
        return { kind: 'conflict', reason: 'operation' }
      const binding = {
        ref: {
          scope: this.options.scope,
          owner: 'internal.external-write' as const,
          principalRef: standingPrincipalRef(principal),
          operationId: intent.operationId,
        },
        requestDigest: record.requestDigest,
      }
      return this.advance(principal, binding, record, record.request.command)
    } catch {
      return unavailable()
    }
  }
}
