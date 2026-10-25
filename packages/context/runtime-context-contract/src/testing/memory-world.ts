import { createHash } from 'node:crypto'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ScopeRef,
  ContextBlockKey,
  ContextBlockDescriptor,
  Registration,
  Eligibility,
  EligibilityId,
  CommitInput,
  ApplyCommitResult,
  RuntimeContextAuthority,
  ScopeBindingSource,
  AuthorityDecision,
  HolderDecision,
  CheckCause,
  CheckUnavailable,
  CheckUnknown,
  CommitRef,
  ReplayRef,
  FinishReplayResult,
  SupplyCallback,
  ProducerRef,
} from '../index.js'

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
export type CheckFailure =
  | Readonly<{ kind: 'refused'; reason: 'unauthorized' }>
  | CheckUnavailable
  | CheckUnknown

export type WorldOptions<P> = Readonly<{
  authority: RuntimeContextAuthority<P>
  bindings: ScopeBindingSource
  retention: number
  replayCapacity: number
  supplyBoundMs: number
  settleBoundMs: number
}>

type Registered = { s: ScopeState; r: Registration }
type Decided<P> = Authorized<P> | CheckFailure | Readonly<{ kind: 'invalid'; reason: string }>

/** The shared state of one memory instance and the checks every face uses. */
export interface World<P> {
  readonly options: WorldOptions<P>
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
  readonly listeners: Set<(scope: ScopeRef, revision: number) => void>
  readonly catalog: { get(key: ContextBlockKey): Descriptor | undefined }
  state(scope: ScopeRef): ScopeState | undefined
  changed(s: ScopeState, key: ContextBlockKey | null): void
  put(
    s: ScopeState,
    key: ContextBlockKey,
    value: unknown,
    generation: number | null,
    present: boolean,
    cause?: Stored['cause'],
  ): void
  nextSeq(s: ScopeState, key: ContextBlockKey): number
  registration(scope: ScopeRef, key: ContextBlockKey): Registered | undefined
  currentEligibility(id: EligibilityId): Eligibility<P> | undefined
  newScope(scope: ScopeRef, tenant: TenantId): ScopeState
  decide(ask: () => Promise<AuthorityDecision<P> | HolderDecision<P>>): Promise<Decided<P>>
  bound(scope: ScopeRef, tenant: TenantId): Promise<CheckFailure | null>
}

export function createWorld<P>(options: WorldOptions<P>): World<P> {
  const world: World<P> = {
    options,
    closed: false,
    serial: 0,
    /** Bumped when the set of open, registered targets changes; a tenant batch compares it. */
    targetsVersion: 0,
    incompatible: new Set<string>(),
    descriptors: new Map<ContextBlockKey, Descriptor>(),
    scopes: new Map<string, ScopeState>(),
    producers: new Map<string, Producer<P>>(),
    generations: new Map<string, number>(),
    eligibilities: new Map<string, Eligibility<P>>(),
    commits: new Map<string, AppliedEntry>(),
    sessions: new Map<string, ReplaySession>(),
    listeners: new Set<(scope: ScopeRef, revision: number) => void>(),
    catalog: { get: (key: ContextBlockKey) => world.descriptors.get(key) },
    state: (scope: ScopeRef) => world.scopes.get(scope.ref),
    changed(s: ScopeState, key: ContextBlockKey | null) {
      if (key !== null && world.descriptors.get(key)?.volatility === 'per-request') return
      s.view++
      for (const listener of world.listeners) {
        try {
          listener(s.scope, s.view)
        } catch {
          /* A wake-up is not the source of fact. */
        }
      }
    },
    put(
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
      world.changed(s, key)
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
        registrations: new Map(),
        values: new Map(),
        fence: 'closed',
        ended: null,
        replayEpoch: 0,
        replay: null,
        checkpoint: null,
        needsSupply: new Map(),
        supplySeq: new Map(),
        commitsVersion: 0,
      }
      world.scopes.set(scope.ref, s)
      world.targetsVersion++
      return s
    },
    /** Maps an authority decision; `current` is kept for the final synchronous check. */
    async decide(
      ask: () => Promise<AuthorityDecision<P> | HolderDecision<P>>,
    ): Promise<Authorized<P> | CheckFailure | Readonly<{ kind: 'invalid'; reason: string }>> {
      let decision: AuthorityDecision<P> | HolderDecision<P>
      try {
        decision = await ask()
      } catch {
        return { kind: 'unknown', cause: 'authority' }
      }
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
        default: {
          return { kind: 'unknown', cause: 'authority' }
        }
      }
    },
    /** Trusted binding: unbound or another tenant is unauthorized; the real tenant is never disclosed. */
    async bound(scope: ScopeRef, tenant: TenantId): Promise<CheckFailure | null> {
      if (!isMinted(tenant)) return { kind: 'refused', reason: 'unauthorized' }
      let binding
      try {
        binding = await options.bindings.lookup(scope)
      } catch {
        return { kind: 'unknown', cause: 'scope-binding' }
      }
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
  }
  return world
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

export function isFailure<P>(
  value: Authorized<P> | CheckFailure | Readonly<{ kind: 'invalid'; reason: string }>,
): value is CheckFailure | Readonly<{ kind: 'invalid'; reason: string }> {
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
