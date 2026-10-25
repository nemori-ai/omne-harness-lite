import type * as M from '@omne-harness/model-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeGroupToken,
  decodePrincipalKey,
  type Access,
  type Adoption,
  type ContextTarget,
  type GroupToken,
} from '../refs.js'
import type { AdoptedRequestFact, GroupName } from '../values.js'
import type { ConversionResultSource, HistorySource } from '../ports.js'
import type {
  AdoptedRequestSource,
  ContextReadEligibility,
  ContextSources,
  GroupSource,
  PrincipalBinding,
  SourceGroupValue,
  SourceRead,
} from '../sources.js'
import { digest } from '../internal.js'

type SourceGroup = Exclude<GroupName, 'identity'>
type Failed = Exclude<SourceRead<never>, { kind: 'value' }>
/** The value each group source gives; the third group has no adopted fact. */
export type AssemblyGroupValues<P> = { [K in SourceGroup]: SourceGroupValue<P, K> }
let instances = 0
function token(text: string): GroupToken {
  const value = decodeGroupToken(text)
  if ('failure' in value) throw new Error('Invalid testing token')
  return value.ok
}

export interface MemoryAdoptedSource<P> extends AdoptedRequestSource<P> {
  readonly durability: 'none'
  set(fact: AdoptedRequestFact | null): void
  fail(read: Failed | null): void
  /** Runs once, right after the next source read; a test uses it to change the fact mid-read. */
  afterSourceRead(hook: () => void): void
  reads(): number
}
/** A non-durable narrow adoption source; the count changes on every `set`, never reused. */
export function createMemoryAdoptedSource<P>(
  initial: AdoptedRequestFact | null = null,
  authority: Adoption = {
    owner: 'request-context-contract/testing',
    name: 'adopted',
    revision: '1',
    digest: 'fixture',
  },
): MemoryAdoptedSource<P> {
  const generation = ++instances
  let fact = initial
  let revision = 0
  let failure: Failed | null = null
  let hook: (() => void) | null = null
  let reads = 0
  return {
    durability: 'none',
    authority,
    set(value) {
      fact = value
      revision++
    },
    fail(read) {
      failure = read
    },
    afterSourceRead(next) {
      hook = next
    },
    reads: () => reads,
    async readCount() {
      return failure ?? { kind: 'value', value: token(`adopted_${generation}_${revision}`) }
    },
    async readSource() {
      reads++
      if (failure !== null) return failure
      const value = fact
      const run = hook
      hook = null
      run?.()
      return { kind: 'value', value }
    },
  }
}

export interface MemoryReadEligibility<P> extends ContextReadEligibility<P> {
  readonly durability: 'none'
  set(decision: 'allowed' | Failed): void
  checks(): number
}
export function createMemoryReadEligibility<P>(): MemoryReadEligibility<P> {
  let decision: 'allowed' | Failed = 'allowed'
  let checks = 0
  let revision = 0
  return {
    durability: 'none',
    set(value) {
      decision = value
      revision++
    },
    checks: () => checks,
    async check() {
      checks++
      if (decision === 'allowed')
        return { kind: 'allowed', revision: token(`eligibility_${revision}`) }
      return decision.kind === 'invalid' ? { kind: 'denied' } : decision
    },
  }
}

/** Keys a principal by its tenant text and its JSON text; only for principals that JSON can carry. */
export function createTestingPrincipalBinding<P>(): PrincipalBinding<P> {
  return {
    async key(access: Access<P>) {
      const tenant = tenantCodec.encode(access.tenant)
      if (!tenant.ok) return { kind: 'invalid', field: 'tenant', reason: 'unsupported-format' }
      let text: string
      try {
        text = digest({ tenant: tenant.value, principal: access.principal })
      } catch {
        return { kind: 'unavailable', diagnostic: 'The testing binding keys only JSON principals' }
      }
      const key = decodePrincipalKey(`principal_${text}`)
      return 'failure' in key
        ? { kind: 'invalid', field: 'principal', reason: 'unsupported-format' }
        : { kind: 'value', value: key.ok }
    },
  }
}

export interface MemoryContextSources<P> extends ContextSources<P> {
  readonly durability: 'none'
  readonly target: ContextTarget
  values(): AssemblyGroupValues<P>
  /** Replaces one group value and moves that group's count. */
  update<K extends SourceGroup>(group: K, value: AssemblyGroupValues<P>[K]): void
  /** Runs once, right after the next source read of the group. */
  afterSourceRead(group: SourceGroup, hook: () => void): void
  fail(group: SourceGroup, read: Failed | null): void
  /** Moves the count of a group on every count read: the group never becomes stable. */
  churn(group: SourceGroup, on: boolean): void
  sourceReads(group: SourceGroup): number
}
export type MemoryContextSourcesInput<P> = Readonly<{
  target: ContextTarget
  values: AssemblyGroupValues<P>
  history: HistorySource<P>
  conversions: ConversionResultSource<P>
  preparation: M.ModelPreparationResources<P>
  adopted?: AdoptedRequestSource<P>
  eligibility?: ContextReadEligibility<P>
}>
function covered(group: SourceGroup, value: unknown): string {
  if (group !== 'control' || typeof value !== 'object' || value === null) return digest(value)
  const control = value as { previous?: { carried?: unknown } | null }
  const previous = control.previous
  if (previous === null || previous === undefined) return digest(value)
  const { carried: _carried, ...identity } = previous
  return digest({ ...control, previous: identity })
}
/** Non-durable group sources with source-owned counters. Never install them as production sources. */
export function createMemoryContextSources<P>(
  input: MemoryContextSourcesInput<P>,
): MemoryContextSources<P> {
  const generation = ++instances
  const values = { ...input.values }
  const counters = new Map<SourceGroup, number>()
  const hooks = new Map<SourceGroup, () => void>()
  const failures = new Map<SourceGroup, Failed>()
  const churning = new Set<SourceGroup>()
  const reads = new Map<SourceGroup, number>()
  function source<K extends SourceGroup>(group: K): GroupSource<P, K> {
    return {
      async readCount() {
        const failed = failures.get(group)
        if (failed !== undefined) return failed
        if (churning.has(group)) counters.set(group, (counters.get(group) ?? 0) + 1)
        return { kind: 'value', value: token(`${group}_${generation}_${counters.get(group) ?? 0}`) }
      },
      async readSource() {
        reads.set(group, (reads.get(group) ?? 0) + 1)
        const failed = failures.get(group)
        if (failed !== undefined) return failed
        const value = values[group] as SourceGroupValue<P, K>
        const hook = hooks.get(group)
        hooks.delete(group)
        hook?.()
        return { kind: 'value', value }
      },
    }
  }
  return {
    durability: 'none',
    target: input.target,
    groups: {
      history: source('history'),
      context: source('context'),
      prompt: source('prompt'),
      model: source('model'),
      tools: source('tools'),
      control: source('control'),
    },
    adopted: input.adopted ?? createMemoryAdoptedSource<P>(),
    history: input.history,
    conversions: input.conversions,
    eligibility: input.eligibility ?? createMemoryReadEligibility<P>(),
    preparation: input.preparation,
    values: () => ({ ...values }),
    update(group, value) {
      const before = covered(group, values[group])
      values[group] = value
      // The control token covers the previous preparation's identity, not the content it carries.
      if (group !== 'control' || before !== covered(group, value))
        counters.set(group, (counters.get(group) ?? 0) + 1)
    },
    afterSourceRead(group, hook) {
      hooks.set(group, hook)
    },
    fail(group, read) {
      if (read === null) failures.delete(group)
      else failures.set(group, read)
    },
    churn(group, on) {
      if (on) churning.add(group)
      else churning.delete(group)
    },
    sourceReads: group => reads.get(group) ?? 0,
  }
}
