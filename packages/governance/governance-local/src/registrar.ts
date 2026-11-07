import {
  GovernanceScopeSchema,
  GovernanceIdSchema,
  type GovernanceCommands,
  type GovernanceScope,
  type GovernanceDefinitionSource,
} from '@omne-harness/governance-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { Access } from '@omne-harness/legal-identity'
import { GovernanceAdmission } from './admission.ts'
import { SqlOperationCoordinator } from './sql-coordinator.ts'
import { GovernanceStandingCoordinator, type StandingProgress } from './standing-coordinator.ts'
import {
  requestRef,
  type OperationBinding,
  type OperationRecord,
  type Execution,
} from './operation-schema.ts'
import {
  captureMutation,
  registrarExecution,
  reconcileExecution,
  mutationCombinationSchema,
  mutationEnvelope,
  type MutationRequest,
  type MutationCombination,
  type Admitted,
} from './registrar-execution.ts'
import {
  registrationResult,
  releaseResult,
  unknownOperation,
  isTerminal,
  type RegistrarFailure,
} from './registrar-results.ts'
import { digest, equal } from './encoding.ts'
import { persistStageSchema } from './sql-stage-schema.ts'

type Completed = Readonly<{ kind: 'terminal'; binding: OperationBinding; record: OperationRecord }>
type Outcome = Completed | RegistrarFailure
export type RegistrarOptions = Readonly<{
  scope: GovernanceScope
  epoch: string
  transactionDomain: string
  destination: string
  mutation: MutationCombination
  sql: SqlOperationCoordinator
  admission: GovernanceAdmission
  standing: GovernanceStandingCoordinator
  definitions: GovernanceDefinitionSource
}>
const closed = () => ({ kind: 'unavailable' as const, owner: 'governance-provider' })

export class GovernanceRegistrar implements Pick<
  GovernanceCommands<ActingForTenantPrincipal, never>,
  'contribute' | 'withdraw'
> {
  private readonly options: RegistrarOptions
  private stopped = false

  constructor(input: RegistrarOptions) {
    this.options = {
      ...input,
      scope: GovernanceScopeSchema.parse(input.scope),
      epoch: GovernanceIdSchema.parse(input.epoch),
      transactionDomain: GovernanceIdSchema.parse(input.transactionDomain),
      destination: GovernanceIdSchema.parse(input.destination),
      mutation: mutationCombinationSchema.parse(input.mutation),
    }
  }

  stopAccepting() {
    this.stopped = true
  }

  async contribute(
    access: Access<ActingForTenantPrincipal>,
    command: Parameters<GovernanceCommands<ActingForTenantPrincipal, never>['contribute']>[1],
  ) {
    const result = await this.enter(access, { owner: 'contribute', command })
    return result.kind === 'terminal'
      ? registrationResult(this.options.sql, result.binding, result.record)
      : result
  }

  async withdraw(
    access: Access<ActingForTenantPrincipal>,
    command: Parameters<GovernanceCommands<ActingForTenantPrincipal, never>['withdraw']>[1],
  ) {
    const result = await this.enter(access, { owner: 'withdraw', command })
    return result.kind === 'terminal' ? releaseResult(result.binding, result.record) : result
  }

  private async enter(
    access: Access<ActingForTenantPrincipal>,
    raw: MutationRequest,
  ): Promise<Outcome> {
    if (this.stopped) return closed()
    const captured = captureMutation(raw)
    if (captured.kind !== 'captured') return captured
    const request = captured.request
    const scope =
      request.owner === 'withdraw' ? request.command.contribution.scope : request.command.scope
    if (!equal(scope, this.options.scope) || !access) return { kind: 'denied' }
    const context = { principal: access.principal, tenant: access.tenant }
    const admissionRequest =
      request.owner === 'contribute'
        ? { action: request.owner, scope, declaration: request.command.declaration }
        : { action: request.owner, scope }
    const admitted = await this.options.admission.check(context, admissionRequest)
    if (admitted.kind !== 'admitted') return admitted
    const binding = {
      ref: requestRef(admitted.principalRef, request),
      requestDigest: digest(request),
    }
    try {
      return await this.run(request, admitted, binding)
    } catch {
      return unknownOperation(binding)
    }
  }

  private async finish(binding: OperationBinding, record: OperationRecord): Promise<Completed> {
    await this.options.standing.settle(binding).catch(() => undefined)
    return { kind: 'terminal', binding, record }
  }

  private async recognize(
    binding: OperationBinding,
    fallback: RegistrarFailure | Extract<StandingProgress, { kind: 'rejected' }> = unknownOperation(
      binding,
    ),
  ): Promise<Outcome> {
    const current = await this.options.sql.observe(binding)
    if (current.kind === 'conflict') return current
    if (current.kind === 'unavailable') return unknownOperation(binding)
    if (current.kind === 'found' && isTerminal(current.record))
      return this.finish(binding, current.record)
    if (fallback.kind === 'rejected')
      return fallback.reason === 'denied'
        ? { kind: 'denied' }
        : { kind: 'conflict', reason: 'basis' }
    return current.kind === 'absent' ? fallback : unknownOperation(binding)
  }

  private async seal(binding: OperationBinding): Promise<Outcome> {
    await this.options.sql.executeControl(binding, { kind: 'seal', binding })
    return this.recognize(binding)
  }

  private async run(
    request: MutationRequest,
    admitted: Admitted,
    binding: OperationBinding,
  ): Promise<Outcome> {
    const current = await this.options.sql.observe(binding)
    if (current.kind === 'absent')
      return this.stopped ? closed() : this.prepare(request, admitted, binding, null)
    if (current.kind !== 'found')
      return current.kind === 'conflict' ? current : unknownOperation(binding)
    const record = current.record
    if (isTerminal(record)) return this.finish(binding, record)
    if (this.stopped || record.epoch !== this.options.epoch) return this.seal(binding)
    return this.prepare(request, admitted, binding, record)
  }

  private async prepare(
    request: MutationRequest,
    admitted: Admitted,
    binding: OperationBinding,
    record: OperationRecord | null,
  ): Promise<Outcome> {
    const prepared = await registrarExecution(
      this.options.sql,
      binding,
      record,
      request,
      admitted,
      this.options.definitions,
      this.options.mutation,
    )
    if (prepared.kind !== 'prepared') return this.recognize(binding, prepared)
    if (this.stopped) return record === null ? closed() : this.seal(binding)
    return this.acceptPrepared(request, admitted, binding, prepared.execution)
  }

  private async acceptPrepared(
    request: MutationRequest,
    admitted: Admitted,
    binding: OperationBinding,
    candidate: Execution,
  ): Promise<Outcome> {
    const accepted = await this.options.sql.accept({
      principalRef: admitted.principalRef,
      epoch: this.options.epoch,
      transactionDomain: this.options.transactionDomain,
      request,
    })
    if (accepted.kind === 'conflict' || accepted.kind === 'limited') return accepted
    if (accepted.kind !== 'found') return unknownOperation(binding)
    if (isTerminal(accepted.record)) return this.finish(binding, accepted.record)
    if (this.stopped || accepted.record.epoch !== this.options.epoch) return this.seal(binding)
    const execution = await reconcileExecution(
      this.options.sql,
      binding,
      accepted.record,
      candidate,
    )
    if (execution.kind !== 'prepared') return this.recognize(binding, execution)
    return this.perform(binding, admitted, execution.execution)
  }

  private async perform(
    binding: OperationBinding,
    admitted: Admitted,
    execution: Execution,
  ): Promise<Outcome> {
    const held = await this.options.standing.reserve(
      {
        operation: binding,
        destination: this.options.destination,
        required: [...admitted.required],
      },
      admitted.principal,
    )
    if (held.kind === 'rejected') return this.recognize(binding, held)
    if (held.kind !== 'held') return this.recognize(binding)
    if (this.stopped) return this.seal(binding)
    const submitted = await this.options.sql.executeControl(binding, {
      kind: 'submit',
      binding,
      execution,
    })
    if (submitted.kind === 'rolled-back') return this.seal(binding)
    const current = await this.options.sql.observe(binding)
    if (current.kind !== 'found') return unknownOperation(binding)
    if (isTerminal(current.record)) return this.finish(binding, current.record)
    if (!equal(current.record.execution, execution)) return unknownOperation(binding)
    return this.apply(binding, execution)
  }

  private async apply(binding: OperationBinding, execution: Execution): Promise<Outcome> {
    if (this.stopped) return this.seal(binding)
    const saved = await this.options.sql.save(
      persistStageSchema.parse({
        binding,
        stage: 'apply',
        envelope: mutationEnvelope(this.options.transactionDomain, binding, execution),
      }),
    )
    if (saved.kind !== 'stored') return this.recognize(binding)
    if (this.stopped) return this.seal(binding)
    const result = await this.options.sql.send(binding, 'apply')
    return result.kind === 'rolled-back' ? this.seal(binding) : this.recognize(binding)
  }
}
