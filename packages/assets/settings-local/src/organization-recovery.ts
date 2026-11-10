import {
  isStandingReservation,
  type StandingReservations,
  type StandingRequest,
} from '@omne-harness/identity'
import type { SettingsFailure, SettingsPreparedOperationResult } from '@omne-harness/settings'
import {
  PreparationSql,
  PreparationRolledBack,
  type PreparationSqlOptions,
} from './preparation-sql.ts'
import {
  organizationCurrentConfigurationSchema,
  type OrganizationCurrentConfiguration,
} from './organization-current-schema.ts'
import {
  organizationRecoveryCommands,
  organizationReadyRefused,
} from './organization-recovery-current.ts'
import type { createSettingsSourceReservations } from './source-service.ts'
import { sourcePageSchema, type SourcePage, type SourceUpdate } from './source-retention-schema.ts'
import { sourceKey } from './source-retention-records.ts'
import { sourcePendingPageSchema } from './source-service-schema.ts'
import { standingReadSchema } from './preparation-custody.ts'
import {
  attemptBinding,
  operationObservation,
  type ObservedIntent,
} from './preparation-observation.ts'
import { intentAttemptIdentity, intentCommandDigest } from './intent-records.ts'
import type { SettingsAttemptBinding } from './attempt-binding.ts'
import type { IntentIdentity } from './intent-schema.ts'
import { preparationDestination } from './preparation-destination.ts'
import { equal } from './encoding.ts'
export type OrganizationRecoveryOptions = PreparationSqlOptions & {
  configuration: OrganizationCurrentConfiguration
  standing: Pick<StandingReservations, 'observe' | 'settle'>
  sources: Pick<
    ReturnType<typeof createSettingsSourceReservations>['control'],
    'pendingUpdates' | 'recoverSource'
  >
}
const failure = (reason: SettingsFailure['reason']): SettingsFailure => ({
  kind: 'rejected',
  reason,
})
class OrganizationRecovery {
  readonly sql: PreparationSql
  readonly configuration: OrganizationCurrentConfiguration
  readonly options: OrganizationRecoveryOptions
  constructor(options: OrganizationRecoveryOptions) {
    this.options = options
    this.sql = new PreparationSql(options)
    this.configuration = organizationCurrentConfigurationSchema.parse(options.configuration)
    if (
      options.domain.scope.kind !== 'system' ||
      options.domain.transactionDomain !== 'system.settings' ||
      this.configuration.destination !== options.destination
    )
      throw new TypeError('Invalid organization recovery assembly')
  }
  async result(identity: IntentIdentity): Promise<SettingsPreparedOperationResult> {
    return operationObservation(await this.sql.root(identity))
  }
  async seal(binding: SettingsAttemptBinding) {
    await this.sql.write({ kind: 'seal', binding })
  }
  async standing(binding: SettingsAttemptBinding): Promise<StandingRequest | undefined> {
    const input = { identity: binding.identity, attemptId: binding.attemptId }
    const record = standingReadSchema.parse(await this.sql.read({ kind: 'standing', input }))
    if (record.kind === 'not_found' || record.kind === 'planned') return undefined
    const observed = await this.options.standing.observe(record.request)
    if (observed.kind !== 'held' && observed.kind !== 'terminal') return undefined
    if (
      !isStandingReservation(observed.reservation) ||
      !equal(record.request, {
        binding: observed.reservation.binding,
        required: observed.reservation.required,
      })
    )
      throw new Error('Original standing observation mismatch')
    const reservation = { ...observed.reservation, required: [...observed.reservation.required] }
    await this.sql.write({
      kind: 'checkpoint',
      binding,
      command:
        observed.kind === 'held'
          ? { kind: 'standing-held', input: { ...input, reservation } }
          : {
              kind: 'standing-settled',
              input: { ...input, reservation, outcome: observed.outcome },
            },
    })
    return observed.kind === 'held' ? record.request : undefined
  }
  async finish(binding: SettingsAttemptBinding) {
    const result = await this.result(binding.identity)
    if (result.kind !== 'committed' && result.kind !== 'aborted') return result
    try {
      const input = { identity: binding.identity, attemptId: binding.attemptId }
      const record = standingReadSchema.parse(await this.sql.read({ kind: 'standing', input }))
      if (record.kind !== 'requested' && record.kind !== 'held') return result
      const settled = await this.options.standing.settle(record.request)
      if (settled.kind !== 'terminal') return result
      if (
        !isStandingReservation(settled.reservation) ||
        !equal(record.request, {
          binding: settled.reservation.binding,
          required: settled.reservation.required,
        })
      )
        throw new Error('Original standing settlement mismatch')
      await this.sql.write({
        kind: 'checkpoint',
        binding,
        command: {
          kind: 'standing-settled',
          input: {
            ...input,
            reservation: { ...settled.reservation, required: [...settled.reservation.required] },
            outcome: settled.outcome,
          },
        },
      })
    } catch {
      // Business terminal is durable; the original hold remains for Identity recovery.
    }
    return result
  }
  async ready(root: ObservedIntent, request: StandingRequest, binding: SettingsAttemptBinding) {
    if (root.attempt?.status.state !== 'preparing') return
    await this.sql.write({
      kind: 'checkpoint',
      binding,
      command: {
        kind: 'sources-plan',
        input: {
          identity: root.identity,
          attemptId: binding.attemptId,
          route: this.configuration.sourceRoute,
          sources: [],
        },
      },
    })
    await this.sql.write(
      { kind: 'ready', binding },
      organizationRecoveryCommands(this.configuration, request, 'ready', binding),
    )
  }
  async commit(binding: SettingsAttemptBinding, request: StandingRequest) {
    const current = await this.sql.root(binding.identity)
    if (current.kind !== 'found' || current.status.state !== 'open') return
    if (
      current.attempt?.attemptId !== binding.attemptId ||
      (current.attempt.status.state !== 'prepared' && current.attempt.status.state !== 'submitted')
    ) {
      await this.seal(binding)
      return
    }
    await this.sql.write(
      { kind: 'commit', binding },
      organizationRecoveryCommands(this.configuration, request, 'commit', binding),
    )
  }
  async advance(root: ObservedIntent, request: StandingRequest, binding: SettingsAttemptBinding) {
    try {
      await this.ready(root, request, binding)
    } catch (error) {
      if (
        !(error instanceof PreparationRolledBack) ||
        !organizationReadyRefused(error.receipt, this.configuration)
      )
        throw error
      await this.seal(binding)
      return this.finish(binding)
    }
    try {
      await this.commit(binding, request)
    } catch (error) {
      if (!(error instanceof PreparationRolledBack)) throw error
      await this.seal(binding)
    }
    return this.finish(binding)
  }
  async canSubmit(root: ObservedIntent, binding: SettingsAttemptBinding) {
    if (root.attempt === null) return false
    if (!equal(root.attempt.sqlIdentity, intentAttemptIdentity(root.identity, binding.attemptId)))
      throw new Error('Original SQL identity mismatch')
    const queried = await this.options.storage.query(root.attempt.sqlIdentity)
    if (!equal(queried.identity, root.attempt.sqlIdentity))
      throw new Error('SQL observation identity mismatch')
    if (queried.kind === 'rolled_back') await this.seal(binding)
    return queried.kind === 'not_committed'
  }
  async drain(update: SourceUpdate) {
    let after: string | null = null
    // A pending source gate admits no new holds; its existing set is bounded at 128.
    for (let page = 0; page < 128; page++) {
      if (await this.sql.sourceUpdateReady(update)) return true
      const drained = await this.options.sources.recoverSource(update.source, { after, limit: 100 })
      if (drained.kind !== 'recovered' || drained.items.length === 0) return false
      if (drained.after === null || (after !== null && drained.after <= after))
        throw new Error('Source recovery cursor did not advance')
      after = drained.after
    }
    return this.sql.sourceUpdateReady(update)
  }
  async recover(update: SourceUpdate): Promise<SettingsPreparedOperationResult> {
    const root = await this.sql.root(update.identity)
    if (root.kind !== 'found') return root
    const original = {
      domain: root.identity.domain,
      source: update.source,
      purpose: root.purpose,
      commandDigest: intentCommandDigest(root.intent),
    }
    if (
      !equal(original, {
        domain: this.options.domain,
        source: { domain: root.identity.domain, target: root.identity.operation.target },
        purpose: { kind: 'source-update', sourceKey: sourceKey(update.source) },
        commandDigest: update.commandDigest,
      })
    )
      throw new Error('Original source update mismatch')
    if (root.status.state !== 'open' || root.attempt === null) return operationObservation(root)
    if (!(await this.drain(update))) return this.result(root.identity)
    const binding = attemptBinding(root, root.attempt.attemptId)
    if (!(await this.canSubmit(root, binding))) return this.finish(binding)
    const request = await this.standing(binding)
    if (!request) return this.result(root.identity)
    return this.advance(root, request, binding)
  }
}
export function createOrganizationSettingsRecovery(options: OrganizationRecoveryOptions) {
  const engine = new OrganizationRecovery(options)
  const destination = preparationDestination(engine.sql)
  const active = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  function run<T>(task: () => Promise<T>, unavailable: T): Promise<T> {
    const pending = task().catch(() => unavailable)
    active.add(pending)
    void pending.then(() => active.delete(pending))
    return pending
  }
  return {
    async recover(raw: SourcePage) {
      if (closing) return failure('closing')
      const page = sourcePageSchema.safeParse(raw)
      if (!page.success) return failure('invalid_input')
      return run(async () => {
        const response = await options.sources.pendingUpdates(page.data)
        if (response.kind === 'rejected') return response
        const found = sourcePendingPageSchema.parse({
          items: response.items,
          after: response.after,
        })
        const items: { identity: IntentIdentity; result: SettingsPreparedOperationResult }[] = []
        for (const member of found.items) {
          if (member.pending === null || !equal(member.source, member.pending.source))
            throw new Error('Source recovery page mismatch')
          const update = member.pending
          const result = await engine.recover(update).catch(() => ({
            kind: 'unknown' as const,
            operation: update.identity.operation,
          }))
          items.push({ identity: update.identity, result })
        }
        return { kind: 'recovered' as const, items, after: found.after }
      }, failure('unavailable'))
    },
    destination: {
      seal: (reservation => {
        const unavailable = {
          kind: 'unavailable' as const,
          diagnostic: 'organization-recovery-unavailable',
        }
        return closing
          ? Promise.resolve(unavailable)
          : run(() => destination.seal(reservation), unavailable)
      }) satisfies typeof destination.seal,
    },
    close() {
      return (closing ??= Promise.allSettled(active).then(() => undefined))
    },
  }
}
