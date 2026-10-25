import { isDeepStrictEqual } from 'node:util'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ScopeRef,
  RegistrationChange,
  Eligibility,
  EligibilityId,
  EligibilityMaterial,
  CommitInput,
  ApplyCommitResult,
  PrepareRegistrationResult,
  IssueEligibilityResult,
  RevokeEligibilityResult,
  NeedBinding,
  ContextBlockKey,
} from '../index.js'
import { judgeRegistration, reduceStep } from '../index.js'
import { validate } from '../validation.js'
import {
  digest,
  isFailure,
  ownData,
  ownScope,
  type Authorized,
  type CheckFailure,
  type ScopeState,
  type World,
} from './memory-world.js'
import type { Supplier } from './memory-producer.js'

type Gate<P> = Authorized<P> | CheckFailure

/** Holder authority, then the trusted binding of the target scope. */
export async function holderGate<P>(
  world: World<P>,
  principal: P,
  action: Parameters<World<P>['options']['authority']['holder']>[1],
  scope: ScopeRef,
  tenant: TenantId,
): Promise<Gate<P>> {
  const decided = await world.decide(() => world.options.authority.holder(principal, action))
  if (isFailure(decided))
    return decided.kind === 'invalid' ? { kind: 'unknown', cause: 'authority' } : decided
  const unbound = await world.bound(scope, tenant)
  return unbound ?? decided
}

function isGateFailure<P>(gate: Gate<P>): gate is CheckFailure {
  return 'kind' in gate
}

export function ownChange(change: RegistrationChange): RegistrationChange | undefined {
  const scope = ownScope(change.scope)
  if (!scope) return undefined
  const head = {
    scope,
    tenant: change.tenant,
    key: change.key,
    basedOn: change.basedOn,
    creating: change.creating,
  }
  if (change.kind === 'remove') return { ...head, kind: 'remove' }
  const parameters = ownData(change.parameters)
  if (!parameters || !Array.isArray(change.bindings)) return undefined
  const bindings: NeedBinding<ContextBlockKey>[] = change.bindings.map(binding => ({ ...binding }))
  if (change.kind === 'update')
    return { ...head, kind: 'update', bindings, parameters: parameters.value }
  return {
    ...head,
    kind: 'add',
    bindings,
    parameters: parameters.value,
    required: change.required,
    ...(change.declaration ? { declaration: change.declaration } : {}),
  }
}

/** Captures a commit input into owned data before the first await (RC-01 输入快照). */
export function ownCommit(input: CommitInput): CommitInput | undefined {
  const end = input.scopeEnded === true ? { scopeEnded: true as const } : {}
  if (input.kind === 'scope') {
    const scope = ownScope(input.scope)
    return scope && input.scopeEnded === true
      ? { kind: 'scope', commit: { commit: input.commit.commit }, scope, tenant: input.tenant, scopeEnded: true }
      : undefined
  }
  if (input.kind === 'registration') {
    const change = ownChange(input.change)
    return change ? { kind: 'registration', commit: { commit: input.commit.commit }, change, ...end } : undefined
  }
  const scope = ownScope(input.stepCommit.scope)
  const committed = ownData(input.stepCommit.committed)
  const pending = ownData(input.stepCommit.pending)
  if (!scope || !committed || !pending || !Array.isArray(committed.value)) return undefined
  return {
    kind: 'step',
    commit: { commit: input.commit.commit },
    tenant: input.tenant,
    executionEnded: input.executionEnded === true,
    stepCommit: {
      scope,
      step: { step: input.stepCommit.step.step },
      committed: input.stepCommit.committed.map(block => ({
        key: block.key,
        value: structuredClone(block.value),
        updates: block.updates.map(update => ({ ...update })),
      })),
      pending: input.stepCommit.pending.map(update => ({ ...update })),
    },
    ...end,
  }
}

function commitTarget(input: CommitInput): { scope: ScopeRef; tenant: TenantId } {
  if (input.kind === 'registration') return { scope: input.change.scope, tenant: input.change.tenant }
  if (input.kind === 'step') return { scope: input.stepCommit.scope, tenant: input.tenant }
  return { scope: input.scope, tenant: input.tenant }
}

export function createHolder<P>(world: World<P>, supplier: Supplier<P>) {
  async function prepareRegistration(
    principal: P,
    raw: RegistrationChange,
  ): Promise<PrepareRegistrationResult> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const change = ownChange(raw)
    if (!change) return { kind: 'refused', reason: 'unauthorized' }
    const gate = await holderGate(world, principal, { kind: 'prepare', change }, change.scope, change.tenant)
    if (isGateFailure(gate)) return gate
    const s = world.state(change.scope)
    if (s?.ended) return { kind: 'refused', reason: 'scope-ended' }
    if (!gate.current()) return { kind: 'refused', reason: 'unauthorized' }
    const result = judgeRegistration(change, {
      descriptors: world.catalog,
      scopeTenant: s?.tenant ?? null,
      existing: s?.registrations.get(change.key) ?? null,
      creating: change.creating,
    })
    return 'failure' in result
      ? { kind: 'rejected', rejections: result.failure }
      : { kind: 'prepared', judged: result.ok, currentRevision: s?.revision ?? 0 }
  }

  function consumerRefusal(material: EligibilityMaterial<P>): boolean {
    for (const key of material.keys) {
      const d = world.descriptors.get(key)
      if (d && !d.consumers.includes(material.consumer)) return true
    }
    for (const ref of material.bindings) {
      const reg = world.registration(material.scope, ref.key)
      const binding = reg?.r.bindings.find(b => b.need.name === ref.need)
      if (!binding?.translate || binding.need.consumer !== material.consumer) return true
    }
    return false
  }

  async function issueEligibility(
    principal: P,
    raw: EligibilityMaterial<P>,
  ): Promise<IssueEligibilityResult<P>> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const scope = ownScope(raw.scope)
    if (!scope || !Array.isArray(raw.keys) || !Array.isArray(raw.bindings))
      return { kind: 'refused', reason: 'unauthorized' }
    const material: EligibilityMaterial<P> = {
      supersedes: raw.supersedes ? { eligibility: raw.supersedes.eligibility } : null,
      scope,
      consumer: raw.consumer,
      principal: raw.principal,
      tenant: raw.tenant,
      keys: [...raw.keys],
      bindings: raw.bindings.map(binding => ({ key: binding.key, need: binding.need })),
      registrationRevision: raw.registrationRevision,
    }
    const gate = await holderGate(world, principal, { kind: 'issue', material }, scope, material.tenant)
    if (isGateFailure(gate)) return gate
    const s = world.state(scope)
    if (s?.ended) return { kind: 'refused', reason: 'scope-ended' }
    if (!s || s.fence !== 'open') return { kind: 'refused', reason: 'replay-incomplete' }
    if (material.supersedes && !world.currentEligibility(material.supersedes))
      return { kind: 'refused', reason: 'supersedes-unknown' }
    if (consumerRefusal(material)) return { kind: 'refused', reason: 'unauthorized' }
    if (!gate.current()) return { kind: 'refused', reason: 'unauthorized' }
    const id = { eligibility: 'eligibility-' + ++world.serial }
    const eligibility: Eligibility<P> = { ...material, id, state: { kind: 'valid' } }
    world.eligibilities.set(id.eligibility, eligibility)
    if (material.supersedes) {
      const old = world.eligibilities.get(material.supersedes.eligibility)
      if (old)
        world.eligibilities.set(old.id.eligibility, { ...old, state: { kind: 'superseded', by: id } })
    }
    return { kind: 'issued', eligibility }
  }

  async function revokeEligibility(principal: P, raw: EligibilityId): Promise<RevokeEligibilityResult> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const id = { eligibility: raw.eligibility }
    const decided = await world.decide(() =>
      world.options.authority.holder(principal, { kind: 'revoke', eligibility: id }),
    )
    if (isFailure(decided))
      return decided.kind === 'invalid' ? { kind: 'unknown', cause: 'authority' } : decided
    const e = world.eligibilities.get(id.eligibility)
    if (!e) return { kind: 'refused', reason: 'unknown-eligibility' }
    const unbound = await world.bound(e.scope, e.tenant)
    if (unbound) return unbound
    if (!decided.current()) return { kind: 'refused', reason: 'unauthorized' }
    world.eligibilities.set(id.eligibility, { ...e, state: { kind: 'revoked' } })
    return { kind: 'revoked' }
  }

  function endScope(s: ScopeState, commit: { commit: string }) {
    s.ended = commit
    s.commitsVersion++
    world.targetsVersion++
    world.changed(s, null)
  }

  async function applyCommit(principal: P, raw: CommitInput): Promise<ApplyCommitResult> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const input = ownCommit(raw)
    if (!input) return { kind: 'invalid', reason: 'malformed-input', current: 0 }
    const { scope, tenant } = commitTarget(input)
    const gate = await holderGate(world, principal, { kind: 'commit', input }, scope, tenant)
    if (isGateFailure(gate)) return gate
    const key = scope.ref + '\0' + input.commit.commit
    const seen = world.commits.get(key)
    let s = world.state(scope)
    if (s && !tenantEquals(s.tenant, tenant))
      return { kind: 'invalid', reason: 'tenant-mismatch', current: s.revision }
    if (seen) {
      if (!gate.current()) return { kind: 'refused', reason: 'unauthorized' }
      return isDeepStrictEqual(seen.input, input)
        ? seen.result
        : { kind: 'invalid', reason: 'commit-conflict', current: s?.revision ?? 0 }
    }
    if (input.kind === 'scope') {
      if (!gate.current()) return { kind: 'refused', reason: 'unauthorized' }
      s ??= world.newScope(scope, tenant)
      if (!s.ended) endScope(s, input.commit)
      return remember(key, input, s)
    }
    if (!s || s.fence !== 'open') return { kind: 'refused', reason: 'replay-incomplete' }
    if (s.ended) return { kind: 'refused', reason: 'scope-ended' }
    const target = s
    const prepared =
      input.kind === 'registration' ? prepareRegistrationCommit(input.change, target) : prepareStep(input, target)
    if ('kind' in prepared) return prepared
    if (!gate.current()) return { kind: 'refused', reason: 'unauthorized' }
    if (world.state(scope) !== target || target.fence !== 'open' || target.ended)
      return { kind: 'refused', reason: target.ended ? 'scope-ended' : 'replay-incomplete' }
    prepared.apply()
    target.commitsVersion++
    if (input.scopeEnded === true) endScope(target, input.commit)
    const result = remember(key, input, target)
    if (input.kind === 'registration' && input.change.kind !== 'remove')
      await supplier.afterRegistration(target, input.change.key)
    return result
  }

  function remember(key: string, input: CommitInput, s: ScopeState): ApplyCommitResult {
    const result: ApplyCommitResult = {
      kind: 'applied',
      registrationRevision: s.revision,
      viewRevision: s.view,
    }
    world.commits.set(key, { input, digest: digest(input), result })
    return result
  }

  function prepareRegistrationCommit(
    change: RegistrationChange,
    s: ScopeState,
  ): ApplyCommitResult | { apply(): void } {
    if (change.basedOn !== s.revision)
      return { kind: 'invalid', reason: 'out-of-order', current: s.revision }
    const judged = judgeRegistration(change, {
      descriptors: world.catalog,
      scopeTenant: s.tenant,
      existing: s.registrations.get(change.key) ?? null,
      creating: change.creating,
    })
    if ('failure' in judged)
      return {
        kind: 'invalid',
        reason: judged.failure.some(r => r.reason === 'tenant-mismatch') ? 'tenant-mismatch' : 'registration',
        current: s.revision,
        rejections: judged.failure,
      }
    return {
      apply: () => {
        storeRegistration(world, change, s)
        world.changed(s, change.key)
      },
    }
  }

  function prepareStep(
    input: Extract<CommitInput, { kind: 'step' }>,
    s: ScopeState,
  ): ApplyCommitResult | { apply(): void } {
    const reduced = reduceStep({
      scope: s.scope,
      step: input.stepCommit.step,
      updates: input.stepCommit.committed.flatMap(item => item.updates),
      descriptors: world.catalog,
      current: key => s.values.get(key)?.value,
    })
    if (reduced.rejected.length)
      return { kind: 'invalid', reason: 'rejected-update', current: s.revision, rejected: reduced.rejected }
    for (const block of input.stepCommit.committed) {
      const material = reduced.committed.find(item => item.key === block.key)
      if (block.updates.length > 0 && (!material || !isDeepStrictEqual(material.value, block.value)))
        return { kind: 'invalid', reason: 'rejected-update', current: s.revision }
      const d = world.descriptors.get(block.key)
      if (d?.kind !== 'stateful' || validate(d.schema, block.value).length)
        return { kind: 'invalid', reason: 'rejected-update', current: s.revision }
    }
    return {
      apply: () => {
        for (const block of input.stepCommit.committed) world.put(s, block.key, block.value, null, true)
        if (input.executionEnded)
          for (const [key, d] of world.descriptors)
            if (d.kind === 'stateful' && d.persistence === 'untracked' && s.registrations.has(key))
              world.put(s, key, undefined, null, false)
      },
    }
  }

  return { prepareRegistration, issueEligibility, revokeEligibility, applyCommit }
}

export function storeRegistration<P>(world: World<P>, change: RegistrationChange, s: ScopeState) {
  if (change.kind === 'add' && change.declaration) world.descriptors.set(change.key, change.declaration)
  s.revision++
  s.epoch++
  world.targetsVersion++
  world.nextSeq(s, change.key)
  world.incompatible.delete(s.scope.ref + '\0' + change.key)
  if (change.kind === 'remove') {
    s.registrations.delete(change.key)
    s.values.delete(change.key)
    s.needsSupply.delete(change.key)
    return
  }
  s.registrations.set(change.key, {
    scope: change.scope,
    tenant: change.tenant,
    key: change.key,
    bindings: change.bindings,
    parameters: change.parameters,
    required: change.kind === 'add' ? change.required : (s.registrations.get(change.key)?.required ?? false),
    revision: s.revision,
  })
}
