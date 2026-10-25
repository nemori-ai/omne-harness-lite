import { isDeepStrictEqual } from 'node:util'
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  ContextBlockKey,
  Registration,
  BeginReplayInput,
  BeginReplayResult,
  FinishReplayInput,
  FinishReplayResult,
  ReplayMaterial,
  ReplayPrevious,
  ReplayRef,
  AppliedCommit,
  RegistrationChange,
} from '../index.js'
import { judgeRegistration } from '../index.js'
import { validate } from '../validation.js'
import { digest, isFailure, ownData, ownScope, type ReplaySession, type ScopeState, type Stored, type World } from './memory-world.js'
import { ownChange } from './memory-holder.js'

type Staged = {
  revision: number
  registrations: Map<ContextBlockKey, Registration>
  values: Map<ContextBlockKey, Stored>
  ended: ReplayMaterial['end']
}

function previousOf(s: ScopeState | undefined): ReplayPrevious {
  return {
    checkpoint: s?.checkpoint ?? null,
    registrationRevision: s?.revision ?? 0,
    end: s?.ended ?? null,
  }
}

function materialSize(material: ReplayMaterial): number | undefined {
  if (!Array.isArray(material.registrations) || !Array.isArray(material.checkpoints)) return undefined
  let size = material.registrations.length + 1
  for (const group of material.checkpoints) {
    if (!Array.isArray(group.blocks)) return undefined
    size += group.blocks.length
  }
  return size
}

function ownMaterial(material: ReplayMaterial): ReplayMaterial | undefined {
  const registrations: { commit: { commit: string }; change: RegistrationChange }[] = []
  for (const item of material.registrations) {
    const change = ownChange(item.change)
    if (!change) return undefined
    registrations.push({ commit: { commit: item.commit.commit }, change })
  }
  const checkpoints: ReplayMaterial['checkpoints'][number][] = []
  for (const group of material.checkpoints) {
    const blocks: { key: ContextBlockKey; value: unknown; updates: readonly [] }[] = []
    for (const block of group.blocks) {
      const value = ownData(block.value)
      if (!value || !Array.isArray(block.updates) || block.updates.length !== 0) return undefined
      blocks.push({ key: block.key, value: value.value, updates: [] })
    }
    checkpoints.push({ commit: { commit: group.commit.commit }, step: { step: group.step.step }, blocks })
  }
  return {
    registrations,
    checkpoints,
    end: material.end ? { commit: { commit: material.end.commit.commit } } : null,
  }
}

export function createReplay<P>(world: World<P>) {
  function appliedCommits(scopeRef: string): AppliedCommit[] {
    const out: AppliedCommit[] = []
    for (const [key, entry] of world.commits)
      if (key.startsWith(scopeRef + '\0')) out.push({ commit: entry.input.commit, digest: entry.digest })
    return out
  }

  function invalidateScope(s: ScopeState) {
    s.replayEpoch++
    s.epoch++
    s.fence = 'closed'
    world.targetsVersion++
    for (const [id, e] of world.eligibilities)
      if (e.scope.ref === s.scope.ref && e.state.kind !== 'revoked')
        world.eligibilities.set(id, { ...e, state: { kind: 'revoked' } })
  }

  function newSession(s: ScopeState, input: BeginReplayInput): ReplayRef {
    invalidateScope(s)
    const ref = { replay: 'replay-' + ++world.serial }
    const session: ReplaySession = {
      ref,
      scope: s.scope.ref,
      epoch: s.replayEpoch,
      through: input.through,
      supersedes: input.supersedes,
      finished: null,
    }
    world.sessions.set(ref.replay, session)
    s.replay = session
    return ref
  }

  async function beginReplay(principal: P, raw: BeginReplayInput): Promise<BeginReplayResult> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const scope = ownScope(raw.scope)
    if (!scope) return { kind: 'invalid', reason: 'malformed-input' }
    const input: BeginReplayInput = {
      scope,
      tenant: raw.tenant,
      through: raw.through ? { commit: raw.through.commit } : null,
      supersedes: raw.supersedes ? { replay: raw.supersedes.replay } : null,
    }
    const before = world.state(scope)
    const decided = await world.decide(() =>
      world.options.authority.holder(principal, {
        kind: 'begin-replay',
        scope,
        tenant: input.tenant,
        through: input.through,
        supersedes: input.supersedes,
        previous: previousOf(before),
      }),
    )
    if (isFailure(decided)) {
      if (decided.kind !== 'invalid') return decided
      return decided.reason === 'checkpoint-conflict'
        ? { kind: 'invalid', reason: 'checkpoint-conflict' }
        : { kind: 'unknown', cause: 'authority' }
    }
    const unbound = await world.bound(scope, input.tenant)
    if (unbound) return unbound
    if (!decided.current()) return { kind: 'refused', reason: 'unauthorized' }
    const existing = world.state(scope)
    if (existing && !tenantEquals(existing.tenant, input.tenant)) return { kind: 'refused', reason: 'unauthorized' }
    const s = existing ?? world.newScope(scope, input.tenant)
    const session = s.replay
    const sameAsLatest =
      session !== null &&
      isDeepStrictEqual(session.through, input.through) &&
      isDeepStrictEqual(session.supersedes, input.supersedes)
    if (sameAsLatest) return { kind: 'replaying', replay: session.ref }
    if (input.supersedes === null)
      return session === null ? { kind: 'replaying', replay: newSession(s, input) } : { kind: 'invalid', reason: 'replay-conflict' }
    if (session !== null && session.ref.replay === input.supersedes.replay)
      return { kind: 'replaying', replay: newSession(s, input) }
    const old = world.sessions.get(input.supersedes.replay)
    return old?.scope === s.scope.ref
      ? { kind: 'invalid', reason: 'replay-conflict' }
      : { kind: 'refused', reason: 'unauthorized' }
  }

  function stage(s: ScopeState, material: ReplayMaterial): Staged | FinishReplayResult {
    const staged: Staged = { revision: 0, registrations: new Map(), values: new Map(), ended: material.end }
    for (const { change } of material.registrations) {
      if (change.scope.ref !== s.scope.ref || !tenantEquals(change.tenant, s.tenant))
        return { kind: 'invalid', reason: 'malformed-input' }
      if (change.basedOn !== staged.revision) return { kind: 'invalid', reason: 'replay-incomplete' }
      if (change.kind === 'add' && change.declaration) {
        const known = world.descriptors.get(change.key)
        if (!known) world.descriptors.set(change.key, change.declaration)
      }
      const judged = judgeRegistration(change, {
        descriptors: world.catalog,
        scopeTenant: s.tenant,
        existing: staged.registrations.get(change.key) ?? null,
        creating: change.creating,
      })
      if ('failure' in judged) return { kind: 'invalid', reason: 'registration', rejections: judged.failure }
      staged.revision++
      if (change.kind === 'remove') staged.registrations.delete(change.key)
      else
        staged.registrations.set(change.key, {
          scope: s.scope,
          tenant: s.tenant,
          key: change.key,
          bindings: change.bindings,
          parameters: change.parameters,
          required: change.kind === 'add' ? change.required : (staged.registrations.get(change.key)?.required ?? false),
          revision: staged.revision,
        })
    }
    return stageCheckpoints(s, material, staged)
  }

  function stageCheckpoints(s: ScopeState, material: ReplayMaterial, staged: Staged): Staged | FinishReplayResult {
    const steps = new Map<string, string>()
    for (const group of material.checkpoints) {
      const step = steps.get(group.commit.commit)
      if (step !== undefined && step !== group.step.step) return { kind: 'invalid', reason: 'malformed-input' }
      steps.set(group.commit.commit, group.step.step)
      for (const block of group.blocks) {
        const d = world.descriptors.get(block.key)
        if (
          staged.values.has(block.key) ||
          !staged.registrations.has(block.key) ||
          d?.kind !== 'stateful' ||
          d.persistence !== 'checkpointed'
        )
          return { kind: 'invalid', reason: 'malformed-input' }
        if (validate(d.schema, block.value).length) return { kind: 'invalid', reason: 'rejected-update' }
        staged.values.set(block.key, {
          value: block.value,
          revision: (s.values.get(block.key)?.revision ?? 0) + 1,
          generation: null,
          present: true,
        })
      }
    }
    if (s.ended && !staged.ended) return { kind: 'invalid', reason: 'checkpoint-conflict' }
    if (staged.revision < s.revision) return { kind: 'invalid', reason: 'checkpoint-conflict' }
    return staged
  }

  function signature(registrations: Map<ContextBlockKey, Registration>, values: Map<ContextBlockKey, Stored>) {
    return digest({
      registrations: [...registrations.values()].map(r => [r.key, r.required, r.parameters, r.revision]).sort(),
      values: [...values.entries()].map(([key, v]) => [key, v.present, v.value]).sort(),
    })
  }

  function install(s: ScopeState, session: ReplaySession, staged: Staged, fingerprint: string): FinishReplayResult {
    const changed = signature(s.registrations, s.values) !== signature(staged.registrations, staged.values)
    s.registrations = staged.registrations
    s.values = staged.values
    s.revision = staged.revision
    s.epoch++
    s.checkpoint = session.through
    s.needsSupply.clear()
    world.targetsVersion++
    if (staged.ended) s.ended ??= { commit: staged.ended.commit.commit }
    else {
      s.fence = 'open'
      for (const key of s.registrations.keys())
        if (world.descriptors.get(key)?.kind !== 'stateful') s.needsSupply.set(key, s.replayEpoch)
    }
    if (changed) world.changed(s, null)
    const result: FinishReplayResult = {
      kind: 'ready',
      state: s.ended ? 'ended' : 'open',
      registrationRevision: s.revision,
      viewRevision: s.view,
    }
    session.finished = { fingerprint, result }
    return result
  }

  async function finishReplay(principal: P, raw: FinishReplayInput): Promise<FinishReplayResult> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const size = materialSize(raw.material)
    if (size === undefined) return { kind: 'invalid', reason: 'malformed-input' }
    if (size > world.options.replayCapacity) return { kind: 'unavailable', cause: 'replay' }
    const material = ownMaterial(raw.material)
    if (!material) return { kind: 'invalid', reason: 'malformed-input' }
    const session = world.sessions.get(raw.replay.replay)
    const s = session ? world.scopes.get(session.scope) : undefined
    if (!session || !s) return { kind: 'refused', reason: 'unauthorized' }
    const ref = session.ref
    const endedBefore = s.ended
    const versionBefore = s.commitsVersion
    const decided = await world.decide(() =>
      world.options.authority.holder(principal, {
        kind: 'finish-replay',
        scope: s.scope,
        tenant: s.tenant,
        replay: ref,
        through: session.through,
        material,
        previous: previousOf(s),
        appliedCommits: appliedCommits(s.scope.ref),
      }),
    )
    if (isFailure(decided)) {
      if (decided.kind !== 'invalid') return decided
      return decided.reason === 'checkpoint-conflict' || decided.reason === 'replay-incomplete'
        ? { kind: 'invalid', reason: decided.reason }
        : { kind: 'unknown', cause: 'authority' }
    }
    const unbound = await world.bound(s.scope, s.tenant)
    if (unbound) return unbound
    if (s.replay !== session) return { kind: 'invalid', reason: 'replay-conflict' }
    const fingerprint = digest(material)
    if (session.finished) {
      if (!decided.current()) return { kind: 'refused', reason: 'unauthorized' }
      return session.finished.fingerprint === fingerprint ? session.finished.result : { kind: 'invalid', reason: 'replay-conflict' }
    }
    const staged = stage(s, material)
    if (!('registrations' in staged)) return staged
    if (!decided.current()) return { kind: 'refused', reason: 'unauthorized' }
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    if (s.replay !== session || session.finished) return { kind: 'invalid', reason: 'replay-conflict' }
    if (s.ended !== endedBefore || s.commitsVersion !== versionBefore)
      return { kind: 'invalid', reason: 'checkpoint-conflict' }
    return install(s, session, staged, fingerprint)
  }

  return { beginReplay, finishReplay }
}
