import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  inputDigestV2,
  type SqlStorage,
  type DomainRef,
  type CommitRequestV2,
  type CommittedV2,
} from '@omne-harness/sql-contract'
import {
  GovernanceIdSchema,
  GovernanceDigestSchema,
  type GovernanceContributionRef,
} from '@omne-harness/governance-contract'
import {
  acceptSchema,
  bindingSchema,
  acceptanceReceiptSchema,
  requestRef,
  type AcceptOperation,
  type OperationBinding,
} from './operation-schema.ts'
import { OPERATION_HANDLER, observationSchema } from './operation-read.ts'
import { stageIdentity } from './sql-stage-binding.ts'
import { STAGE_HANDLER } from './sql-stage-read.ts'
import {
  stageRequestSchema,
  persistStageSchema,
  storedStageSchema,
  type PersistStage,
  type SqlStage,
} from './sql-stage-schema.ts'
import { METADATA_PLANNER, controlRequestSchema, type ControlRequest } from './activation-schema.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import {
  CONTRIBUTION_HANDLER,
  contributionReadSchema,
  contributionReadingSchema,
} from './contribution-read.ts'
import { canonical, equal, json, digest, operationIdentity } from './encoding.ts'
import {
  querySql,
  submitSql,
  recognizeSubmission,
  writerResponse,
  unavailable,
  type SqlSubmission,
} from './sql-submission.ts'

const metadataSchema = z.strictObject({
  combinationVersion: GovernanceIdSchema,
  manifestDigest: GovernanceDigestSchema,
})
const stageReplySchema = z.union([
  storedStageSchema,
  z.strictObject({ kind: z.literal('unplanned') }),
  z.strictObject({ kind: z.literal('absent') }),
  z.strictObject({ kind: z.literal('conflict'), reason: z.literal('operation') }),
])
export type StageControlRequest = Exclude<
  ControlRequest,
  { kind: 'bootstrap' | 'accept' | 'persist-stage' }
>
export type SqlCoordinatorOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  metadata: z.infer<typeof metadataSchema>
}>
export class SqlOperationCoordinator {
  private readonly storage: SqlStorage
  private readonly domain: DomainRef
  private readonly metadata: z.infer<typeof metadataSchema>
  constructor(options: SqlCoordinatorOptions) {
    if (options.domain.scope.kind !== 'tenant')
      throw new Error('Governance requires a tenant SQL domain')
    this.storage = options.storage
    this.domain = structuredClone(options.domain)
    this.metadata = metadataSchema.parse(options.metadata)
  }
  private inDomain(binding: OperationBinding) {
    return (
      this.domain.scope.kind === 'tenant' &&
      binding.ref.scope.tenantRef === this.domain.scope.tenant
    )
  }
  private envelope(
    binding: OperationBinding,
    operation: string,
    raw: ControlRequest,
    metadata = this.metadata,
  ): CommitRequestV2 {
    const request = controlRequestSchema.parse(raw)
    return {
      identity: { ...operationIdentity(this.domain.transactionDomain, binding.ref), operation },
      ...metadata,
      commands: [
        { participant: METADATA_PLANNER, facts: { request: json(request) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
      ],
    }
  }
  async observe(raw: OperationBinding) {
    const binding = bindingSchema.parse(raw)
    if (!this.inDomain(binding)) return unavailable()
    try {
      const result = await this.storage.read({
        domain: this.domain,
        ...OPERATION_HANDLER,
        requestKey: randomUUID(),
        input: json(binding),
      })
      if (result.kind !== 'read') return unavailable()
      const observation = observationSchema.parse(result.output)
      if (!equal(observation, result.output)) return unavailable()
      if (observation.kind !== 'found') return observation
      const record = observation.record
      if (
        !equal(requestRef(binding.ref.principalRef, record.request), binding.ref) ||
        record.requestDigest !== binding.requestDigest ||
        digest(record.request) !== binding.requestDigest ||
        !equal(record.sqlIdentity, operationIdentity(this.domain.transactionDomain, binding.ref))
      )
        return unavailable()
      return observation
    } catch {
      return unavailable()
    }
  }
  async contribution(contribution: GovernanceContributionRef, principalRef: string) {
    const input = contributionReadSchema.parse({ contribution, principalRef })
    if (
      this.domain.scope.kind !== 'tenant' ||
      input.contribution.scope.tenantRef !== this.domain.scope.tenant
    )
      return unavailable()
    try {
      const result = await this.storage.read({
        domain: this.domain,
        ...CONTRIBUTION_HANDLER,
        requestKey: randomUUID(),
        input: json(input),
      })
      if (result.kind !== 'read') return unavailable()
      const reading = contributionReadingSchema.parse(result.output)
      if (!equal(reading, result.output)) return unavailable()
      if (
        reading.kind === 'found' &&
        !equal({ contribution: reading.contribution, principalRef: reading.principalRef }, input)
      )
        return unavailable()
      return reading
    } catch {
      return unavailable()
    }
  }
  async readStage(binding: OperationBinding, stage: SqlStage) {
    const input = stageRequestSchema.parse({ binding, stage })
    if (!this.inDomain(input.binding)) return unavailable()
    try {
      const result = await this.storage.read({
        domain: this.domain,
        ...STAGE_HANDLER,
        requestKey: randomUUID(),
        input: json(input),
      })
      if (result.kind !== 'read') return unavailable()
      const saved = stageReplySchema.parse(result.output)
      if (!equal(saved, result.output)) return unavailable()
      if (
        saved.kind === 'stored' &&
        (saved.stage !== input.stage ||
          !equal(
            saved.envelope.identity,
            stageIdentity(this.domain.transactionDomain, input.binding.ref, input.stage),
          ) ||
          saved.inputDigest !== inputDigestV2(saved.envelope))
      )
        return unavailable()
      return saved
    } catch {
      return unavailable()
    }
  }
  private async accepted(binding: OperationBinding, outcome: SqlSubmission) {
    if (outcome.kind !== 'applied') return outcome
    const reply = acceptanceReceiptSchema.safeParse(outcome.response)
    if (!reply.success || !equal(reply.data, outcome.response)) return unavailable()
    if (digest(reply.data.input.request) !== binding.requestDigest)
      return { kind: 'conflict' as const, reason: 'operation' as const }
    if (reply.data.outcome.kind !== 'found') return reply.data.outcome
    const observed = await this.observe(binding)
    return observed.kind === 'absent' ? unavailable() : observed
  }
  private originalAccept(binding: OperationBinding, receipt: CommittedV2) {
    const response = writerResponse(receipt)
    if (response.kind !== 'response') return undefined
    const reply = acceptanceReceiptSchema.safeParse(response.value)
    if (!reply.success || !equal(reply.data, response.value)) return undefined
    const input = reply.data.input
    if (
      !equal(requestRef(input.principalRef, input.request), binding.ref) ||
      input.transactionDomain !== this.domain.transactionDomain
    )
      return undefined
    return this.envelope(
      binding,
      'governance.meta.accept',
      { kind: 'accept', input },
      {
        combinationVersion: receipt.combinationVersion,
        manifestDigest: receipt.manifestDigest,
      },
    )
  }
  async accept(raw: AcceptOperation) {
    if (Buffer.byteLength(canonical(raw)) > 1024 * 1024)
      return { kind: 'limited' as const, resource: 'command-bytes' }
    const input = acceptSchema.parse(raw)
    const binding = {
      ref: requestRef(input.principalRef, input.request),
      requestDigest: digest(input.request),
    }
    if (!this.inDomain(binding) || input.transactionDomain !== this.domain.transactionDomain)
      return unavailable()
    const envelope = this.envelope(binding, 'governance.meta.accept', { kind: 'accept', input })
    const observed = await this.observe(binding)
    if (observed.kind !== 'absent') return observed
    const prior = await querySql(this.storage, envelope.identity)
    if (!equal(prior.identity, envelope.identity)) return unavailable()
    if (prior.kind === 'not_committed')
      return this.accepted(binding, await submitSql(this.storage, envelope))
    if (prior.kind === 'committed') {
      const original = this.originalAccept(binding, prior)
      return original ? this.accepted(binding, recognizeSubmission(original, prior)) : unavailable()
    }
    return recognizeSubmission(envelope, prior)
  }
  async save(raw: PersistStage) {
    if (Buffer.byteLength(canonical(raw.envelope)) > 4 * 1024 * 1024)
      return { kind: 'limited' as const, resource: 'sql-envelope-bytes' }
    const input = persistStageSchema.parse(raw)
    if (!equal(raw, input)) return unavailable()
    if (!this.inDomain(input.binding)) return unavailable()
    const envelope = this.envelope(input.binding, 'governance.custody.' + input.stage, {
      kind: 'persist-stage',
      input,
    })
    const previous = await this.readStage(input.binding, input.stage)
    if (previous.kind === 'stored')
      return equal(previous.envelope, input.envelope)
        ? previous
        : { kind: 'conflict' as const, reason: 'operation' as const }
    if (previous.kind !== 'unplanned') return previous
    const outcome = await submitSql(this.storage, envelope)
    if (outcome.kind !== 'applied') return outcome
    const saved = await this.readStage(input.binding, input.stage)
    return saved.kind === 'stored' && !equal(saved.envelope, input.envelope)
      ? { kind: 'conflict' as const, reason: 'operation' as const }
      : saved
  }
  async executeControl(rawBinding: OperationBinding, raw: StageControlRequest) {
    const binding = bindingSchema.parse(rawBinding)
    const request = controlRequestSchema.parse(raw)
    if (
      request.kind === 'bootstrap' ||
      request.kind === 'accept' ||
      request.kind === 'persist-stage'
    )
      return unavailable()
    const previous = await this.readStage(binding, request.kind)
    if (previous.kind !== 'stored' && previous.kind !== 'unplanned') return previous
    const metadata =
      previous.kind === 'stored'
        ? {
            combinationVersion: previous.envelope.combinationVersion,
            manifestDigest: previous.envelope.manifestDigest,
          }
        : this.metadata
    const identity = stageIdentity(this.domain.transactionDomain, binding.ref, request.kind)
    const envelope = this.envelope(binding, identity.operation, request, metadata)
    const saved = await this.save(
      persistStageSchema.parse({ binding, stage: request.kind, envelope }),
    )
    return saved.kind === 'stored' ? submitSql(this.storage, saved.envelope) : saved
  }
  async send(binding: OperationBinding, stage: SqlStage) {
    const saved = await this.readStage(binding, stage)
    if (saved.kind !== 'stored') return saved
    return submitSql(this.storage, saved.envelope)
  }
}
