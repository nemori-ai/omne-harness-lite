import { z } from 'zod'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import {
  GovernanceScopeSchema,
  GovernanceIdSchema,
  type GovernanceScope,
} from '@omne-harness/governance-contract'
import { closeScopeSchema, SCOPE_HANDLER } from './scope.ts'
import { METADATA_PLANNER, type ControlRequest } from './activation-schema.ts'
import { GOVERNANCE_OWNER } from './migration.ts'
import {
  bootstrapSchema,
  bindingSchema,
  type Bootstrap,
  type OperationBinding,
} from './operation-schema.ts'
import type { GovernanceSourceCoordinator } from './source-coordinator.ts'
import type { SourceCustody } from './source-custody.ts'
import { digest, equal, json } from './encoding.ts'
import { submitSql } from './sql-submission.ts'
import { mutationCombinationSchema, type MutationCombination } from './registrar-execution.ts'
import { RECOVERY_HANDLER, recoveryPageSchema, recoveryPageRequestSchema } from './recovery-read.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import type { GovernanceStandingCoordinator } from './standing-coordinator.ts'
import { isTerminal } from './registrar-results.ts'

export type ScopeLifecycleOptions = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  metadata: MutationCombination
  scope: GovernanceScope
  epoch: string
  sql: SqlOperationCoordinator
  standing: GovernanceStandingCoordinator
  sources?: Pick<GovernanceSourceCoordinator<unknown>, 'settle'>
}>
const unavailable = () => ({ kind: 'unavailable' as const, owner: 'governance-lifecycle' })

export class GovernanceScopeLifecycle {
  private readonly options: ScopeLifecycleOptions
  constructor(input: ScopeLifecycleOptions) {
    const scope = GovernanceScopeSchema.parse(input.scope)
    if (input.domain.scope.kind !== 'tenant' || input.domain.scope.tenant !== scope.tenantRef)
      throw new TypeError('Governance lifecycle requires its tenant domain')
    this.options = {
      ...input,
      scope,
      epoch: GovernanceIdSchema.parse(input.epoch),
      domain: structuredClone(input.domain),
      metadata: mutationCombinationSchema.parse(input.metadata),
    }
  }
  private command(operation: string, request: ControlRequest) {
    const { domain, metadata, scope, epoch } = this.options
    return submitSql(this.options.storage, {
      identity: {
        ...domain,
        operation,
        protocolVersion: '2',
        operationKey: digest({ scope, epoch }),
      },
      ...metadata,
      commands: [
        { participant: METADATA_PLANNER, facts: { request: json(request) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
      ],
    })
  }
  async open(previousEpoch: Bootstrap['previousEpoch']) {
    const input = bootstrapSchema.parse({
      scope: this.options.scope,
      epoch: this.options.epoch,
      previousEpoch,
    })
    const result = await this.command('governance.scope-open', { kind: 'bootstrap', input })
    if (result.kind !== 'applied') return unavailable()
    const parsed = z
      .union([
        z.strictObject({
          kind: z.literal('opened'),
          scope: GovernanceScopeSchema,
          epoch: GovernanceIdSchema,
        }),
        z.object({
          kind: z.literal('observed'),
          epoch: GovernanceIdSchema,
          state: z.enum(['open', 'closed', 'isolated']),
        }),
      ])
      .safeParse(result.response)
    if (!parsed.success || parsed.data.epoch !== input.epoch) return unavailable()
    if (parsed.data.kind === 'opened' && !equal(parsed.data.scope, input.scope))
      return unavailable()
    if (parsed.data.kind === 'observed' && parsed.data.state !== 'open') return unavailable()
    return this.currentlyOpen()
  }
  private async currentScope() {
    const observed = await this.options.storage.read({
      domain: this.options.domain,
      ...SCOPE_HANDLER,
      requestKey: digest({ scope: this.options.scope, epoch: this.options.epoch }),
      input: json(this.options.scope),
    })
    if (observed.kind !== 'read') return unavailable()
    const state = z
      .object({
        scope: GovernanceScopeSchema,
        current: z
          .object({ epoch: GovernanceIdSchema, state: z.enum(['open', 'closed', 'isolated']) })
          .nullable(),
      })
      .safeParse(observed.output)
    return state.success && equal(state.data.scope, this.options.scope)
      ? { kind: 'scope' as const, current: state.data.current }
      : unavailable()
  }
  async observeEpoch() {
    const found = await this.currentScope()
    return found.kind === 'scope'
      ? { kind: 'epoch' as const, epoch: found.current?.epoch ?? null }
      : found
  }
  private async currentlyOpen() {
    const found = await this.currentScope()
    return found.kind === 'scope' &&
      found.current?.state === 'open' &&
      found.current.epoch === this.options.epoch
      ? { kind: 'opened' as const }
      : unavailable()
  }
  async isolate() {
    const input = { scope: this.options.scope, epoch: this.options.epoch }
    const result = await this.command('governance.scope-close', { kind: 'close-scope', input })
    if (result.kind !== 'applied') return unavailable()
    const parsed = closeScopeSchema
      .extend({ kind: z.enum(['closed', 'obsolete']) })
      .safeParse(result.response)
    return parsed.success && equal({ scope: parsed.data.scope, epoch: parsed.data.epoch }, input)
      ? { kind: 'isolated' as const }
      : unavailable()
  }
  recoverPage(after: z.infer<typeof recoveryPageRequestSchema>['after'] = null) {
    return this.recover('own', after)
  }
  recoverHistoricalPage(after: z.infer<typeof recoveryPageRequestSchema>['after'] = null) {
    return this.recover('historical', after)
  }
  private async recover(
    mode: 'own' | 'historical',
    after: z.infer<typeof recoveryPageRequestSchema>['after'],
  ) {
    const { scope, storage, domain } = this.options
    const input = recoveryPageRequestSchema.parse({ scope, after, limit: 64 })
    const response = await storage.read({
      domain,
      ...RECOVERY_HANDLER,
      requestKey: digest(input),
      input: json(input),
    })
    if (response.kind !== 'read') return unavailable()
    const parsed = recoveryPageSchema.safeParse(response.output)
    if (!parsed.success || !equal(parsed.data, response.output)) return unavailable()
    if (mode === 'historical' && parsed.data.currentEpoch !== this.options.epoch)
      return unavailable()
    let unsettled = 0
    for (const item of parsed.data.items) {
      const own = item.acceptedEpoch === this.options.epoch
      if (own !== (mode === 'own')) continue
      const outcome = await this.recoverOperation(item)
      if (outcome === 'unavailable') return unavailable()
      if (outcome === 'pending') unsettled++
    }
    return { kind: 'page' as const, next: parsed.data.next, unsettled }
  }
  private async recoverOperation(item: z.infer<typeof recoveryPageSchema>['items'][number]) {
    const { scope, sql } = this.options
    if (!equal(item.key.scope, scope)) return 'unavailable'
    const parsed = bindingSchema.safeParse({
      ref: item.key,
      requestDigest: item.requestDigest,
    })
    if (!parsed.success) return 'unavailable'
    const binding = parsed.data
    const current = await sql.observe(binding)
    if (current.kind !== 'found') return 'unavailable'
    if (current.record.epoch !== item.acceptedEpoch) return 'unavailable'
    await sql.executeControl(binding, { kind: 'seal', binding })
    const terminal = await sql.observe(binding)
    if (terminal.kind !== 'found' || !isTerminal(terminal.record)) return 'pending'
    return this.settle(binding, terminal.source)
  }
  private async settle(binding: OperationBinding, source: SourceCustody) {
    const settled = await this.options.standing.settle(binding)
    const released = this.options.sources ? await this.options.sources.settle(binding) : source
    const standingDone = settled.kind === 'settled' || settled.kind === 'unplanned'
    const sourceDone = released.kind === 'settled' || released.kind === 'not-required'
    return standingDone && sourceDone ? 'settled' : 'pending'
  }
}
