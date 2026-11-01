import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  BindResult,
  BlockEntry,
  ChangesResult,
  ConsumerClass,
  ContextBlockKey,
  ContextReader,
  Eligibility,
  EligibilityId,
  MissingItem,
  NeedBinding,
  NeedRequest,
  NeedValue,
  PerRequestEntry,
  ReadRefusalReason,
  ReadResult,
  Registration,
  Snapshot,
  SnapshotResult,
  SourceEvidence,
  UnknownCause,
} from '@omne-harness/runtime-context-contract'
import { validate } from './validation.js'
import {
  isFailure,
  tenantText,
  type Authorized,
  type CachedItem,
  type CachedRead,
  type Descriptor,
  type ScopeState,
  type Stored,
  type World,
} from './world.js'
import type { Supplier, SupplyOutcome } from './producer.js'

type Found = { s: ScopeState; r: Registration }
type Refusal = Readonly<{ kind: 'refused'; reason: ReadRefusalReason }>
type CheckRefusal = Readonly<{
  kind: 'refused'
  reason: 'unauthorized' | 'scope-ended' | 'replay-incomplete' | 'closed'
}>
type CheckUnknownRead = Readonly<{
  kind: 'unknown'
  cause: 'eligibility-unknown' | 'scope-binding-unknown'
}>
type Unknown = Readonly<{ kind: 'unknown'; cause: UnknownCause }>
type Checked<P> = Readonly<{
  kind: 'checked'
  e: Eligibility<P>
  s: ScopeState
  gate: Authorized<P>
}>
type Item = PerRequestEntry | Refusal

/** What a Cordis caller declared in its intercept configuration; `consumer` is absent when it declared none. */
export type BindCaller = Readonly<{ consumer?: ConsumerClass | undefined }>

function cacheable(item: Item): item is CachedItem {
  return item.kind === 'value' || item.kind === 'none' || item.kind === 'missing'
}

export function createReaders<P>(world: World<P>, supplier: Supplier<P>) {
  function allowed(e: Eligibility<P>, key: ContextBlockKey) {
    const d = world.descriptors.get(key)
    return e.keys.includes(key) && !!d?.consumers.includes(e.consumer)
  }

  function scopeRefusal(s: ScopeState | undefined): CheckRefusal | undefined {
    if (s?.ended) return { kind: 'refused', reason: 'scope-ended' }
    if (!s || s.fence !== 'open') return { kind: 'refused', reason: 'replay-incomplete' }
    return undefined
  }

  /** Reader authority, then the trusted binding, then the scope state (RC-03 核对顺序). */
  async function check(e: Eligibility<P>): Promise<Checked<P> | CheckRefusal | CheckUnknownRead> {
    const decided = await world.decide(() => world.trust.authority.reader(e.principal, e))
    if (isFailure(decided)) {
      if (decided.kind === 'refused') return { kind: 'refused', reason: decided.reason }
      return { kind: 'unknown', cause: 'eligibility-unknown' }
    }
    const unbound = await world.bound(e.scope, e.tenant)
    if (unbound)
      return unbound.kind === 'refused'
        ? { kind: 'refused', reason: unbound.reason }
        : { kind: 'unknown', cause: 'scope-binding-unknown' }
    const s = world.state(e.scope)
    const refusal = scopeRefusal(s)
    if (refusal || !s) return refusal ?? { kind: 'refused', reason: 'replay-incomplete' }
    if (!tenantEquals(s.tenant, e.tenant)) return { kind: 'refused', reason: 'unauthorized' }
    return { kind: 'checked', e, s, gate: decided }
  }

  /** Walks the parent chain; every hop checks its own binding and tenant (RC-03). */
  async function inheritedValue(
    found: Found,
    key: ContextBlockKey,
    d: Descriptor,
    e: Eligibility<P>,
  ) {
    let stored = found.s.values.get(key)
    if (d.volatility === 'per-request') return { found, stored }
    let parent = found.s.scope.parent
    while (!stored?.present && parent) {
      const candidate = world.registration(parent, key)
      if (!candidate || !tenantEquals(candidate.s.tenant, e.tenant)) break
      if (await world.bound(candidate.s.scope, e.tenant)) break
      const value = candidate.s.values.get(key)
      if (value?.present) return { found: candidate, stored: value }
      parent = candidate.s.scope.parent
    }
    return { found, stored }
  }

  function fromOutcome(
    key: ContextBlockKey,
    d: Descriptor,
    outcome: SupplyOutcome,
  ): PerRequestEntry | Refusal | null {
    switch (outcome.kind) {
      case 'refused':
        return { kind: 'refused', reason: 'unauthorized' }
      case 'unknown':
        return { key, kind: 'unknown', cause: 'source-unknown' }
      case 'unavailable':
        return { key, kind: 'missing', cause: 'source-unavailable' }
      case 'uninterpretable':
        return { key, kind: 'missing', cause: 'uninterpretable' }
      case 'none':
        return d.required ? { key, kind: 'missing', cause: 'no-value' } : { key, kind: 'none' }
      default:
        return null
    }
  }

  async function perRequest(
    key: ContextBlockKey,
    d: Descriptor,
    source: ScopeState,
  ): Promise<{ entry: PerRequestEntry | Refusal } | { stored: Stored }> {
    const producer = supplier.producerFor(source, key)
    if (!producer || !supplier.isCurrent(producer) || !producer.supply)
      return {
        entry: d.required
          ? { key, kind: 'missing', cause: 'producer-withdrawn' }
          : { key, kind: 'none' },
      }
    const outcome = await supplier.supplyOnce(producer, source, false)
    if (outcome.kind === 'value')
      return {
        stored: {
          value: outcome.value,
          revision: source.values.get(key)?.revision ?? 0,
          generation: outcome.generation,
          present: true,
        },
      }
    if (outcome.kind === 'stale')
      return { entry: { key, kind: 'missing', cause: 'producer-withdrawn' } }
    return {
      entry: fromOutcome(key, d, outcome) ?? { key, kind: 'unknown', cause: 'source-unknown' },
    }
  }

  let refreshing = 0

  /**
   * The fourth supply time point: an ordinary read finds a refresh mark left by a finished replay
   * (RC-09). Concurrent reads of one mark join one source call; distinct marks are limited by the
   * concurrency bound; a failed mark waits out the retry interval. A read that does not call the
   * source keeps the mark and reports what is stored, or unknown when nothing is stored.
   */
  async function refresh(
    found: Found,
    key: ContextBlockKey,
    d: Descriptor,
  ): Promise<PerRequestEntry | Refusal | null> {
    const s = found.s
    if (s.needsSupply.get(key) !== s.replayEpoch) return null
    const producer = supplier.producerFor(s, key)
    if (!producer || !supplier.isCurrent(producer) || !producer.supply) return null
    const id = s.scope.ref + '\0' + key
    const joined = world.refreshes.get(id)
    if (joined?.epoch === s.replayEpoch) {
      await joined.done
      return refreshedEntry(s, key, d)
    }
    const failedAt = s.refreshFailedAt.get(key)
    if (failedAt !== undefined && Date.now() - failedAt < world.config.refreshRetryMs) {
      world.diagnose({ kind: 'refresh-deferred', key, reason: 'retry-interval' })
      return refreshedEntry(s, key, d)
    }
    if (refreshing >= world.config.refreshConcurrency) {
      world.diagnose({ kind: 'refresh-deferred', key, reason: 'concurrency' })
      return refreshedEntry(s, key, d)
    }
    refreshing++
    const attempt = supplier.supplyOnce(producer, s, true)
    const entry = { epoch: s.replayEpoch, done: attempt }
    world.refreshes.set(id, entry)
    let outcome: SupplyOutcome
    try {
      outcome = await attempt
    } finally {
      refreshing--
      if (world.refreshes.get(id) === entry) world.refreshes.delete(id)
    }
    if (outcome.kind === 'value' || outcome.kind === 'none' || outcome.kind === 'stale') return null
    s.refreshFailedAt.set(key, Date.now())
    return fromOutcome(key, d, outcome)
  }

  /** After a joined or skipped refresh: a cleared mark reads the stored value; a kept one, the stored failure. */
  function refreshedEntry(s: ScopeState, key: ContextBlockKey, d: Descriptor): Item | null {
    if (s.needsSupply.get(key) !== s.replayEpoch) return null
    const stored = s.values.get(key)
    if (stored?.refused) return { kind: 'refused', reason: 'unauthorized' }
    if (stored?.cause === 'source-unavailable' || stored?.cause === 'uninterpretable')
      return d.required ? { key, kind: 'missing', cause: stored.cause } : { key, kind: 'none' }
    return { key, kind: 'unknown', cause: 'source-unknown' }
  }

  async function readBlock(e: Eligibility<P>, key: ContextBlockKey): Promise<Item> {
    let found = world.registration(e.scope, key)
    const d = world.descriptors.get(key)
    if (!found || !d || world.incompatible.has(found.s.scope.ref + '\0' + key))
      return { key, kind: 'missing', cause: 'no-value' }
    if (!tenantEquals(found.s.tenant, e.tenant)) return { key, kind: 'missing', cause: 'no-value' }
    if (d.kind === 'supplied' && d.volatility !== 'per-request') {
      const refreshed = await refresh(found, key, d)
      if (refreshed) return refreshed
    }
    const inherited = await inheritedValue(found, key, d, e)
    found = inherited.found
    let stored = inherited.stored
    if (stored?.refused) return { kind: 'refused', reason: 'unauthorized' }
    if (stored?.unknown) return { key, kind: 'unknown', cause: 'source-unknown' }
    if (d.volatility === 'per-request') {
      const supplied = await perRequest(key, d, found.s)
      if ('entry' in supplied) return supplied.entry
      stored = supplied.stored
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

  /**
   * The read cache sits behind every access check (D4). A read of a scope with a parent, or of a
   * block with a pending refresh mark, is computed, not cached, so the per-hop checks and the
   * restored supply are never skipped.
   */
  function cacheKey(checked: Checked<P>) {
    const { e, s } = checked
    if (!world.cache.enabled || e.scope.parent !== undefined) return undefined
    for (const key of e.keys) if (s.needsSupply.get(key) === s.replayEpoch) return undefined
    const tenant = tenantText(e.tenant)
    if (tenant === undefined) return undefined
    return {
      tenant,
      scope: s.scope.ref,
      eligibility: e.id.eligibility,
      registration: s.revision,
      projection: s.projection,
    }
  }

  async function stableItems(checked: Checked<P>): Promise<Map<ContextBlockKey, Item>> {
    const items = new Map<ContextBlockKey, Item>()
    for (const key of checked.e.keys) {
      if (world.descriptors.get(key)?.volatility === 'per-request') continue
      const item = await readBlock(checked.e, key)
      items.set(key, item)
      if (!cacheable(item)) break
    }
    return items
  }

  /** The stable entries of one snapshot: from the cache when the key matches, otherwise computed. */
  async function readStable(checked: Checked<P>): Promise<ReadonlyMap<ContextBlockKey, Item>> {
    const key = cacheKey(checked)
    const hit = key && world.cache.get(key)
    if (hit) return hit
    const projection = checked.s.projection
    const items = await stableItems(checked)
    const all = [...items.values()]
    if (key && checked.s.projection === projection && all.every(cacheable))
      world.cache.set(key, new Map(all.map(item => [item.key, item])))
    return items
  }

  async function bind(raw: EligibilityId, caller?: BindCaller): Promise<BindResult> {
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    const id = { eligibility: raw.eligibility }
    const initial = world.currentEligibility(id)
    if (!initial) return { kind: 'refused', reason: 'unauthorized' }
    const checked = await check(initial)
    if (checked.kind !== 'checked') return checked
    if (world.closed) return { kind: 'refused', reason: 'closed' }
    if (!checked.gate.current()) return { kind: 'refused', reason: 'unauthorized' }
    // Over Cordis the caller's declared consumer class must match the eligibility; a caller that
    // declared none is refused too. The comparison comes after every access check, so a mismatch
    // discloses nothing an unbound caller could not see. It is a consistency check, not access control.
    if (caller && caller.consumer !== initial.consumer)
      return { kind: 'refused', reason: 'callerMismatch' }
    return { kind: 'bound', reader: readerOf(id, initial) }
  }

  function readerOf(id: EligibilityId, initial: Eligibility<P>): ContextReader {
    const boundScope = initial.scope
    const boundConsumer = initial.consumer
    let ended = false
    const cursors = new Map<
      string,
      { view: number; epoch: number; eligibility: string; snapshot: Snapshot }
    >()
    function end() {
      ended = true
      cursors.clear()
      world.readers.delete(end)
    }
    world.readers.add(end)

    async function eligible(): Promise<Checked<P> | Refusal | Unknown> {
      if (world.closed || ended) return { kind: 'refused', reason: 'closed' }
      const e = world.currentEligibility(id)
      if (!e || e.consumer !== boundConsumer || e.scope.ref !== boundScope.ref)
        return { kind: 'refused', reason: 'unauthorized' }
      return check(e)
    }
    /** Final synchronous check before disclosure: authority still current, scope still readable. */
    function disclose<T>(checked: Checked<P>, value: T): T | Refusal {
      if (world.closed || ended) return { kind: 'refused', reason: 'closed' }
      if (
        !checked.gate.current() ||
        world.currentEligibility(id)?.id.eligibility !== checked.e.id.eligibility
      )
        return { kind: 'refused', reason: 'unauthorized' }
      return scopeRefusal(world.state(checked.e.scope)) ?? value
    }

    async function snapshot(): Promise<SnapshotResult> {
      const checked = await eligible()
      if (checked.kind !== 'checked') return checked
      const { e, s } = checked
      for (const key of e.keys) {
        if (!allowed(e, key)) return { kind: 'refused', reason: 'unauthorized' }
        if (!world.registration(e.scope, key))
          return {
            kind: 'refused',
            reason:
              world.descriptors.get(key)?.disclosure === 'plain'
                ? 'no-registration'
                : 'unauthorized',
          }
      }
      const stable = await readStable(checked)
      const blocks: BlockEntry[] = [],
        missing: MissingItem[] = [],
        perRequestEntries: PerRequestEntry[] = []
      for (const key of e.keys) {
        const d = world.descriptors.get(key)
        const item = d?.volatility === 'per-request' ? await readBlock(e, key) : stable.get(key)
        if (!item) continue
        if (item.kind === 'refused') return item
        if (d?.volatility === 'per-request') {
          perRequestEntries.push(item)
          continue
        }
        if (item.kind === 'unknown') return { kind: 'unknown', cause: item.cause }
        if (item.kind === 'missing') {
          missing.push({
            key,
            cause: item.cause,
            revision: world.registration(e.scope, key)?.s.values.get(key)?.revision ?? null,
          })
          continue
        }
        if (!d) continue
        const found = world.registration(e.scope, key),
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
      const cursor = { cursor: 'cursor-' + ++world.serial }
      const value: Snapshot = {
        scope: e.scope,
        viewRevision: s.view,
        cursor,
        blocks,
        missing,
        perRequest: perRequestEntries,
      }
      const result = disclose(checked, value)
      if ('kind' in result) return result
      cursors.set(cursor.cursor, {
        view: s.view,
        epoch: s.epoch,
        eligibility: e.id.eligibility,
        snapshot: value,
      })
      return {
        kind: 'success',
        value,
        registration: { issued: e.registrationRevision, current: s.revision },
      }
    }

    function authorizeNeed(
      e: Eligibility<P>,
      ref: NeedRequest,
    ): { found: Found; binding: NeedBinding } | Refusal {
      if (
        !e.keys.includes(ref.key) &&
        !e.bindings.some(b => b.key === ref.key && b.need === ref.need)
      )
        return { kind: 'refused', reason: 'unauthorized' }
      const found = world.registration(e.scope, ref.key)
      if (!found)
        return {
          kind: 'refused',
          reason:
            world.descriptors.get(ref.key)?.disclosure === 'plain'
              ? 'no-registration'
              : 'unauthorized',
        }
      const binding = found.r.bindings.find(b => b.need.name === ref.need)
      if (!binding || binding.need.consumer !== e.consumer)
        return { kind: 'refused', reason: 'unauthorized' }
      if (binding.translate) {
        if (
          !e.bindings.some(b => b.key === ref.key && b.need === ref.need) ||
          !world.descriptors.get(ref.key)?.consumers.includes(binding.integrator)
        )
          return { kind: 'refused', reason: 'unauthorized' }
      } else if (!allowed(e, ref.key)) return { kind: 'refused', reason: 'unauthorized' }
      return { found, binding }
    }

    async function read(needs: readonly NeedRequest[]): Promise<ReadResult> {
      const checked = await eligible()
      if (checked.kind !== 'checked') return checked
      const { e, s } = checked
      const key = cacheKey(checked)
      const cached: CachedRead | undefined = key ? world.cache.get(key) : undefined
      const values: NeedValue[] = [],
        missing: MissingItem[] = []
      for (const ref of needs) {
        const authorized = authorizeNeed(e, ref)
        if ('kind' in authorized) return authorized
        const { found, binding } = authorized
        const item = cached?.get(ref.key) ?? (await readBlock(e, ref.key))
        if (item.kind === 'refused') return item
        if (item.kind === 'unknown') return { kind: 'unknown', cause: item.cause }
        if (item.kind !== 'value') {
          if (binding.need.necessity === 'optional') values.push({ kind: 'none', need: ref.need })
          else
            missing.push({
              key: ref.key,
              cause: item.kind === 'missing' ? item.cause : 'no-value',
              revision: found.s.values.get(ref.key)?.revision ?? null,
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
      const outcome: ReadResult = missing.length
        ? { kind: 'missing', items: missing }
        : {
            kind: 'success',
            value: values,
            registration: { issued: e.registrationRevision, current: s.revision },
          }
      return disclose(checked, outcome)
    }

    async function changes(cursor: { cursor: string }): Promise<ChangesResult> {
      const checked = await eligible()
      if (checked.kind !== 'checked') return checked
      const previous = cursors.get(cursor.cursor),
        s = checked.s
      if (
        !previous ||
        previous.epoch !== s.epoch ||
        previous.eligibility !== checked.e.id.eligibility ||
        s.view - previous.view > world.config.retention
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
    }

    return {
      consumer: initial.consumer,
      scope: initial.scope,
      snapshot: () => world.track(snapshot()),
      changes: cursor => world.track(changes(cursor)),
      read: needs => world.track(read(needs)),
      async end() {
        end()
      },
    }
  }

  return {
    bind: (raw: EligibilityId, caller?: BindCaller) => world.track(bind(raw, caller)),
  }
}
