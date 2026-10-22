import { isDeepStrictEqual } from 'node:util'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  RuntimeContextOperations,
  ContextBlockKey,
  ScopeRef,
  ContextBlockDescriptor,
  Registration,
  RegistrationChange,
  Eligibility,
  EligibilityId,
  EligibilityMaterial,
  ContextReader,
  SnapshotResult,
  ChangesResult,
  ReadResult,
  NeedRequest,
  BlockEntry,
  PerRequestEntry,
  MissingItem,
  SourceEvidence,
  SupplyAnswer,
  ProducerRegistration,
  ProducerHandle,
  PublishResult,
  InvalidateResult,
  CommitInput,
  ApplyCommitResult,
  ReadOutcome,
  Snapshot,
  SupplyCallback,
} from '../index.js'
import { judgeRegistration, reduceStep } from '../index.js'
import { sameDeclaration } from '../judge.js'
import { validate } from '../validation.js'

export type MemoryRuntimeContextOptions = Readonly<{ retention?: number }>
export type MemoryRuntimeContext<P = unknown> = RuntimeContextOperations<P> &
  Readonly<{
    durability: 'none'
    close(): Promise<void>
    onChange(listener: (scope: ScopeRef, revision: number) => void): () => void
  }>
type Descriptor = ContextBlockDescriptor<ContextBlockKey, unknown, unknown>
type Stored = {
  value: unknown
  revision: number
  generation: number | null
  cause?: 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'uninterpretable'
  present: boolean
  unknown?: boolean
}
type ScopeState = {
  scope: ScopeRef
  tenant: TenantId
  revision: number
  view: number
  epoch: number
  registrations: Map<ContextBlockKey, Registration>
  values: Map<ContextBlockKey, Stored>
}
type Producer = {
  key: ContextBlockKey
  producer: string
  generation: number
  scoped: boolean
  supply: SupplyCallback<unknown> | undefined
  active: boolean
}
export function createMemoryRuntimeContext<P = unknown>(
  options: MemoryRuntimeContextOptions = {},
): MemoryRuntimeContext<P> {
  let closed = false,
    serial = 0
  const incompatible = new Set<string>()
  const descriptors = new Map<ContextBlockKey, Descriptor>(),
    scopes = new Map<string, ScopeState>(),
    producers = new Map<ContextBlockKey, Producer>(),
    generations = new Map<ContextBlockKey, number>(),
    eligibilities = new Map<string, Eligibility<P>>()
  const commits = new Map<string, { input: CommitInput; result: ApplyCommitResult }>()
  const listeners = new Set<(scope: ScopeRef, revision: number) => void>()
  const catalog = { get: (key: ContextBlockKey) => descriptors.get(key) }
  const state = (scope: ScopeRef) => scopes.get(scope.ref)
  function changed(s: ScopeState, key: ContextBlockKey) {
    if (descriptors.get(key)?.volatility === 'per-request') return
    s.view++
    for (const listener of listeners) {
      try {
        listener(s.scope, s.view)
      } catch {
        /* A wake-up is not the source of fact. */
      }
    }
  }
  function put(
    s: ScopeState,
    key: ContextBlockKey,
    value: unknown,
    generation: number | null,
    present: boolean,
    cause: Stored['cause'] = 'no-value',
  ) {
    s.values.set(key, {
      value,
      revision: (s.values.get(key)?.revision ?? 0) + 1,
      generation,
      present,
      cause,
    })
    changed(s, key)
  }
  async function supply(producer: Producer, s: ScopeState) {
    if (!producer.supply) return
    let result: SupplyAnswer<unknown>
    try {
      result = await producer.supply(s.scope)
    } catch {
      if (producer.active && producers.get(producer.key) === producer) {
        s.values.set(producer.key, {
          present: false,
          value: undefined,
          revision: (s.values.get(producer.key)?.revision ?? 0) + 1,
          generation: producer.generation,
          unknown: true,
        })
        changed(s, producer.key)
      }
      return
    }
    if (!producer.active || producers.get(producer.key) !== producer || closed) return
    if (result.kind === 'value') {
      const descriptor = descriptors.get(producer.key)
      if (descriptor && validate(descriptor.schema, result.value).length === 0)
        put(s, producer.key, result.value, producer.generation, true)
    } else
      put(
        s,
        producer.key,
        undefined,
        producer.generation,
        false,
        result.kind === 'unavailable' ? 'source-unavailable' : 'no-value',
      )
  }
  function registration(
    scope: ScopeRef,
    key: ContextBlockKey,
  ): { s: ScopeState; r: Registration } | undefined {
    let current: ScopeRef | undefined = scope
    while (current) {
      const s = state(current)
      const r = s?.registrations.get(key)
      if (s && r) return { s, r }
      current = current.parent
    }
    return undefined
  }
  function currentEligibility(id: EligibilityId): Eligibility<P> | undefined {
    let e = eligibilities.get(id.eligibility),
      remaining = eligibilities.size + 1
    while (e?.state.kind === 'superseded' && remaining-- > 0)
      e = eligibilities.get(e.state.by.eligibility)
    return e?.state.kind === 'valid' ? e : undefined
  }
  function allowed(e: Eligibility<P>, key: ContextBlockKey) {
    const d = descriptors.get(key)
    return e.keys.includes(key) && !!d?.consumers.includes(e.consumer)
  }
  async function registerProducer<K extends ContextBlockKey>(input: ProducerRegistration<K>) {
    if (closed) return { kind: 'rejected', reason: 'closed' } as const
    if (!input.declaration) return { kind: 'rejected', reason: 'declaration-missing' } as const
    const old = producers.get(input.key),
      descriptor = descriptors.get(input.key)
    if (descriptor && !sameDeclaration(descriptor, input.declaration))
      return { kind: 'rejected', reason: 'declaration-mismatch' } as const
    if (old?.active && old.producer !== input.producer.producer)
      return { kind: 'rejected', reason: 'other-producer' } as const
    if ((!input.scoped || input.declaration.volatility === 'per-request') && !input.supply)
      return { kind: 'rejected', reason: 'declaration-missing' } as const
    if (old) old.active = false
    const generation = (generations.get(input.key) ?? 0) + 1
    generations.set(input.key, generation)
    const producer: Producer = {
      key: input.key,
      producer: input.producer.producer,
      generation,
      active: true,
      scoped: input.scoped,
      supply: input.supply,
    }
    producers.set(input.key, producer)
    descriptors.set(input.key, input.declaration)
    for (const s of scopes.values()) {
      const r = s.registrations.get(input.key)
      if (!r) continue
      s.epoch++
      s.values.delete(input.key)
      const checked = judgeRegistration(
        {
          kind: 'update',
          creating: false,
          scope: s.scope,
          tenant: s.tenant,
          key: input.key,
          basedOn: s.revision,
          bindings: r.bindings,
          parameters: r.parameters,
        },
        { descriptors: catalog, scopeTenant: s.tenant, existing: r, creating: false },
      )
      if ('failure' in checked) incompatible.add(s.scope.ref + '\0' + input.key)
      else if (!input.scoped && input.declaration.volatility !== 'per-request')
        await supply(producer, s)
    }
    function refusal(): 'closed' | 'withdrawn' | 'stale-generation' | undefined {
      return closed
        ? 'closed'
        : !producer.active
          ? producers.get(input.key) !== producer
            ? 'stale-generation'
            : 'withdrawn'
          : undefined
    }
    const handle: ProducerHandle<K> = {
      key: input.key,
      producer: input.producer,
      generation,
      async publish(scope, value): Promise<PublishResult> {
        const reason = refusal()
        if (reason) return { kind: 'rejected', reason }
        const issues = validate(input.declaration.schema, value)
        if (issues.length) return { kind: 'rejected', reason: 'shape', issues }
        const s = state(scope)
        if (s) put(s, input.key, value, generation, true)
        return { kind: 'published', scope, revision: s?.values.get(input.key)?.revision ?? 0 }
      },
      async invalidate(scope): Promise<InvalidateResult> {
        const reason = refusal()
        if (reason) return { kind: 'rejected', reason }
        const targets = [...scopes.values()].filter(
          s => (!scope || scope.ref === s.scope.ref) && s.registrations.has(input.key),
        )
        for (const s of targets) {
          put(s, input.key, undefined, generation, false)
          if (!producer.scoped && input.declaration.volatility !== 'per-request')
            await supply(producer, s)
        }
        return { kind: 'invalidated', scopes: targets.map(s => s.scope) }
      },
      async dispose() {
        if (!producer.active) return
        producer.active = false
        for (const s of scopes.values())
          if (s.registrations.has(input.key))
            put(s, input.key, undefined, generation, false, 'producer-withdrawn')
      },
    }
    return { kind: 'registered', handle } as const
  }
  async function applyCommit(input: CommitInput): Promise<ApplyCommitResult> {
    if (closed) return { kind: 'refused', reason: 'closed' }
    const scope = input.kind === 'registration' ? input.change.scope : input.stepCommit.scope
    const replay = commits.get(scope.ref + '\0' + input.commit.commit)
    if (replay)
      return isDeepStrictEqual(replay.input, input)
        ? replay.result
        : { kind: 'invalid', reason: 'commit-conflict', current: state(scope)?.revision ?? 0 }
    let s = state(scope)
    if (input.kind === 'registration') {
      const applied = await applyRegistration(input.change, s)
      if ('kind' in applied) return applied
      s = applied
    } else {
      if (!s) return { kind: 'invalid', reason: 'registration', current: 0 }
      const rejected = applyStep(input, s)
      if (rejected) return rejected
    }
    const result: ApplyCommitResult = {
      kind: 'applied',
      registrationRevision: s.revision,
      viewRevision: s.view,
    }
    commits.set(scope.ref + '\0' + input.commit.commit, { input, result })
    return result
  }
  async function applyRegistration(
    change: RegistrationChange,
    s: ScopeState | undefined,
  ): Promise<ScopeState | ApplyCommitResult> {
    if (change.basedOn !== (s?.revision ?? 0))
      return { kind: 'invalid', reason: 'out-of-order', current: s?.revision ?? 0 }
    const judged = judgeRegistration(change, {
      descriptors: catalog,
      scopeTenant: s?.tenant ?? null,
      existing: s?.registrations.get(change.key) ?? null,
      creating: change.creating,
    })
    if ('failure' in judged)
      return {
        kind: 'invalid',
        reason: judged.failure.some(r => r.reason === 'tenant-mismatch')
          ? 'tenant-mismatch'
          : 'registration',
        current: s?.revision ?? 0,
        rejections: judged.failure,
      }
    if (!s) {
      s = {
        scope: change.scope,
        tenant: change.tenant,
        revision: 0,
        view: 0,
        epoch: 0,
        registrations: new Map(),
        values: new Map(),
      }
      scopes.set(change.scope.ref, s)
    }
    storeRegistration(change, s)
    changed(s, change.key)
    const producer = producers.get(change.key)
    if (
      change.kind !== 'remove' &&
      producer &&
      !producer.scoped &&
      descriptors.get(change.key)?.volatility !== 'per-request'
    )
      await supply(producer, s)
    return s
  }
  function storeRegistration(change: RegistrationChange, s: ScopeState) {
    if (change.kind === 'add' && change.declaration) descriptors.set(change.key, change.declaration)
    s.revision++
    s.epoch++
    incompatible.delete(s.scope.ref + '\0' + change.key)
    if (change.kind === 'remove') {
      s.registrations.delete(change.key)
      s.values.delete(change.key)
    } else {
      s.registrations.set(change.key, {
        scope: change.scope,
        tenant: change.tenant,
        key: change.key,
        bindings: change.bindings,
        parameters: change.parameters,
        required:
          change.kind === 'add'
            ? change.required
            : (s.registrations.get(change.key)?.required ?? false),
        revision: s.revision,
      })
    }
  }
  function applyStep(
    input: Extract<CommitInput, { kind: 'step' }>,
    s: ScopeState,
  ): ApplyCommitResult | undefined {
    const reduced = reduceStep({
      scope: s.scope,
      step: input.stepCommit.step,
      updates: input.stepCommit.committed.flatMap(item => item.updates),
      descriptors: catalog,
      current: key => s?.values.get(key)?.value,
    })
    if (reduced.rejected.length)
      return {
        kind: 'invalid',
        reason: 'rejected-update',
        current: s.revision,
        rejected: reduced.rejected,
      }
    for (const block of input.stepCommit.committed) {
      const material = reduced.committed.find(item => item.key === block.key)
      if (
        block.updates.length > 0 &&
        (!material || !isDeepStrictEqual(material.value, block.value))
      )
        return { kind: 'invalid', reason: 'rejected-update', current: s.revision }
      const d = descriptors.get(block.key)
      if (d?.kind !== 'stateful' || validate(d.schema, block.value).length)
        return { kind: 'invalid', reason: 'rejected-update', current: s.revision }
    }
    for (const block of input.stepCommit.committed) put(s, block.key, block.value, null, true)
    if (input.executionEnded)
      for (const [key, d] of descriptors)
        if (d.kind === 'stateful' && d.persistence === 'untracked' && s.registrations.has(key))
          put(s, key, undefined, null, false)
    return undefined
  }
  async function issueEligibility(material: EligibilityMaterial<P>) {
    if (closed) return { kind: 'refused', reason: 'closed' } as const
    if (material.supersedes && !currentEligibility(material.supersedes))
      return { kind: 'refused', reason: 'supersedes-unknown' } as const
    for (const key of material.keys) {
      const d = descriptors.get(key)
      if (d && !d.consumers.includes(material.consumer))
        return { kind: 'refused', reason: 'unauthorized' } as const
    }
    for (const ref of material.bindings) {
      const reg = registration(material.scope, ref.key)
      const binding = reg?.r.bindings.find(b => b.need.name === ref.need)
      if (!binding?.translate || binding.need.consumer !== material.consumer)
        return { kind: 'refused', reason: 'unauthorized' } as const
    }
    const id = { eligibility: 'eligibility-' + ++serial }
    const eligibility: Eligibility<P> = { ...material, id, state: { kind: 'valid' } }
    eligibilities.set(id.eligibility, eligibility)
    if (material.supersedes) {
      const old = eligibilities.get(material.supersedes.eligibility)
      if (old)
        eligibilities.set(old.id.eligibility, { ...old, state: { kind: 'superseded', by: id } })
    }
    return { kind: 'issued', eligibility } as const
  }
  function inheritedValue(
    found: { s: ScopeState; r: Registration },
    key: ContextBlockKey,
    d: Descriptor,
    tenant: TenantId,
  ) {
    let stored = found.s.values.get(key)
    if (d.volatility !== 'per-request') {
      let parent = found.s.scope.parent
      while (!stored?.present && parent) {
        const candidate = registration(parent, key)
        if (!candidate) break
        if (!tenantEquals(candidate.s.tenant, tenant)) break
        const value = candidate.s.values.get(key)
        if (value?.present) {
          found = candidate
          stored = value
          break
        }
        parent = candidate.s.scope.parent
      }
    }
    return { found, stored }
  }
  async function bind(id: EligibilityId) {
    if (closed) return { kind: 'refused', reason: 'closed' } as const
    const initial = currentEligibility(id)
    if (!initial) return { kind: 'refused', reason: 'unauthorized' } as const
    const boundScope = initial.scope
    const boundConsumer = initial.consumer
    let ended = false
    const cursors = new Map<
      string,
      { view: number; epoch: number; eligibility: string; snapshot: Snapshot }
    >()
    function eligible(): ReadOutcome<Eligibility<P>> {
      if (closed || ended) return { kind: 'refused', reason: 'closed' }
      const e = currentEligibility(id),
        s = state(boundScope)
      if (!e || !s || e.consumer !== boundConsumer || !tenantEquals(s.tenant, e.tenant))
        return { kind: 'refused', reason: 'unauthorized' }
      return {
        kind: 'success',
        value: e,
        registration: { issued: e.registrationRevision, current: s.revision },
      }
    }
    async function readPerRequest(
      e: Eligibility<P>,
      key: ContextBlockKey,
      d: Descriptor,
      source: ScopeState,
    ): Promise<Stored | PerRequestEntry> {
      const producer = producers.get(key)
      if (!producer?.active || !producer.supply)
        return d.required
          ? { key, kind: 'missing', cause: 'producer-withdrawn' }
          : { key, kind: 'none' }
      try {
        const result = await producer.supply(e.scope)
        if (!producer.active || producers.get(key) !== producer)
          return { key, kind: 'missing', cause: 'producer-withdrawn' }
        if (result.kind === 'value') {
          if (validate(d.schema, result.value).length)
            return { key, kind: 'missing', cause: 'uninterpretable' }
          return {
            value: result.value,
            revision: source.values.get(key)?.revision ?? 0,
            generation: producer.generation,
            present: true,
          }
        } else
          return result.kind === 'unavailable'
            ? { key, kind: 'missing', cause: 'source-unavailable' }
            : d.required
              ? { key, kind: 'missing', cause: 'no-value' }
              : { key, kind: 'none' }
      } catch {
        return { key, kind: 'unknown', cause: 'source-unknown' }
      }
    }
    async function readBlock(e: Eligibility<P>, key: ContextBlockKey): Promise<PerRequestEntry> {
      let found = registration(e.scope, key)
      const d = descriptors.get(key)
      if (!found || !d || incompatible.has(found.s.scope.ref + '\0' + key))
        return { key, kind: 'missing', cause: 'no-value' }
      if (!tenantEquals(found.s.tenant, e.tenant))
        return { key, kind: 'missing', cause: 'no-value' }
      const inherited = inheritedValue(found, key, d, e.tenant)
      found = inherited.found
      let stored = inherited.stored
      if (stored?.unknown) return { key, kind: 'unknown', cause: 'source-unknown' }
      if (d.volatility === 'per-request') {
        const supplied = await readPerRequest(e, key, d, found.s)
        if ('kind' in supplied) return supplied
        stored = supplied
      }
      if (!stored?.present)
        return d.required
          ? { key, kind: 'missing', cause: stored?.cause ?? 'no-value' }
          : { key, kind: 'none' }
      const evidence: SourceEvidence = {
        key,
        revision: stored.revision,
        scope: found.s.scope,
        generation: stored.generation,
      }
      return { key, kind: 'value', value: stored.value, evidence }
    }
    async function snapshot(): Promise<SnapshotResult> {
      const checked = eligible()
      if (checked.kind !== 'success') return checked
      const e = checked.value,
        s = state(e.scope)
      if (!s) return { kind: 'refused', reason: 'no-registration' }
      const blocks: BlockEntry[] = [],
        missing: MissingItem[] = [],
        perRequest: PerRequestEntry[] = []
      for (const key of e.keys) {
        if (!allowed(e, key)) return { kind: 'refused', reason: 'unauthorized' }
        if (!registration(e.scope, key))
          return {
            kind: 'refused',
            reason:
              descriptors.get(key)?.disclosure === 'plain' ? 'no-registration' : 'unauthorized',
          }
        const item = await readBlock(e, key),
          d = descriptors.get(key)
        if (d?.volatility === 'per-request') {
          perRequest.push(item)
          continue
        }
        if (item.kind === 'unknown') return { kind: 'unknown', cause: item.cause }
        if (item.kind === 'missing') {
          missing.push({
            key,
            cause: item.cause,
            revision: registration(e.scope, key)?.s.values.get(key)?.revision ?? null,
          })
          continue
        }
        if (!d) continue
        const found = registration(e.scope, key),
          revision =
            item.kind === 'value'
              ? item.evidence.revision
              : (found?.s.values.get(key)?.revision ?? 0)
        blocks.push({
          key,
          revision,
          state: item.kind === 'value' ? { kind: 'value', value: item.value } : { kind: 'none' },
          volatility: d.volatility,
          evidence:
            item.kind === 'value'
              ? item.evidence
              : { key, revision, scope: found?.s.scope ?? e.scope, generation: null },
        })
      }
      const cursor = { cursor: 'cursor-' + ++serial }
      const value: Snapshot = {
        scope: e.scope,
        viewRevision: s.view,
        cursor,
        blocks,
        missing,
        perRequest,
      }
      cursors.set(cursor.cursor, {
        view: s.view,
        epoch: s.epoch,
        eligibility: e.id.eligibility,
        snapshot: value,
      })
      return { kind: 'success', value, registration: checked.registration }
    }
    function authorizeNeed(
      e: Eligibility<P>,
      ref: NeedRequest,
    ):
      | { found: { s: ScopeState; r: Registration }; binding: import('../need.js').NeedBinding }
      | Extract<ReadResult, { kind: 'refused' }> {
      if (
        !e.keys.includes(ref.key) &&
        !e.bindings.some(binding => binding.key === ref.key && binding.need === ref.need)
      )
        return { kind: 'refused', reason: 'unauthorized' }
      const found = registration(e.scope, ref.key)
      if (!found)
        return {
          kind: 'refused',
          reason:
            descriptors.get(ref.key)?.disclosure === 'plain' ? 'no-registration' : 'unauthorized',
        }
      const binding = found?.r.bindings.find(b => b.need.name === ref.need)
      if (!binding || binding.need.consumer !== e.consumer)
        return { kind: 'refused', reason: 'unauthorized' }
      if (binding.translate) {
        if (
          !e.bindings.some(b => b.key === ref.key && b.need === ref.need) ||
          !descriptors.get(ref.key)?.consumers.includes(binding.integrator)
        )
          return { kind: 'refused', reason: 'unauthorized' }
      } else if (!allowed(e, ref.key)) return { kind: 'refused', reason: 'unauthorized' }
      return { found, binding }
    }
    const reader: ContextReader = {
      consumer: initial.consumer,
      scope: initial.scope,
      snapshot,
      async changes(cursor): Promise<ChangesResult> {
        const checked = eligible()
        if (checked.kind !== 'success') return checked
        const previous = cursors.get(cursor.cursor),
          s = state(checked.value.scope)
        if (
          !previous ||
          !s ||
          previous.epoch !== s.epoch ||
          previous.eligibility !== checked.value.id.eligibility ||
          s.view - previous.view > (options.retention ?? 64)
        )
          return { kind: 'cursor-invalidated' }
        const next = await snapshot()
        if (next.kind !== 'success') return next
        const prior = new Map(previous.snapshot.blocks.map(b => [b.key, b]))
        return {
          kind: 'success',
          registration: next.registration,
          value: {
            scope: next.value.scope,
            from: previous.view,
            to: next.value.viewRevision,
            cursor: next.value.cursor,
            entries: next.value.blocks.filter(b => prior.get(b.key)?.revision !== b.revision),
            missing: next.value.missing,
            perRequest: next.value.perRequest,
          },
        }
      },
      async read(needs: readonly NeedRequest[]): Promise<ReadResult> {
        const checked = eligible()
        if (checked.kind !== 'success') return checked
        const e = checked.value,
          values: import('../reader.js').NeedValue[] = [],
          missing: MissingItem[] = []
        for (const ref of needs) {
          const authorized = authorizeNeed(e, ref)
          if ('kind' in authorized) return authorized
          const { found, binding } = authorized
          const item = await readBlock(e, ref.key)
          if (item.kind === 'unknown') return { kind: 'unknown', cause: item.cause }
          if (item.kind !== 'value') {
            if (binding.need.necessity === 'optional') values.push({ kind: 'none', need: ref.need })
            else
              missing.push({
                key: ref.key,
                cause: item.kind === 'missing' ? item.cause : 'no-value',
                revision: found?.s.values.get(ref.key)?.revision ?? null,
              })
            continue
          }
          try {
            const value = binding.translate ? binding.translate(item.value) : item.value
            if (validate(binding.need.shape, value).length) throw new Error('translation shape')
            values.push({ kind: 'value', need: ref.need, value, evidence: item.evidence })
          } catch {
            missing.push({
              key: ref.key,
              cause: 'translation-failed',
              revision: item.evidence.revision,
            })
          }
        }
        return missing.length
          ? { kind: 'missing', items: missing }
          : { kind: 'success', value: values, registration: checked.registration }
      },
      async end() {
        ended = true
        cursors.clear()
      },
    }
    return { kind: 'bound', reader } as const
  }
  return {
    durability: 'none',
    registerProducer,
    applyCommit,
    issueEligibility,
    bind,
    async prepareRegistration(change: RegistrationChange) {
      if (closed) return { kind: 'refused', reason: 'closed' }
      const s = state(change.scope)
      const result = judgeRegistration(change, {
        descriptors: catalog,
        scopeTenant: s?.tenant ?? null,
        existing: s?.registrations.get(change.key) ?? null,
        creating: change.creating,
      })
      return 'failure' in result
        ? { kind: 'rejected', rejections: result.failure }
        : { kind: 'prepared', judged: result.ok, currentRevision: s?.revision ?? 0 }
    },
    async revokeEligibility(id) {
      if (closed) return { kind: 'refused', reason: 'closed' }
      const e = eligibilities.get(id.eligibility)
      if (!e) return { kind: 'refused', reason: 'unknown-eligibility' }
      eligibilities.set(id.eligibility, { ...e, state: { kind: 'revoked' } })
      return { kind: 'revoked' }
    },
    async close() {
      closed = true
      listeners.clear()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
