import type { ContentBlock } from '@omne-harness/content-block'
import {
  acquisitionRef,
  type AcquireInput,
  type EnvironmentLease,
  type EnvironmentRequirement,
  type ExecutionEnvironment,
  type FacilityGuard,
  type OriginalAcquisition,
  type OriginRef,
  type Placement,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolAccessGuard, type ToolLedgerStore } from '@omne-harness/tool'
import type { Adoption, Reply } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  PreparationProgress,
  ReleaseProgress,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import {
  createAuthorEnvironment,
  type EnvironmentFacts,
  type FileObjectNaming,
  type ToolEnvironmentValue,
} from './author-environment.ts'
import { fixedPreparationInput, fixedReleaseInput } from './environment-input.ts'
import {
  createEnvironmentStateStore,
  environmentFailure,
  preparationKey,
  type EnvironmentAddress,
  type EnvironmentState,
  type EnvironmentStorageOptions,
  type EnvironmentOriginal,
} from './environment-state.ts'

export type EnvPreparationInput<P> = Parameters<ToolEnvironment<P, unknown>['prepare']>[0]
export type EnvironmentRetention = Readonly<{
  scope: ScopeRef
  ledger: Pick<ResourceLedger, 'closed' | 'plan' | 'permit' | 'stopped'>
}>
export type EnvironmentAcquisition<P> = AcquireInput<P> &
  Readonly<{ retention?: EnvironmentRetention }>
export type EnvironmentPlan<P> = Readonly<{
  acquire: EnvironmentAcquisition<P>
  facts: EnvironmentFacts
}>
export type EnvironmentPlanResolver<P> = Readonly<{
  resolve(input: EnvPreparationInput<P>): Reply<EnvironmentPlan<P>>
}>
export type OriginalCleanup<P> = Readonly<{
  settle(input: CallAccess<P> & Readonly<{ original: OriginalAcquisition }>): Reply<ReleaseProgress>
}>
export type LocalEnvironmentPlanInput<P> = Readonly<{
  execution: ExecutionEnvironment<P>
  access: ToolAccessGuard<P>
  requirement(input: EnvPreparationInput<P>): Reply<EnvironmentRequirement>
  binding(input: EnvPreparationInput<P>): Reply<
    Readonly<{
      origin: OriginRef
      scope: AcquireInput<P>['scope']
      retention?: EnvironmentRetention
    }>
  >
  guard: FacilityGuard<P>
  ledger(input: EnvPreparationInput<P>): Promise<ResourceLedger>
  facts(placement: Placement): Reply<EnvironmentFacts>
}>

export function createLocalEnvironmentPlanResolver<P>(
  input: LocalEnvironmentPlanInput<P>,
): EnvironmentPlanResolver<P> {
  const ledgers = new Map<string, Promise<ResourceLedger>>()
  return Object.freeze({
    async resolve(request: EnvPreparationInput<P>): Reply<EnvironmentPlan<P>> {
      const access = await input.access.qualify({ ...request, action: 'write' })
      if (access.kind === 'denied') return fail({ kind: 'denied', action: 'environment' })
      if (access.kind !== 'allowed')
        return environmentFailure('current tool qualification unavailable')
      const binding = await input.binding(request)
      if ('failure' in binding) return binding
      if (
        canonicalDigest(binding.ok.scope) !==
        canonicalDigest(request.preparation.request.requesterScope)
      )
        return fail({ kind: 'denied', action: 'environment-scope' })
      const required = await input.requirement(request)
      if ('failure' in required) return required
      const placement = await input.execution.resolvePlacement(
        { principal: request.principal, tenant: request.tenant },
        { scope: binding.ok.scope, requirement: required.ok },
      )
      if (placement.kind !== 'placement') return environmentFailure(`placement ${placement.kind}`)
      if (canonicalDigest(placement.requirement) !== canonicalDigest(required.ok))
        return environmentFailure('placement requirement mismatch')
      const facts = await input.facts(placement)
      if ('failure' in facts) return facts
      const key = JSON.stringify([
        request.tenant.organization.text,
        request.tenant.account.text,
        request.call,
        request.preparation.operation,
      ])
      let ledger = ledgers.get(key)
      if (!ledger) {
        ledger = input.ledger(request)
        ledgers.set(key, ledger)
      }
      return succeed({
        acquire: {
          acquisition: acquisitionRef(key),
          origin: binding.ok.origin,
          scope: request.preparation.request.requesterScope,
          placement,
          ledger: await ledger,
          guard: input.guard,
          ...(binding.ok.retention ? { retention: binding.ok.retention } : {}),
        },
        facts: facts.ok,
      })
    },
  })
}

export type LocalExecutionEnvironmentInput<P> = Readonly<{
  adoption: Adoption
  execution: ExecutionEnvironment<P>
  store: ToolLedgerStore<ContentBlock>
  plans: EnvironmentPlanResolver<P>
  naming: FileObjectNaming<P>
  cleanup: OriginalCleanup<P>
  storage?: Omit<EnvironmentStorageOptions, 'store'>
}>
type Live<P> = {
  readonly plan: EnvironmentPlan<P>
  lease: EnvironmentLease | null
  adopting: boolean
  invalidated: boolean
  value: ToolEnvironmentValue | null
  principal: P | null
}

export function createLocalExecutionEnvironment<P>(
  input: LocalExecutionEnvironmentInput<P>,
): ToolEnvironment<P, ToolEnvironmentValue> {
  const state = createEnvironmentStateStore({ store: input.store, ...input.storage })
  const live = new Map<string, Live<P>>()
  const preparing = new Map<
    string,
    Readonly<{ digest: string; result: Reply<PreparationProgress<ToolEnvironmentValue>> }>
  >()
  const key = (address: EnvironmentAddress) =>
    JSON.stringify([
      address.tenant.organization.text,
      address.tenant.account.text,
      preparationKey(address),
    ])
  const unknown = (diagnostic: string) => succeed({ kind: 'unknown' as const, diagnostic })
  const accessOf = (request: CallAccess<P>) => ({
    principal: request.principal,
    tenant: request.tenant,
  })
  const digest = (request: EnvPreparationInput<P>) => canonicalDigest(request.preparation)
  const original = (
    request: EnvPreparationInput<P>,
    plan: EnvironmentPlan<P>,
  ): EnvironmentOriginal => ({
    tenant: request.tenant,
    acquisition: plan.acquire.acquisition,
    origin: plan.acquire.origin,
    scope: plan.acquire.scope,
    placement: plan.acquire.placement,
    ...(plan.acquire.retention ? { retentionScope: plan.acquire.retention.scope } : {}),
  })

  function prepared(request: EnvPreparationInput<P>, record: EnvironmentState, current: Live<P>) {
    if (
      !current.lease ||
      current.invalidated ||
      current.plan.acquire.ledger.closed.aborted ||
      record.allocation.kind !== 'allocated'
    )
      return environmentFailure('original live environment unavailable')
    if (!current.value || !Object.is(current.principal, request.principal)) {
      current.value = createAuthorEnvironment({
        access: request,
        origin: current.plan.acquire.origin,
        lease: current.lease,
        naming: input.naming,
        facts: current.plan.facts,
      })
      current.principal = request.principal
    }
    return succeed({
      kind: 'prepared' as const,
      environment: {
        preparation: record.preparation,
        evidence: record.evidence,
        value: current.value,
      },
    })
  }

  async function inspect(
    request: EnvPreparationInput<P>,
    record: EnvironmentState,
  ): Reply<PreparationProgress<ToolEnvironmentValue>> {
    if (record.closed) return environmentFailure('original acquisition is closed')
    const answer = await input.execution.inspectAcquisition(accessOf(request), {
      kind: 'original',
      original: record.original,
    })
    if (answer.kind !== 'original') return unknown(`original acquisition query ${answer.kind}`)
    if (canonicalDigest(answer.original) !== canonicalDigest(record.original))
      return environmentFailure('original acquisition query binding mismatch')
    if (record.allocation.kind === 'rejected')
      return succeed({
        kind: 'rejected',
        reason: record.allocation.reason,
        evidence: record.evidence,
      })
    if (record.allocation.kind === 'not-allocated' || record.allocation.kind === 'settled')
      return unknown(`original acquisition terminal: ${record.allocation.kind}`)
    const current = live.get(key(record.preparation))
    const address = record.preparation
    const changed = await state.update(address, (current, receipt) => {
      if (!current) return environmentFailure('original acquisition disappeared')
      if (current.closed) return fail({ kind: 'not-settled' })
      if (
        current.allocation.kind === 'rejected' ||
        current.allocation.kind === 'not-allocated' ||
        current.allocation.kind === 'settled'
      )
        return succeed(current)
      if (answer.status === 'allocated')
        return succeed({
          ...current,
          allocation: { kind: 'allocated' },
          evidence:
            current.allocation.kind === 'allocated'
              ? current.evidence
              : receipt({ original: current.original, allocated: true }),
        })
      if (answer.status === 'notAllocated' || answer.status === 'settled')
        return succeed({
          ...current,
          allocation: { kind: answer.status === 'notAllocated' ? 'not-allocated' : 'settled' },
          evidence: receipt({ original: current.original, terminal: answer.status }),
        })
      if (answer.status === 'allocationFailed')
        return succeed({
          ...current,
          allocation: { kind: 'rejected', reason: answer.reason },
          evidence: receipt({
            original: current.original,
            failure: answer.reason,
            cleanup: answer.cleanup,
          }),
        })
      return succeed(current)
    })
    if ('failure' in changed) return changed
    if (changed.ok.allocation.kind === 'rejected')
      return succeed({
        kind: 'rejected',
        reason: changed.ok.allocation.reason,
        evidence: changed.ok.evidence,
      })
    if (changed.ok.allocation.kind === 'not-allocated' || changed.ok.allocation.kind === 'settled')
      return unknown(`original acquisition terminal: ${changed.ok.allocation.kind}`)
    if (answer.status === 'allocated') {
      if (!current || current.invalidated || current.plan.acquire.ledger.closed.aborted)
        return unknown('original live registration unavailable')
      if (!current.adopting) return prepared(request, changed.ok, current)
      return succeed({
        kind: 'allocated',
        preparation: changed.ok.preparation,
        evidence: changed.ok.evidence,
      })
    }
    if (answer.status === 'conflict')
      return fail({ kind: 'conflict', operation: address.operation })
    return succeed({ kind: 'pending', diagnostic: `original acquisition ${answer.status}` })
  }

  async function acquire(
    request: EnvPreparationInput<P>,
    current: Live<P>,
  ): Reply<PreparationProgress<ToolEnvironmentValue>> {
    if (current.invalidated || current.plan.acquire.ledger.closed.aborted)
      return environmentFailure('original acquisition is no longer live')
    const result = await input.execution.acquire(accessOf(request), current.plan.acquire)
    if (result.kind === 'acquired') {
      current.lease = result.lease
      void result.lease.invalidated.then(() => {
        current.invalidated = true
      })
    }
    const updated = await state.update(request.preparation, (record, receipt) => {
      if (!record) return environmentFailure('original acquisition disappeared')
      if (record.closed) return succeed(record)
      if (
        record.allocation.kind === 'rejected' ||
        record.allocation.kind === 'not-allocated' ||
        record.allocation.kind === 'settled'
      )
        return succeed(record)
      if (result.kind === 'acquired')
        return succeed({
          ...record,
          allocation: { kind: 'allocated' },
          evidence: receipt({ original: record.original, adoption: result.adoption }),
        })
      if (result.kind === 'rejected' || result.kind === 'allocationFailed')
        return succeed({
          ...record,
          allocation: { kind: 'rejected', reason: result.reason },
          evidence: receipt({ original: record.original, rejection: result.reason }),
        })
      return succeed({ ...record, allocation: { kind: 'unknown' } })
    })
    if ('failure' in updated) return updated
    if (
      updated.ok.closed ||
      current.invalidated ||
      current.plan.acquire.ledger.closed.aborted ||
      (result.kind === 'acquired' && updated.ok.allocation.kind !== 'allocated')
    ) {
      if (current.lease) await current.lease.release()
      return environmentFailure('original acquisition closed during acquire')
    }
    if (result.kind === 'acquired') {
      current.adopting = false
      return prepared(request, updated.ok, current)
    }
    if (updated.ok.allocation.kind === 'rejected')
      return succeed({
        kind: 'rejected',
        reason: updated.ok.allocation.reason,
        evidence: updated.ok.evidence,
      })
    return succeed({
      kind: result.kind === 'pending' ? 'pending' : 'unknown',
      diagnostic: `execution acquisition ${result.kind}`,
    })
  }

  async function prepare(
    request: EnvPreparationInput<P>,
  ): Reply<PreparationProgress<ToolEnvironmentValue>> {
    const existing = await state.read(request.preparation)
    if ('failure' in existing) return existing
    if (existing.ok && existing.ok.digest !== digest(request))
      return fail({ kind: 'conflict', operation: request.preparation.operation })
    if (existing.ok?.closed) return environmentFailure('original acquisition is closed')
    const local = live.get(key(request.preparation))
    if (existing.ok && !local) return inspect(request, existing.ok)
    const plan = await input.plans.resolve(request)
    if ('failure' in plan) return plan
    if (
      !tenantEquals(request.tenant, request.preparation.tenant) ||
      canonicalDigest(plan.ok.acquire.scope) !==
        canonicalDigest(request.preparation.request.requesterScope)
    )
      return fail({ kind: 'denied', action: 'environment-binding' })
    if (existing.ok && local) {
      if (
        canonicalDigest(original(request, plan.ok)) !== canonicalDigest(existing.ok.original) ||
        plan.ok.acquire.guard !== local.plan.acquire.guard ||
        plan.ok.acquire.ledger !== local.plan.acquire.ledger ||
        plan.ok.acquire.retention?.ledger !== local.plan.acquire.retention?.ledger
      )
        return environmentFailure('original live acquisition inputs changed')
      const refreshed = await state.read(request.preparation)
      if ('failure' in refreshed) return refreshed
      if (
        !refreshed.ok ||
        refreshed.ok.closed ||
        local.invalidated ||
        local.plan.acquire.ledger.closed.aborted
      )
        return environmentFailure('original acquisition is no longer live')
      if (local.lease && !local.adopting) return prepared(request, refreshed.ok, local)
      const observed = await inspect(request, existing.ok)
      if ('failure' in observed || observed.ok.kind !== 'allocated' || !local.adopting)
        return observed
      return acquire(request, local)
    }
    let created = false
    const saved = await state.update(request.preparation, (record, receipt) => {
      created = !record
      if (record)
        return record.digest === digest(request)
          ? succeed(record)
          : fail({ kind: 'conflict', operation: request.preparation.operation })
      const acquired = original(request, plan.ok)
      return succeed({
        preparation: request.preparation,
        original: acquired,
        digest: digest(request),
        allocation: { kind: 'sent' },
        closed: false,
        evidence: receipt({ original: acquired, preparation: request.preparation }),
        release: null,
        resources: [],
      })
    })
    if ('failure' in saved) return saved
    if (!created) return inspect(request, saved.ok)
    const current: Live<P> = {
      plan: plan.ok,
      lease: null,
      adopting: true,
      invalidated: false,
      value: null,
      principal: null,
    }
    live.set(key(request.preparation), current)
    return acquire(request, current)
  }

  async function release(
    request: Parameters<ToolEnvironment<P, ToolEnvironmentValue>['release']>[0],
    inspectOnly: boolean,
  ): Reply<ReleaseProgress> {
    const checked = fixedReleaseInput(request, input)
    if ('failure' in checked) return checked
    const fixed = checked.ok
    const address = { tenant: fixed.tenant, call: fixed.call, operation: fixed.release.preparation }
    const before = await state.read(address)
    if ('failure' in before) return before
    if (!before.ok)
      return succeed({ kind: 'unknown', diagnostic: 'original preparation unavailable' })
    if (
      before.ok.release &&
      canonicalDigest(before.ok.release.record) !== canonicalDigest(fixed.release)
    )
      return fail({ kind: 'conflict', operation: fixed.release.operation })
    if (before.ok.release?.confirmed)
      return succeed({ kind: 'released', evidence: before.ok.evidence })
    if (inspectOnly)
      return succeed({ kind: 'pending', diagnostic: 'original cleanup is not confirmed' })
    if (
      canonicalDigest(before.ok.evidence) !== canonicalDigest(fixed.release.resource) &&
      !before.ok.release
    )
      return fail({
        kind: 'invalid',
        field: 'release.resource',
        reason: 'original evidence mismatch',
      })
    const closed = await state.update(address, record => {
      if (!record) return environmentFailure('original acquisition disappeared')
      if (
        record.release &&
        canonicalDigest(record.release.record) !== canonicalDigest(fixed.release)
      )
        return fail({ kind: 'conflict', operation: fixed.release.operation })
      return succeed({
        ...record,
        closed: true,
        release: record.release ?? { record: fixed.release, confirmed: false },
      })
    })
    if ('failure' in closed) return closed
    const current = live.get(key(address))
    const result = current?.lease
      ? await current.lease
          .release()
          .then(value =>
            value.kind === 'released'
              ? succeed({ kind: 'released' as const, evidence: closed.ok.evidence })
              : succeed({ kind: 'pending' as const, diagnostic: 'lease cleanup pending' }),
          )
      : await input.cleanup.settle({ ...fixed, original: closed.ok.original })
    if ('failure' in result || result.ok.kind !== 'released') return result
    const finished = await state.update(address, (record, receipt) => {
      if (!record?.release) return environmentFailure('original release disappeared')
      return succeed({
        ...record,
        closed: true,
        release: { record: record.release.record, confirmed: true },
        resources: record.resources.map(resource => ({ ...resource, stop: 'confirmed' })),
        evidence: record.release.confirmed
          ? record.evidence
          : receipt({ release: record.release.record, original: record.original, released: true }),
      })
    })
    if ('failure' in finished) return finished
    live.delete(key(address))
    return succeed({ kind: 'released', evidence: finished.ok.evidence })
  }

  const environment: ToolEnvironment<P, ToolEnvironmentValue> = {
    adoption: input.adoption,
    prepare(raw: EnvPreparationInput<P>) {
      const checked = fixedPreparationInput(raw, input)
      if ('failure' in checked) return Promise.resolve(checked)
      const address = key(checked.ok.preparation)
      const pending = preparing.get(address)
      if (pending)
        return pending.digest === digest(checked.ok)
          ? pending.result
          : Promise.resolve(
              fail({ kind: 'conflict' as const, operation: checked.ok.preparation.operation }),
            )
      const result = prepare(checked.ok).finally(() => preparing.delete(address))
      preparing.set(address, { digest: digest(checked.ok), result })
      return result
    },
    async inspectPreparation(raw: EnvPreparationInput<P>) {
      const checked = fixedPreparationInput(raw, input)
      if ('failure' in checked) return checked
      const found = await state.read(checked.ok.preparation)
      if ('failure' in found) return found
      if (!found.ok) return unknown('original preparation unavailable')
      if (found.ok.digest !== digest(checked.ok))
        return fail({ kind: 'conflict', operation: checked.ok.preparation.operation })
      return inspect(checked.ok, found.ok)
    },
    release: request => release(request, false),
    inspectRelease: request => release(request, true),
  }
  return Object.freeze(environment)
}
