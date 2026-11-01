import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  ContextBlockKey,
  InvalidateResult,
  InvalidateTarget,
  ProducerHandle,
  ProducerRegistration,
  PublishInput,
  PublishResult,
  RegisterProducerResult,
  ScopeRef,
  SupplyAnswer,
} from '@omne-harness/runtime-context-contract'
import { declarationDigest } from '@omne-harness/runtime-context-contract'
import { validate } from './validation.js'
import {
  CANCELLED,
  isFailure,
  ownData,
  ownScope,
  tenantText,
  within,
  type Authorized,
  type CheckFailure,
  type Producer,
  type ScopeState,
  type World,
} from './world.js'

/** How one supply attempt ended, for the read that may have triggered it. */
export type SupplyOutcome =
  | Readonly<{ kind: 'stored' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{ kind: 'value'; value: unknown; generation: number }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'uninterpretable' }>

export type Supplier<P> = ReturnType<typeof createSupplier<P>>

const TIMEOUT: unique symbol = Symbol('supply-timeout')

type HandleRefusal = 'closed' | 'withdrawn' | 'stale-generation'

function isAnswer(value: unknown): value is SupplyAnswer<unknown> {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false
  switch (value.kind) {
    case 'value':
      return 'value' in value
    case 'none':
    case 'unavailable':
    case 'refused':
    case 'unknown':
      return true
    default:
      return false
  }
}

/** Producer-face results carry `closed` as a rejection, not as a refusal. */
function producerResult(
  failure: CheckFailure,
):
  | Readonly<{ kind: 'rejected'; reason: 'closed' }>
  | Exclude<CheckFailure, Readonly<{ reason: 'closed' }>> {
  return failure.kind === 'refused' && failure.reason === 'closed'
    ? { kind: 'rejected', reason: 'closed' }
    : failure.kind === 'refused'
      ? { kind: 'refused', reason: 'unauthorized' }
      : failure
}

export function createSupplier<P>(world: World<P>) {
  function slot(tenant: Producer<P>['tenant'], key: ContextBlockKey): string | undefined {
    const text = tenantText(tenant)
    return text === undefined ? undefined : text + '\0' + key
  }
  function producerFor(s: ScopeState, key: ContextBlockKey): Producer<P> | undefined {
    const id = slot(s.tenant, key)
    return id === undefined ? undefined : world.producers.get(id)
  }
  function isCurrent(producer: Producer<P>): boolean {
    return (
      producer.active && world.producers.get(producer.tenantText + '\0' + producer.key) === producer
    )
  }
  async function producerGate(
    producer: Producer<P>,
    kind: 'publish' | 'invalidate' | 'supply',
    scope: ScopeRef,
  ): Promise<Authorized<P> | CheckFailure> {
    const decided = await world.decide(() =>
      world.trust.authority.producer(producer.principal, {
        kind,
        scope,
        tenant: producer.tenant,
        key: producer.key,
        producer: producer.producer,
      }),
    )
    if (isFailure(decided))
      return decided.kind === 'invalid' ? { kind: 'unknown', cause: 'authority' } : decided
    return (await world.bound(scope, producer.tenant)) ?? decided
  }
  async function callSource(
    producer: Producer<P>,
    scope: ScopeRef,
    principal: P,
  ): Promise<SupplyAnswer<unknown> | typeof TIMEOUT | typeof CANCELLED> {
    const supply = producer.supply
    if (!supply) return { kind: 'none' }
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: Promise<unknown>
    try {
      pending = supply({ scope, tenant: producer.tenant, principal })
    } catch {
      return { kind: 'unknown' }
    }
    producer.inFlight.add(pending)
    try {
      const answer: unknown = await world.wait(
        Promise.race([
          pending,
          new Promise<typeof TIMEOUT>(resolve => {
            timer = setTimeout(() => resolve(TIMEOUT), world.config.supplyBoundMs)
          }),
        ]),
      )
      if (answer === TIMEOUT) {
        world.diagnose({
          kind: 'supply-timeout',
          key: producer.key,
          generation: producer.generation,
        })
        return TIMEOUT
      }
      if (answer === CANCELLED) return CANCELLED
      return isAnswer(answer) ? answer : { kind: 'unknown' }
    } catch {
      return { kind: 'unknown' }
    } finally {
      clearTimeout(timer)
      producer.inFlight.delete(pending)
    }
  }

  /**
   * One bounded supply attempt for one scope (RC-07 回调协议): authorize before, re-authorize after,
   * then a final synchronous check of generation, replay epoch, sequence, end and registration.
   */
  async function supplyOnce(
    producer: Producer<P>,
    s: ScopeState,
    store: boolean,
  ): Promise<SupplyOutcome> {
    if (!producer.supply || !isCurrent(producer)) return { kind: 'stale' }
    const epoch = s.replayEpoch
    // A per-request read keeps no stored value, so concurrent reads do not supersede each other.
    const seq = store ? world.nextSeq(s, producer.key) : (s.supplySeq.get(producer.key) ?? 0)
    const before = await producerGate(producer, 'supply', s.scope)
    if ('kind' in before) return gateOutcome(before)
    const answer = await callSource(producer, { ...s.scope }, before.principal)
    if (answer === CANCELLED) return { kind: 'stale' }
    const after = await producerGate(producer, 'supply', s.scope)
    if ('kind' in after) return gateOutcome(after)
    const fresh =
      before.current() &&
      after.current() &&
      isCurrent(producer) &&
      !world.closed &&
      world.state(s.scope) === s &&
      s.replayEpoch === epoch &&
      s.supplySeq.get(producer.key) === seq &&
      !s.ended &&
      s.registrations.has(producer.key)
    if (!fresh) {
      world.diagnose({ kind: 'late-supply', key: producer.key, generation: producer.generation })
      return { kind: 'stale' }
    }
    const outcome = classify(producer, answer)
    if (store) record(producer, s, outcome)
    return outcome
  }

  function gateOutcome(failure: CheckFailure): SupplyOutcome {
    if (failure.kind === 'refused')
      return failure.reason === 'closed' ? { kind: 'stale' } : { kind: 'refused' }
    return { kind: failure.kind }
  }

  function classify(
    producer: Producer<P>,
    answer: SupplyAnswer<unknown> | typeof TIMEOUT,
  ): SupplyOutcome {
    if (answer === TIMEOUT) return { kind: 'unknown' }
    switch (answer.kind) {
      case 'value': {
        const owned = ownData(answer.value)
        if (!owned || validate(producer.declaration.schema, owned.value).length) {
          world.diagnose({
            kind: 'uninterpretable-supply',
            key: producer.key,
            generation: producer.generation,
          })
          return { kind: 'uninterpretable' }
        }
        return { kind: 'value', value: owned.value, generation: producer.generation }
      }
      case 'none':
        return { kind: 'none' }
      case 'unavailable':
        return { kind: 'unavailable' }
      case 'refused':
        return { kind: 'refused' }
      default:
        return { kind: 'unknown' }
    }
  }

  function record(producer: Producer<P>, s: ScopeState, outcome: SupplyOutcome) {
    const key = producer.key
    switch (outcome.kind) {
      case 'value':
        world.put(s, key, outcome.value, producer.generation, true)
        s.needsSupply.delete(key)
        s.refreshFailedAt.delete(key)
        return
      case 'none':
        world.put(s, key, undefined, producer.generation, false, 'no-value')
        s.needsSupply.delete(key)
        s.refreshFailedAt.delete(key)
        return
      case 'unavailable':
        world.put(s, key, undefined, producer.generation, false, 'source-unavailable')
        return
      case 'uninterpretable':
        world.put(s, key, undefined, producer.generation, false, 'uninterpretable')
        return
      case 'unknown':
      case 'refused':
        s.values.set(key, {
          value: undefined,
          present: false,
          revision: (s.values.get(key)?.revision ?? 0) + 1,
          generation: producer.generation,
          ...(outcome.kind === 'unknown' ? { unknown: true } : { refused: true }),
        })
        world.changed(s, key)
        return
      default:
        return
    }
  }

  function drivesSupply(producer: Producer<P>): boolean {
    return !producer.scoped && producer.declaration.volatility !== 'per-request'
  }

  /** The first supply time point: the holder registered the block for this scope. */
  async function afterRegistration(s: ScopeState, key: ContextBlockKey) {
    const producer = producerFor(s, key)
    if (producer && drivesSupply(producer) && s.fence === 'open' && !s.ended)
      await supplyOnce(producer, s, true)
  }

  function ownRegistration<K extends ContextBlockKey>(
    input: ProducerRegistration<K, P>,
  ): ProducerRegistration<K, P> {
    return { ...input, producer: { producer: input.producer.producer } }
  }

  function admission<K extends ContextBlockKey>(
    input: ProducerRegistration<K, P>,
    id: string,
  ): Extract<RegisterProducerResult<K>, { kind: 'rejected' }> | undefined {
    if (!input.declaration) return { kind: 'rejected', reason: 'declaration-missing' }
    const old = world.producers.get(id),
      descriptor = world.descriptors.get(input.key)
    if (descriptor && declarationDigest(descriptor) !== declarationDigest(input.declaration))
      return { kind: 'rejected', reason: 'declaration-mismatch' }
    if (old?.active && old.producer.producer !== input.producer.producer)
      return { kind: 'rejected', reason: 'other-producer' }
    if ((!input.scoped || input.declaration.volatility === 'per-request') && !input.supply)
      return { kind: 'rejected', reason: 'declaration-missing' }
    return undefined
  }

  /**
   * The new generation replaces the old one in every scope of its tenant: the stored value goes,
   * cursors are invalidated, and a scope-independent block is supplied again.
   */
  async function replaceInScopes(producer: Producer<P>) {
    for (const s of world.scopes.values()) {
      if (!s.registrations.has(producer.key) || !tenantEquals(s.tenant, producer.tenant)) continue
      s.epoch++
      s.values.delete(producer.key)
      world.nextSeq(s, producer.key)
      world.touch(s)
      if (world.incompatible.has(s.scope.ref + '\0' + producer.key)) continue
      if (drivesSupply(producer) && s.fence === 'open' && !s.ended)
        await supplyOnce(producer, s, true)
    }
  }

  async function registerProducer<K extends ContextBlockKey>(
    principal: P,
    raw: ProducerRegistration<K, P>,
  ): Promise<RegisterProducerResult<K>> {
    if (world.closed) return { kind: 'rejected', reason: 'closed' }
    const input = ownRegistration(raw)
    const id = slot(input.tenant, input.key)
    if (id === undefined) return { kind: 'refused', reason: 'unauthorized' }
    const decided = await world.decide(() =>
      world.trust.authority.producer(principal, {
        kind: 'register',
        tenant: input.tenant,
        key: input.key,
        producer: input.producer,
      }),
    )
    if (isFailure(decided))
      return decided.kind === 'invalid'
        ? { kind: 'unknown', cause: 'authority' }
        : producerResult(decided)
    if (world.closed) return { kind: 'rejected', reason: 'closed' }
    const rejected = admission(input, id)
    if (rejected) return rejected
    if (!decided.current()) return { kind: 'refused', reason: 'unauthorized' }
    const old = world.producers.get(id)
    if (old) old.active = false
    const generation = (world.generations.get(id) ?? 0) + 1
    world.generations.set(id, generation)
    const producer: Producer<P> = {
      key: input.key,
      tenant: input.tenant,
      tenantText: id.slice(0, id.length - input.key.length - 1),
      producer: input.producer,
      principal,
      generation,
      active: true,
      scoped: input.scoped,
      supply: input.supply,
      declaration: input.declaration,
      inFlight: new Set(),
    }
    world.producers.set(id, producer)
    world.declare(input.key, input.declaration)
    await replaceInScopes(producer)
    if (world.closed) return { kind: 'rejected', reason: 'closed' }
    return { kind: 'registered', handle: handleOf(producer, input) }
  }

  function handleOf<K extends ContextBlockKey>(
    producer: Producer<P>,
    input: ProducerRegistration<K, P>,
  ): ProducerHandle<K> {
    function refusal(): HandleRefusal | undefined {
      if (world.closed) return 'closed'
      if (producer.active) return undefined
      return world.producers.get(producer.tenantText + '\0' + producer.key) !== producer
        ? 'stale-generation'
        : 'withdrawn'
    }
    function early(): Readonly<{ kind: 'rejected'; reason: HandleRefusal }> | undefined {
      const reason = refusal()
      if (reason === 'stale-generation')
        world.diagnose({
          kind: 'stale-publication',
          key: producer.key,
          generation: producer.generation,
        })
      return reason ? { kind: 'rejected', reason } : undefined
    }
    function targetState(
      s: ScopeState | undefined,
    ): 'scope-unregistered' | 'scope-ended' | 'replay-incomplete' | undefined {
      if (!s || !s.registrations.has(producer.key))
        return s?.ended ? 'scope-ended' : 'scope-unregistered'
      if (s.ended) return 'scope-ended'
      return s.fence === 'open' ? undefined : 'replay-incomplete'
    }
    async function publish(raw: PublishInput): Promise<PublishResult> {
      const refused = early()
      if (refused) return refused
      const scope = ownScope(raw.scope)
      const owned = ownData(raw.value)
      if (!scope || !tenantEquals(raw.tenant, producer.tenant))
        return { kind: 'refused', reason: 'unauthorized' }
      const gate = await producerGate(producer, 'publish', scope)
      if ('kind' in gate) return producerResult(gate)
      if (!owned)
        return {
          kind: 'rejected',
          reason: 'shape',
          issues: [{ message: 'The value cannot be captured' }],
        }
      const issues = validate(input.declaration.schema, owned.value)
      if (issues.length) return { kind: 'rejected', reason: 'shape', issues }
      const s = world.state(scope)
      const late = early()?.reason ?? targetState(s)
      if (late) return { kind: 'rejected', reason: late }
      if (!gate.current() || !s) return { kind: 'refused', reason: 'unauthorized' }
      world.nextSeq(s, producer.key)
      world.put(s, producer.key, owned.value, producer.generation, true)
      s.needsSupply.delete(producer.key)
      s.refreshFailedAt.delete(producer.key)
      return { kind: 'published', scope, revision: s.values.get(producer.key)?.revision ?? 0 }
    }
    /** Synchronous, so a batch of targets commits in one segment without `await`. */
    function invalidateOne(s: ScopeState) {
      world.nextSeq(s, producer.key)
      world.put(s, producer.key, undefined, producer.generation, false)
    }
    async function invalidateScope(scope: ScopeRef): Promise<InvalidateResult> {
      const gate = await producerGate(producer, 'invalidate', scope)
      if ('kind' in gate) return producerResult(gate)
      const s = world.state(scope)
      const late = refusal() ?? targetState(s)
      if (late) return { kind: 'rejected', reason: late }
      if (!gate.current() || !s) return { kind: 'refused', reason: 'unauthorized' }
      invalidateOne(s)
      if (drivesSupply(producer)) await supplyOnce(producer, s, true)
      return { kind: 'invalidated', scopes: [s.scope] }
    }
    async function tenantBatch(): Promise<InvalidateResult | 'changed'> {
      const version = world.targetsVersion
      const targets = [...world.scopes.values()].filter(
        s =>
          tenantEquals(s.tenant, producer.tenant) &&
          s.registrations.has(producer.key) &&
          !s.ended &&
          s.fence === 'open',
      )
      const gates: Authorized<P>[] = []
      for (const s of targets) {
        const gate = await producerGate(producer, 'invalidate', s.scope)
        if ('kind' in gate) return producerResult(gate)
        gates.push(gate)
      }
      // From here to the last write there is no `await`: every check and every write is one segment.
      const late = refusal()
      if (late) return { kind: 'rejected', reason: late }
      if (world.targetsVersion !== version) return 'changed'
      if (targets.some(s => s.ended || s.fence !== 'open')) return 'changed'
      if (!gates.every(gate => gate.current())) return { kind: 'refused', reason: 'unauthorized' }
      for (const s of targets) invalidateOne(s)
      if (drivesSupply(producer)) for (const s of targets) await supplyOnce(producer, s, true)
      return { kind: 'invalidated', scopes: targets.map(s => s.scope) }
    }
    async function invalidate(target: InvalidateTarget): Promise<InvalidateResult> {
      const refused = early()
      if (refused) return refused
      if (!tenantEquals(target.tenant, producer.tenant))
        return { kind: 'refused', reason: 'unauthorized' }
      if (target.kind === 'scope') {
        const scope = ownScope(target.scope)
        return scope ? invalidateScope(scope) : { kind: 'refused', reason: 'unauthorized' }
      }
      const decided = await world.decide(() =>
        world.trust.authority.producer(producer.principal, {
          kind: 'invalidate-tenant',
          tenant: producer.tenant,
          key: producer.key,
          producer: producer.producer,
        }),
      )
      if (isFailure(decided))
        return decided.kind === 'invalid'
          ? { kind: 'unknown', cause: 'authority' }
          : producerResult(decided)
      const first = await tenantBatch()
      if (first !== 'changed') return first
      const second = await tenantBatch()
      return second === 'changed' ? { kind: 'unknown', cause: 'authority' } : second
    }
    /**
     * Refuses this generation's new operations at once, waits within the settle bound for the
     * generation's supply calls in flight, then withdraws this generation only.
     */
    async function dispose() {
      if (!producer.active || world.closed) return
      producer.active = false
      if (producer.inFlight.size)
        await within(Promise.allSettled(producer.inFlight), world.config.settleBoundMs)
      if (world.closed) return
      if (world.producers.get(producer.tenantText + '\0' + producer.key) !== producer) return
      for (const s of world.scopes.values())
        if (s.registrations.has(producer.key) && tenantEquals(s.tenant, producer.tenant)) {
          world.nextSeq(s, producer.key)
          world.put(s, producer.key, undefined, producer.generation, false, 'producer-withdrawn')
        }
    }
    return {
      key: input.key,
      tenant: producer.tenant,
      producer: producer.producer,
      generation: producer.generation,
      publish: raw => world.track(publish(raw)),
      invalidate: target => world.track(invalidate(target)),
      dispose,
    }
  }

  return {
    registerProducer: <K extends ContextBlockKey>(principal: P, raw: ProducerRegistration<K, P>) =>
      world.track(registerProducer(principal, raw)),
    supplyOnce,
    producerFor,
    afterRegistration,
    drivesSupply,
    isCurrent,
  }
}
