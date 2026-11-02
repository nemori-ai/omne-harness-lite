import { createHash } from 'node:crypto'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  CheckCause,
  CheckUnavailable,
  CheckUnknown,
  CommitInput,
  CommitRef,
  ApplyCommitResult,
  ContextBlockDescriptor,
  ContextBlockKey,
  Eligibility,
  EligibilityId,
  FinishReplayResult,
  HolderDecision,
  ProducerRef,
  Registration,
  ReplayRef,
  RuntimeContextTrust,
  ScopeRef,
  SupplyCallback,
} from '@omne-harness/runtime-context-contract'
import { judgeRegistration } from '@omne-harness/runtime-context-contract'
import type { ResolvedRuntimeContextConfig } from './config.js'
import type { Diagnose, RuntimeContextDiagnostic } from './diagnostics.js'
import { createReadCache, type ReadCache } from './read-cache.js'

export type Descriptor = ContextBlockDescriptor<ContextBlockKey, unknown, unknown>

/** One stored current value or the failure that replaced it. */
export type Stored = {
  value: unknown
  revision: number
  generation: number | null
  present: boolean
  cause?: 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'uninterpretable'
  /** The last source answer was unknown, a throw, a timeout or an unrecognized answer. */
  unknown?: boolean
  /** The last source answer refused the supply. */
  refused?: boolean
}

export type ReplaySession = {
  ref: ReplayRef
  scope: string
  epoch: number
  through: CommitRef | null
  supersedes: ReplayRef | null
  finished: { fingerprint: string; result: FinishReplayResult } | null
}

export type ScopeState = {
  scope: ScopeRef
  tenant: TenantId
  revision: number
  view: number
  /** Bumped when cursors become invalid: registration change, producer replacement, replay begin. */
  epoch: number
  /**
   * Bumped by every change that can alter any filtered read of this scope. The read cache keys on
   * it, so an entry is never served across such a change.
   */
  projection: number
  registrations: Map<ContextBlockKey, Registration>
  values: Map<ContextBlockKey, Stored>
  fence: 'open' | 'closed'
  ended: CommitRef | null
  replayEpoch: number
  replay: ReplaySession | null
  /** The `through` of the last finished replay. */
  checkpoint: CommitRef | null
  /** Supplied blocks whose value is not restored yet; tagged with the replay epoch (RC-09). */
  needsSupply: Map<ContextBlockKey, number>
  /** When the last restored supply of a block failed, for the retry interval. */
  refreshFailedAt: Map<ContextBlockKey, number>
  /** Per-key supply sequence shared by publish, invalidate, registration change and refresh. */
  supplySeq: Map<ContextBlockKey, number>
  /** Bumped by every applied ordinary commit and end; the final replay check compares it. */
  commitsVersion: number
}

export type Producer<P> = {
  key: ContextBlockKey
  tenant: TenantId
  tenantText: string
  producer: ProducerRef
  principal: P
  generation: number
  scoped: boolean
  supply: SupplyCallback<unknown, P> | undefined
  declaration: Descriptor
  active: boolean
  inFlight: Set<Promise<unknown>>
}

export type AppliedEntry = { input: CommitInput; digest: string; result: ApplyCommitResult }

export type Authorized<P> = Readonly<{ principal: P; current: () => boolean }>
export type Closed = Readonly<{ kind: 'refused'; reason: 'closed' }>
export type CheckFailure =
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' }>
  | Closed
  | CheckUnavailable
  | CheckUnknown
type Invalid = Readonly<{ kind: 'invalid'; reason: string }>
type Decided<P> = Authorized<P> | CheckFailure | Invalid

/** One cached snapshot part: the stable entries of every non-per-request key, by key. */
export type CachedItem =
  | Readonly<{ key: ContextBlockKey; kind: 'value'; value: unknown; evidence: CachedEvidence }>
  | Readonly<{ key: ContextBlockKey; kind: 'none' }>
  | Readonly<{
      key: ContextBlockKey
      kind: 'missing'
      cause: 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'uninterpretable'
    }>
type CachedEvidence = Readonly<{
  key: ContextBlockKey
  revision: number
  scope: ScopeRef
  generation: number | null
}>
export type CachedRead = ReadonlyMap<ContextBlockKey, CachedItem>

/** A restored-supply source call in flight; concurrent reads of the same mark join it. */
export type Refresh = Readonly<{ epoch: number; done: Promise<unknown> }>

export const CANCELLED: unique symbol = Symbol('runtime-context-closed')

export const CLOSED: Closed = Object.freeze({ kind: 'refused', reason: 'closed' })

type Registered = { s: ScopeState; r: Registration }

export type WorldOptions<P> = Readonly<{
  trust: RuntimeContextTrust<P>
  config: ResolvedRuntimeContextConfig
  onChange: ((scope: ScopeRef, revision: number) => void) | undefined
  diagnose: Diagnose | undefined
}>

/** The shared state of one mechanism instance and the checks every face uses. */
export interface World<P> {
  readonly trust: RuntimeContextTrust<P>
  readonly config: ResolvedRuntimeContextConfig
  closed: boolean
  serial: number
  /** Bumped when the set of open, registered targets changes; a tenant batch compares it. */
  targetsVersion: number
  readonly incompatible: Set<string>
  readonly descriptors: Map<ContextBlockKey, Descriptor>
  readonly scopes: Map<string, ScopeState>
  readonly producers: Map<string, Producer<P>>
  readonly generations: Map<string, number>
  readonly eligibilities: Map<string, Eligibility<P>>
  readonly commits: Map<string, AppliedEntry>
  readonly sessions: Map<string, ReplaySession>
  readonly refreshes: Map<string, Refresh>
  /** End functions of the bound readers; close ends every one. */
  readonly readers: Set<() => void>
  readonly cache: ReadCache<CachedRead>
  readonly catalog: { get(key: ContextBlockKey): Descriptor | undefined }
  /** Resolves when close cancels the waits in flight. */
  readonly cancelled: Promise<typeof CANCELLED>
  diagnose(event: RuntimeContextDiagnostic): void
  state(scope: ScopeRef): ScopeState | undefined
  touch(s: ScopeState): void
  changed(s: ScopeState, key: ContextBlockKey | null): void
  put(
    s: ScopeState,
    key: ContextBlockKey,
    value: unknown,
    generation: number | null,
    present: boolean,
    cause?: Stored['cause'],
  ): void
  /** Puts a declaration into the catalog; a changed entry is judged against every registration of the key. */
  declare(key: ContextBlockKey, declaration: Descriptor): void
  nextSeq(s: ScopeState, key: ContextBlockKey): number
  registration(scope: ScopeRef, key: ContextBlockKey): Registered | undefined
  currentEligibility(id: EligibilityId): Eligibility<P> | undefined
  newScope(scope: ScopeRef, tenant: TenantId): ScopeState
  /** Races an outside promise with close: after close begins the wait ends with CANCELLED. */
  wait<T>(pending: Promise<T>): Promise<T | typeof CANCELLED>
  decide(ask: () => Promise<AuthorityDecision<P> | HolderDecision<P>>): Promise<Decided<P>>
  bound(scope: ScopeRef, tenant: TenantId): Promise<CheckFailure | null>
  /** Counts an operation in flight until it settles; close waits for these. */
  track<T>(operation: Promise<T>): Promise<T>
  close(): Promise<void>
}

export function createWorld<P>(options: WorldOptions<P>): World<P> {
  const { trust, config } = options
  let cancel: (value: typeof CANCELLED) => void = () => {}
  const cancelled = new Promise<typeof CANCELLED>(resolve => {
    cancel = resolve
  })
  const pending = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined

  function diagnose(event: RuntimeContextDiagnostic) {
    try {
      options.diagnose?.(event)
    } catch {
      /* A diagnostic sink never changes a result. */
    }
  }

  const world: World<P> = {
    trust,
    config,
    closed: false,
    serial: 0,
    targetsVersion: 0,
    incompatible: new Set<string>(),
    descriptors: new Map<ContextBlockKey, Descriptor>(),
    scopes: new Map<string, ScopeState>(),
    producers: new Map<string, Producer<P>>(),
    generations: new Map<string, number>(),
    eligibilities: new Map<string, Eligibility<P>>(),
    commits: new Map<string, AppliedEntry>(),
    sessions: new Map<string, ReplaySession>(),
    refreshes: new Map<string, Refresh>(),
    readers: new Set<() => void>(),
    cache: createReadCache<CachedRead>(config.readCacheEntries, result =>
      diagnose({ kind: 'read-cache', result }),
    ),
    catalog: { get: (key: ContextBlockKey) => world.descriptors.get(key) },
    cancelled,
    diagnose,
    state: (scope: ScopeRef) => world.scopes.get(scope.ref),
    touch(s: ScopeState) {
      s.projection++
    },
    changed(s: ScopeState, key: ContextBlockKey | null) {
      if (key !== null && world.descriptors.get(key)?.volatility === 'per-request') return
      s.view++
      s.projection++
      if (world.closed || !options.onChange) return
      try {
        options.onChange(s.scope, s.view)
      } catch {
        // A wake-up is not the source of fact: the write stands.
        diagnose({ kind: 'change-outlet-failed', revision: s.view })
      }
    },
    put(s, key, value, generation, present, cause = 'no-value') {
      s.values.set(key, {
        value,
        revision: (s.values.get(key)?.revision ?? 0) + 1,
        generation,
        present,
        cause,
      })
      world.changed(s, key)
    },
    declare(key: ContextBlockKey, declaration: Descriptor) {
      if (world.descriptors.get(key) === declaration) return
      world.descriptors.set(key, declaration)
      for (const s of world.scopes.values()) {
        const r = s.registrations.get(key)
        if (!r) continue
        const checked = judgeRegistration(
          {
            kind: 'update',
            creating: false,
            scope: s.scope,
            tenant: s.tenant,
            key,
            basedOn: s.revision,
            bindings: r.bindings,
            parameters: r.parameters,
          },
          { descriptors: world.catalog, scopeTenant: s.tenant, existing: r, creating: false },
        )
        if ('failure' in checked && !world.incompatible.has(s.scope.ref + '\0' + key)) {
          world.incompatible.add(s.scope.ref + '\0' + key)
          diagnose({ kind: 'incompatible-registration', key })
        }
        world.touch(s)
      }
    },
    nextSeq(s: ScopeState, key: ContextBlockKey): number {
      const next = (s.supplySeq.get(key) ?? 0) + 1
      s.supplySeq.set(key, next)
      return next
    },
    registration(scope: ScopeRef, key: ContextBlockKey) {
      let current: ScopeRef | undefined = scope
      while (current) {
        const s = world.state(current)
        const r = s?.registrations.get(key)
        if (s && r) return { s, r }
        current = current.parent
      }
      return undefined
    },
    currentEligibility(id: EligibilityId): Eligibility<P> | undefined {
      let e = world.eligibilities.get(id.eligibility),
        remaining = world.eligibilities.size + 1
      while (e?.state.kind === 'superseded' && remaining-- > 0)
        e = world.eligibilities.get(e.state.by.eligibility)
      return e?.state.kind === 'valid' ? e : undefined
    },
    newScope(scope: ScopeRef, tenant: TenantId): ScopeState {
      const s: ScopeState = {
        scope,
        tenant,
        revision: 0,
        view: 0,
        epoch: 0,
        projection: 0,
        registrations: new Map(),
        values: new Map(),
        fence: 'closed',
        ended: null,
        replayEpoch: 0,
        replay: null,
        checkpoint: null,
        needsSupply: new Map(),
        refreshFailedAt: new Map(),
        supplySeq: new Map(),
        commitsVersion: 0,
      }
      world.scopes.set(scope.ref, s)
      world.targetsVersion++
      return s
    },
    wait<T>(waiting: Promise<T>): Promise<T | typeof CANCELLED> {
      return Promise.race([waiting, cancelled])
    },
    /** Maps an authority decision; `current` is kept for the final synchronous check. */
    async decide(ask) {
      let decision: AuthorityDecision<P> | HolderDecision<P> | typeof CANCELLED
      try {
        decision = await world.wait(ask())
      } catch {
        return { kind: 'unknown', cause: 'authority' }
      }
      if (decision === CANCELLED || world.closed) return CLOSED
      switch (decision.kind) {
        case 'authorized': {
          const current = decision.current
          return { principal: decision.principal, current: () => safeCurrent(current) }
        }
        case 'refused':
          return { kind: 'refused', reason: 'unauthorized' }
        case 'unavailable':
          return { kind: 'unavailable', cause: 'authority' }
        case 'unknown':
          return { kind: 'unknown', cause: 'authority' }
        case 'invalid':
          return { kind: 'invalid', reason: decision.reason }
        default:
          return { kind: 'unknown', cause: 'authority' }
      }
    },
    /** Trusted binding: unbound or another tenant is unauthorized; the real tenant is never disclosed. */
    async bound(scope: ScopeRef, tenant: TenantId): Promise<CheckFailure | null> {
      if (!isMinted(tenant)) return { kind: 'refused', reason: 'unauthorized' }
      let binding
      try {
        binding = await world.wait(trust.bindings.lookup(scope))
      } catch {
        return { kind: 'unknown', cause: 'scope-binding' }
      }
      if (binding === CANCELLED || world.closed) return CLOSED
      switch (binding?.kind) {
        case 'bound':
          return tenantEquals(binding.tenant, tenant)
            ? null
            : { kind: 'refused', reason: 'unauthorized' }
        case 'unbound':
          return { kind: 'refused', reason: 'unauthorized' }
        case 'unavailable':
          return { kind: 'unavailable', cause: 'scope-binding' }
        default:
          return { kind: 'unknown', cause: 'scope-binding' }
      }
    },
    track<T>(operation: Promise<T>): Promise<T> {
      pending.add(operation)
      const remove = () => {
        pending.delete(operation)
      }
      operation.then(remove, remove)
      return operation
    },
    close() {
      closing ??= closeInOrder()
      return closing
    },
  }

  /**
   * The close order: refuse new requests, end the bound readers, cancel the waits in flight, wait
   * for the operations in flight within the settle bound, then release the tables.
   */
  async function closeInOrder() {
    world.closed = true
    for (const end of world.readers) end()
    world.readers.clear()
    cancel(CANCELLED)
    await within(Promise.allSettled(pending), config.settleBoundMs)
    world.cache.clear()
    world.refreshes.clear()
    world.incompatible.clear()
    world.descriptors.clear()
    world.scopes.clear()
    world.producers.clear()
    world.generations.clear()
    world.eligibilities.clear()
    world.commits.clear()
    world.sessions.clear()
  }

  return world
}

/** Waits for the promise, or for `ms`, whichever comes first. */
export async function within(waiting: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    waiting,
    new Promise<void>(resolve => {
      timer = setTimeout(resolve, ms)
    }),
  ])
  clearTimeout(timer)
}

function safeCurrent(current: () => boolean): boolean {
  try {
    return current() === true
  } catch {
    return false
  }
}

export function isMinted(tenant: TenantId): boolean {
  return tenantCodec.encode(tenant).ok
}

export function tenantText(tenant: TenantId): string | undefined {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : undefined
}

export function isFailure<P>(value: Decided<P>): value is CheckFailure | Invalid {
  return 'kind' in value
}

export function unavailable(cause: CheckCause): CheckUnavailable {
  return { kind: 'unavailable', cause }
}

/** Copies a scope chain into owned data. Undefined when the chain is not a valid scope. */
export function ownScope(value: ScopeRef, seen = new Set<object>()): ScopeRef | undefined {
  if (typeof value !== 'object' || value === null || seen.has(value)) return undefined
  seen.add(value)
  const ref: unknown = value.ref
  if (typeof ref !== 'string' || ref.trim().length === 0) return undefined
  if (value.parent === undefined) return { ref: value.ref }
  const parent = ownScope(value.parent, seen)
  return parent ? { ref: value.ref, parent } : undefined
}

/** Copies data by its declared shape. Undefined when the value is not plain data. */
export function ownData(value: unknown): { value: unknown } | undefined {
  try {
    return { value: structuredClone(value) }
  } catch {
    return undefined
  }
}

/** A stable digest of captured input: functions and schemas by presence, tenants by their text. */
export function digest(value: unknown): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'function') return '[function]'
    if (typeof item === 'symbol' || typeof item === 'bigint') return String(item)
    if (typeof item === 'object' && item !== null) {
      if (isTenantLike(item)) return { tenant: tenantText(item) ?? '[unminted]' }
      if (seen.has(item)) return '[cycle]'
      seen.add(item)
      if ('~standard' in item) return '[schema]'
    }
    return item
  })
  return createHash('sha256')
    .update(text ?? 'undefined')
    .digest('hex')
}

function isTenantLike(value: object): value is TenantId {
  return 'name' in value && value.name === 'TenantId'
}
