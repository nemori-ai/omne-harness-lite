// The source registry (RQ-12): one valid source set per (tenant, scope), generations that are
// never reused, borrows that keep read ports reachable, and publication checked synchronously.
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createAssemblyOperations,
  decodeRegistrationRef,
  decodeSourceGeneration,
  type Adoption,
  type AssemblyCall,
  type AssemblyOperations,
  type ContextRegistration,
  type ContextRegistryOptions,
  type ContextSourceRegistry,
  type ContextSources,
  type ContextTarget,
  type RegistrationRef,
  type RegistrationResult,
  type SourceDecision,
  type SourceGeneration,
  type SourceSettlement,
} from '@omne-harness/request-context-contract'

type Generation<P> = {
  readonly ref: RegistrationRef
  readonly generation: SourceGeneration
  readonly key: string
  readonly target: ContextTarget
  readonly owner: Adoption
  readonly sources: ContextSources<P>
  borrows: number
  withdrawn: boolean
  outstanding: Adoption[]
  readonly settled: Promise<SourceSettlement>
  settle(): void
  receipt: ReturnType<ContextRegistration['withdraw']> | null
}

const UNREGISTERED = 'No source set is registered for this target'
const LEASE_NOT_GIVEN_BACK = 'Model preparation lease was not given back'

function targetKey(target: ContextTarget): string | null {
  const tenant = tenantCodec.encode(target.tenant)
  return tenant.ok ? `${tenant.value}\u0000${target.scope.ref}` : null
}
function decisionFailure(
  decision: Exclude<SourceDecision, { kind: 'allowed' }>,
): RegistrationResult {
  return decision
}
function failureSettlement(outstanding: readonly Adoption[]): SourceSettlement {
  return outstanding.length ? { kind: 'unavailable', outstanding } : { kind: 'settled' }
}

/** Creates the registry; the request-context-cordis provider projects it as a Cordis service. */
export function createContextSourceRegistry<P>(
  options: ContextRegistryOptions<P>,
): ContextSourceRegistry<P> {
  let closed = false
  let count = 0
  const current = new Map<string, Generation<P>>()
  const unsettled = new Set<Generation<P>>()

  function mint(target: ContextTarget, key: string, owner: Adoption, sources: ContextSources<P>) {
    count++
    const ref = decodeRegistrationRef(`registration_${count}`)
    const generation = decodeSourceGeneration(`generation_${count}`)
    if ('failure' in ref || 'failure' in generation) throw new Error('Registry identity invalid')
    let resolve: (value: SourceSettlement) => void = () => {}
    const settled = new Promise<SourceSettlement>(done => {
      resolve = done
    })
    const item: Generation<P> = {
      ref: ref.ok,
      generation: generation.ok,
      key,
      target,
      owner,
      sources,
      borrows: 0,
      withdrawn: false,
      outstanding: [],
      settled,
      settle() {
        if (this.withdrawn && this.borrows === 0) {
          unsettled.delete(this)
          resolve(failureSettlement(this.outstanding))
        }
      },
      receipt: null,
    }
    unsettled.add(item)
    return item
  }
  function retire(item: Generation<P>) {
    if (current.get(item.key) === item) current.delete(item.key)
    item.withdrawn = true
    item.settle()
  }
  function handle(item: Generation<P>): ContextRegistration {
    return {
      ref: item.ref,
      generation: item.generation,
      withdraw() {
        if (item.receipt === null) {
          retire(item)
          item.receipt = { kind: 'withdrawn', settled: item.settled }
        }
        return item.receipt
      },
    }
  }

  function borrowed<A, R>(
    target: ContextTarget,
    run: (operations: AssemblyOperations<P>, argument: A) => Promise<R>,
  ): (
    argument: A,
  ) => Promise<
    R | Readonly<{ kind: 'unavailable'; owner: 'source-registry'; diagnostic: string }>
  > {
    return async argument => {
      const key = targetKey(target)
      const item = key === null ? undefined : current.get(key)
      if (closed || item === undefined || item.withdrawn)
        return { kind: 'unavailable', owner: 'source-registry', diagnostic: UNREGISTERED }
      item.borrows++
      try {
        const operations = createAssemblyOperations({
          target,
          sources: item.sources,
          principalBinding: options.principalBinding,
          policies: options.policies,
          generation: item.generation,
        })
        const result = await run(operations, argument)
        if (isLeaseLeak(result)) item.outstanding.push(item.owner)
        // Publication: the generation is checked with no await before the result leaves.
        if (item.withdrawn || current.get(item.key) !== item)
          return {
            kind: 'unavailable',
            owner: 'source-registry',
            diagnostic: 'The source set was withdrawn or replaced during the operation',
          }
        return result
      } finally {
        item.borrows--
        item.settle()
      }
    }
  }

  return {
    async register({ access, target, owner, sources }) {
      if (access === null || access === undefined)
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      const key = targetKey(target)
      if (key === null)
        return { kind: 'invalid', field: 'target.tenant', reason: 'unsupported-format' }
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      if (current.has(key)) return { kind: 'conflict' }
      const decision = await options.registrationAuthority.check({
        access,
        target,
        owner,
        action: 'register',
      })
      if (decision.kind !== 'allowed') return decisionFailure(decision)
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      if (current.has(key)) return { kind: 'conflict' }
      const item = mint(target, key, owner, sources)
      current.set(key, item)
      return { kind: 'registered', handle: handle(item) }
    },
    async replace({ access, expected, sources }) {
      if (access === null || access === undefined)
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      const previous = [...current.values()].find(item => item.ref === expected)
      if (previous === undefined) return { kind: 'conflict' }
      const decision = await options.registrationAuthority.check({
        access,
        target: previous.target,
        owner: previous.owner,
        action: 'replace',
      })
      if (decision.kind !== 'allowed') return decisionFailure(decision)
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      if (current.get(previous.key) !== previous) return { kind: 'conflict' }
      // One local step: publish the new set and retire the old one.
      const item = mint(previous.target, previous.key, previous.owner, sources)
      current.set(previous.key, item)
      retire(previous)
      return { kind: 'registered', handle: handle(item) }
    },
    assembly(target: ContextTarget): AssemblyOperations<P> {
      return {
        assemble: borrowed(target, (o, call: AssemblyCall<P>) => o.assemble(call)),
        planCompaction: borrowed(target, (o, call: AssemblyCall<P>) => o.planCompaction(call)),
        deriveStep: borrowed(
          target,
          (o, input: Parameters<AssemblyOperations<P>['deriveStep']>[0]) => o.deriveStep(input),
        ),
        resume: borrowed(target, (o, call: AssemblyCall<P>) => o.resume(call)),
      }
    },
    async close() {
      closed = true
      // Collect every generation first: retiring an idle one settles it and leaves `unsettled`.
      const pending = [...new Set([...unsettled, ...current.values()])]
      // Deleting the visited entry while iterating a Map is safe.
      for (const item of current.values()) retire(item)
      const results = await Promise.all(pending.map(item => item.settled))
      return failureSettlement(
        results.flatMap(result => (result.kind === 'unavailable' ? result.outstanding : [])),
      )
    },
  }
}

function isLeaseLeak(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'kind' in result &&
    result.kind === 'unavailable' &&
    'owner' in result &&
    result.owner === 'preparation' &&
    'diagnostic' in result &&
    typeof result.diagnostic === 'string' &&
    result.diagnostic.startsWith(LEASE_NOT_GIVEN_BACK)
  )
}
