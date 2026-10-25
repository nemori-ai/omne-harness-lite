// The source registry (RQ-12): one valid source set per (tenant, scope), generations that are
// never reused, borrows and leases that keep a generation unsettled, and publication checked
// synchronously.
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import {
  createAssemblyOperations,
  decodeRegistrationRef,
  decodeSourceGeneration,
  type Access,
  type Adoption,
  type AssemblyCall,
  type AssemblyFailure,
  type AssemblyOperations,
  type ContextRegistration,
  type ContextRegistryOptions,
  type ContextSourceRegistry,
  type ContextSources,
  type ContextTarget,
  type RegistrationRef,
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
  /** Leases acquired through this generation and not yet given back. */
  leases: number
  /** A lease of this generation was not given back; kept after settlement until close reports it. */
  leaked: boolean
  withdrawn: boolean
  readonly settled: Promise<SourceSettlement>
  settle(): void
  receipt: ReturnType<ContextRegistration['withdraw']> | null
}
type Refusal = Extract<AssemblyFailure, { kind: 'invalid' | 'denied' | 'unavailable' }>

const UNREGISTERED = 'No source set is registered for this target'

function targetKey(target: ContextTarget): string | null {
  const tenant = tenantCodec.encode(target.tenant)
  return tenant.ok ? `${tenant.value}\u0000${target.scope.ref}` : null
}
function settlementOf(item: Generation<unknown>): SourceSettlement {
  return item.leaked ? { kind: 'unavailable', outstanding: [item.owner] } : { kind: 'settled' }
}
function hasAccess<P>(access: Access<P> | null | undefined): access is Access<P> {
  return access !== null && access !== undefined && typeof access === 'object'
}

/** Creates the registry; the request-context-cordis provider projects it as a Cordis service. */
export function createContextSourceRegistry<P>(
  options: ContextRegistryOptions<P>,
): ContextSourceRegistry<P> {
  let closed = false
  let count = 0
  const current = new Map<string, Generation<P>>()
  /** Every generation not yet reported by `close`: unsettled ones and settled ones that leaked. */
  const tracked = new Set<Generation<P>>()

  /** Records the release of every lease taken through this generation (RQ-05, RQ-12). */
  function preparationOf(item: Generation<P>): M.ModelPreparationResources<P> {
    const inner = item.sources.preparation
    return {
      async acquire(input) {
        const acquired = await inner.acquire(input)
        if ('failure' in acquired) return acquired
        const lease = acquired.ok
        item.leases++
        let given: ReturnType<M.ModelPreparationLease['release']> | null = null
        const release = async () => {
          try {
            const released = await lease.release()
            if (released.failure !== undefined) item.leaked = true
            return released
          } catch (error) {
            item.leaked = true
            throw error
          } finally {
            item.leases--
            item.settle()
          }
        }
        return {
          ok: {
            bindings: lease.bindings,
            release() {
              given ??= release()
              return given
            },
          },
        }
      },
    }
  }

  function mint(target: ContextTarget, key: string, owner: Adoption, sources: ContextSources<P>) {
    count++
    const ref = decodeRegistrationRef(`registration_${count}`)
    const generation = decodeSourceGeneration(`generation_${count}`)
    if ('failure' in ref || 'failure' in generation) throw new Error('Registry identity invalid')
    let resolve: (value: SourceSettlement) => void = () => {}
    const settled = new Promise<SourceSettlement>(done => {
      resolve = done
    })
    let done = false
    const item: Generation<P> = {
      ref: ref.ok,
      generation: generation.ok,
      key,
      target,
      owner,
      sources,
      borrows: 0,
      leases: 0,
      leaked: false,
      withdrawn: false,
      settled,
      settle() {
        if (done || !this.withdrawn || this.borrows !== 0 || this.leases !== 0) return
        done = true
        if (!this.leaked) tracked.delete(this)
        resolve(settlementOf(this))
      },
      receipt: null,
    }
    tracked.add(item)
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

  /**
   * Access shape and access tenant come first, so a caller of another tenant gets the same answer
   * whether or not the target is registered; only then is the registration looked up.
   */
  function borrowed<A, R>(
    target: ContextTarget,
    accessOf: (argument: A) => Access<P> | null | undefined,
    run: (operations: AssemblyOperations<P>, argument: A) => Promise<R>,
  ): (argument: A) => Promise<R | Refusal> {
    return async argument => {
      const access = accessOf(argument)
      if (!hasAccess(access)) return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (!tenantEquals(access.tenant, target.tenant))
        return {
          kind: 'denied',
          action: 'assemble',
          diagnostic: 'Access tenant is not the target tenant',
        }
      const key = targetKey(target)
      const item = key === null ? undefined : current.get(key)
      if (closed || item === undefined || item.withdrawn)
        return { kind: 'unavailable', owner: 'source-registry', diagnostic: UNREGISTERED }
      item.borrows++
      try {
        const operations = createAssemblyOperations({
          target,
          sources: { ...item.sources, preparation: preparationOf(item) },
          principalBinding: options.principalBinding,
          policies: options.policies,
          generation: item.generation,
        })
        const result = await run(operations, argument)
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
      if (!hasAccess(access)) return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (!tenantEquals(access.tenant, target.tenant)) return { kind: 'denied' }
      const key = targetKey(target)
      if (key === null)
        return { kind: 'invalid', field: 'target.tenant', reason: 'unsupported-format' }
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      // No existence answer before the authority has decided.
      const decision = await options.registrationAuthority.check({
        access,
        target,
        owner,
        action: 'register',
      })
      if (decision.kind !== 'allowed') return decision
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      if (current.has(key)) return { kind: 'conflict' }
      const item = mint(target, key, owner, sources)
      current.set(key, item)
      return { kind: 'registered', handle: handle(item) }
    },
    async replace({ access, expected, sources }) {
      if (!hasAccess(access)) return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      const previous = [...current.values()].find(item => item.ref === expected)
      // A registration of another tenant answers exactly as a registration that does not exist.
      if (previous === undefined || !tenantEquals(previous.target.tenant, access.tenant))
        return { kind: 'conflict' }
      const decision = await options.registrationAuthority.check({
        access,
        target: previous.target,
        owner: previous.owner,
        action: 'replace',
      })
      if (decision.kind !== 'allowed') return decision
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      if (current.get(previous.key) !== previous) return { kind: 'conflict' }
      // One local step: publish the new set and retire the old one.
      const item = mint(previous.target, previous.key, previous.owner, sources)
      current.set(previous.key, item)
      retire(previous)
      return { kind: 'registered', handle: handle(item) }
    },
    assembly(target: ContextTarget): AssemblyOperations<P> {
      const ofCall = (call: AssemblyCall<P>) => call?.access
      return {
        assemble: borrowed(target, ofCall, (o, call: AssemblyCall<P>) => o.assemble(call)),
        planCompaction: borrowed(target, ofCall, (o, call: AssemblyCall<P>) =>
          o.planCompaction(call),
        ),
        deriveStep: borrowed(
          target,
          (input: Parameters<AssemblyOperations<P>['deriveStep']>[0]) => input?.call?.access,
          (o, input) => o.deriveStep(input),
        ),
        resume: borrowed(target, ofCall, (o, call: AssemblyCall<P>) => o.resume(call)),
      }
    },
    async close() {
      closed = true
      // Deleting the visited entry while iterating a Map is safe.
      for (const item of current.values()) retire(item)
      const pending = [...tracked]
      await Promise.all(pending.map(item => item.settled))
      const outstanding: Adoption[] = []
      const seen = new Set<string>()
      for (const item of pending) {
        tracked.delete(item)
        const id = JSON.stringify([
          item.owner.owner,
          item.owner.name,
          item.owner.revision,
          item.owner.digest,
        ])
        if (item.leaked && !seen.has(id)) {
          seen.add(id)
          outstanding.push(item.owner)
        }
      }
      return outstanding.length ? { kind: 'unavailable', outstanding } : { kind: 'settled' }
    },
  }
}
