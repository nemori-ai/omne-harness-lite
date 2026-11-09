import {
  acquisitionRef,
  type AcquireInput,
  type EnvironmentLease,
  type EnvironmentRequirement,
  type ExecutionEnvironment,
  type FacilityGuard,
  type OriginalAcquisition,
  type OriginalInspection,
  type OriginRef,
  type Placement,
  type ResourceLedger,
  type RetainedProcessLedger,
  type RetainedTerminalLedger,
} from '@omne-harness/execution-environment-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolAccessGuard, type ToolLedgerStore } from '@omne-harness/tool'
import type { Adoption, DurableEvidence, Reply, ToolFailure } from '@omne-harness/tool-contract'
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
/** Without `processes` no one-shot command is retained. */
export type EnvironmentRetention = Readonly<{
  scope: ScopeRef
  ledger: RetainedTerminalLedger
  processes?: RetainedProcessLedger
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
  store: ToolLedgerStore
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

type AcquisitionAnswer = Awaited<ReturnType<ExecutionEnvironment<unknown>['acquire']>>
type Receipt = (value: unknown) => DurableEvidence

function terminalAllocation(record: EnvironmentState): boolean {
  return (
    record.allocation.kind === 'rejected' ||
    record.allocation.kind === 'not-allocated' ||
    record.allocation.kind === 'settled'
  )
}

function terminalPreparation(
  record: EnvironmentState,
): PreparationProgress<ToolEnvironmentValue> | undefined {
  switch (record.allocation.kind) {
    case 'rejected':
      return { kind: 'rejected', reason: record.allocation.reason, evidence: record.evidence }
    case 'not-allocated':
    case 'settled':
      return {
        kind: 'unknown',
        diagnostic: `original acquisition terminal: ${record.allocation.kind}`,
      }
    default:
      return undefined
  }
}

function inspectedState(
  current: EnvironmentState | null,
  answer: OriginalInspection,
  receipt: Receipt,
): Outcome<EnvironmentState, ToolFailure> {
  if (!current) return environmentFailure('original acquisition disappeared')
  if (current.closed) return fail({ kind: 'not-settled' })
  if (terminalAllocation(current)) return succeed(current)
  switch (answer.status) {
    case 'allocated':
      return succeed({
        ...current,
        allocation: { kind: 'allocated' },
        evidence:
          current.allocation.kind === 'allocated'
            ? current.evidence
            : receipt({ original: current.original, allocated: true }),
      })
    case 'notAllocated':
    case 'settled':
      return succeed({
        ...current,
        allocation: { kind: answer.status === 'notAllocated' ? 'not-allocated' : 'settled' },
        evidence: receipt({ original: current.original, terminal: answer.status }),
      })
    case 'allocationFailed':
      return succeed({
        ...current,
        allocation: { kind: 'rejected', reason: answer.reason },
        evidence: receipt({
          original: current.original,
          failure: answer.reason,
          cleanup: answer.cleanup,
        }),
      })
    default:
      return succeed(current)
  }
}

function acquiredState(
  record: EnvironmentState | null,
  result: AcquisitionAnswer,
  receipt: Receipt,
): Outcome<EnvironmentState, ToolFailure> {
  if (!record) return environmentFailure('original acquisition disappeared')
  if (record.closed || terminalAllocation(record)) return succeed(record)
  switch (result.kind) {
    case 'acquired':
      return succeed({
        ...record,
        allocation: { kind: 'allocated' },
        evidence: receipt({ original: record.original, adoption: result.adoption }),
      })
    case 'rejected':
    case 'allocationFailed':
      return succeed({
        ...record,
        allocation: { kind: 'rejected', reason: result.reason },
        evidence: receipt({ original: record.original, rejection: result.reason }),
      })
    default:
      return succeed({ ...record, allocation: { kind: 'unknown' } })
  }
}

function liveAcquisition<P>(current: Live<P>): boolean {
  return !current.invalidated && !current.plan.acquire.ledger.closed.aborted
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
    const terminal = terminalPreparation(record)
    if (terminal) return succeed(terminal)
    const current = live.get(key(record.preparation))
    const changed = await state.update(record.preparation, (value, receipt) =>
      inspectedState(value, answer, receipt),
    )
    if ('failure' in changed) return changed
    const ended = terminalPreparation(changed.ok)
    if (ended) return succeed(ended)
    if (answer.status === 'allocated') return inspectAllocation(request, changed.ok, current)
    if (answer.status === 'conflict')
      return fail({ kind: 'conflict', operation: record.preparation.operation })
    return succeed({ kind: 'pending', diagnostic: `original acquisition ${answer.status}` })
  }

  function inspectAllocation(
    request: EnvPreparationInput<P>,
    record: EnvironmentState,
    current: Live<P> | undefined,
  ): Outcome<PreparationProgress<ToolEnvironmentValue>, ToolFailure> {
    if (!current || !liveAcquisition(current))
      return unknown('original live registration unavailable')
    if (!current.adopting) return prepared(request, record, current)
    return succeed({
      kind: 'allocated',
      preparation: record.preparation,
      evidence: record.evidence,
    })
  }

  async function acquire(
    request: EnvPreparationInput<P>,
    current: Live<P>,
  ): Reply<PreparationProgress<ToolEnvironmentValue>> {
    if (!liveAcquisition(current))
      return environmentFailure('original acquisition is no longer live')
    const result = await input.execution.acquire(accessOf(request), current.plan.acquire)
    if (result.kind === 'acquired') {
      current.lease = result.lease
      void result.lease.invalidated.then(() => {
        current.invalidated = true
      })
    }
    const updated = await state.update(request.preparation, (record, receipt) =>
      acquiredState(record, result, receipt),
    )
    if ('failure' in updated) return updated
    if (
      updated.ok.closed ||
      !liveAcquisition(current) ||
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
    if (existing.ok && local) return reconnect(request, existing.ok, local, plan.ok)
    return firstAcquisition(request, plan.ok)
  }

  function sameLivePlan(
    request: EnvPreparationInput<P>,
    record: EnvironmentState,
    current: Live<P>,
    plan: EnvironmentPlan<P>,
  ): boolean {
    return (
      canonicalDigest(original(request, plan)) === canonicalDigest(record.original) &&
      plan.acquire.guard === current.plan.acquire.guard &&
      plan.acquire.ledger === current.plan.acquire.ledger &&
      plan.acquire.retention?.ledger === current.plan.acquire.retention?.ledger &&
      plan.acquire.retention?.processes === current.plan.acquire.retention?.processes
    )
  }

  async function reconnect(
    request: EnvPreparationInput<P>,
    existing: EnvironmentState,
    local: Live<P>,
    plan: EnvironmentPlan<P>,
  ): Reply<PreparationProgress<ToolEnvironmentValue>> {
    if (!sameLivePlan(request, existing, local, plan))
      return environmentFailure('original live acquisition inputs changed')
    const refreshed = await state.read(request.preparation)
    if ('failure' in refreshed) return refreshed
    if (!refreshed.ok || refreshed.ok.closed || !liveAcquisition(local))
      return environmentFailure('original acquisition is no longer live')
    if (local.lease && !local.adopting) return prepared(request, refreshed.ok, local)
    const observed = await inspect(request, existing)
    if ('failure' in observed || observed.ok.kind !== 'allocated' || !local.adopting)
      return observed
    return acquire(request, local)
  }

  async function firstAcquisition(
    request: EnvPreparationInput<P>,
    plan: EnvironmentPlan<P>,
  ): Reply<PreparationProgress<ToolEnvironmentValue>> {
    let created = false
    const saved = await state.update(request.preparation, (record, receipt) => {
      created = !record
      if (record)
        return record.digest === digest(request)
          ? succeed(record)
          : fail({ kind: 'conflict', operation: request.preparation.operation })
      const acquired = original(request, plan)
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
      plan,
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
    return settleRelease(fixed, address)
  }

  async function settleRelease(
    fixed: Parameters<ToolEnvironment<P, ToolEnvironmentValue>['release']>[0],
    address: EnvironmentAddress,
  ): Reply<ReleaseProgress> {
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
        // The acquisition's duty for every resource ends here: the release stopped the ones it
        // still owned, and a handed-over one belongs to its retention scope, which shows it as
        // `handedOver` for as long as it holds it.
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
