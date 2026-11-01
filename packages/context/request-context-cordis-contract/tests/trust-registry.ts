// A minimal registry used only to exercise the trust suite: one reference that honours the
// registration rules, and named defects that each break exactly one rule.
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  createAssemblyOperations,
  decodePrincipalKey,
  decodeRegistrationRef,
  decodeSourceGeneration,
  type Access,
  type Adoption,
  type AssemblyOperations,
  type AssemblyPolicies,
  type ContextRegistration,
  type ContextSourceRegistry,
  type ContextSources,
  type ContextTarget,
  type PrincipalBinding,
  type RegistrationRef,
  type RegistrationResult,
  type SourceDecision,
  type SourceSettlement,
} from '@omne-harness/request-context-contract'
import type { RequestContextTrust } from '@omne-harness/request-context-cordis-contract'

export const DEFECTS = [
  'cache-key-by-principal',
  'ignore-binding',
  'replace-cross-tenant',
  'owner-rewrite',
  'unknown-as-allowed',
  'self-grant',
  'stale-decision',
  'withdraw-removes-successor',
  'register-after-close',
] as const
export type Defect = (typeof DEFECTS)[number]

type Item = {
  readonly key: string
  readonly ref: RegistrationRef
  readonly target: ContextTarget
  readonly owner: Adoption
  readonly sources: ContextSources<string>
  withdrawn: boolean
}

function targetKey(target: ContextTarget): string {
  const tenant = tenantCodec.encode(target.tenant)
  if (!tenant.ok) throw new Error('Tenant fixture')
  return JSON.stringify([tenant.value, target.scope.ref])
}

export function createReferenceRegistry(
  input: Readonly<{ trust: RequestContextTrust<string>; policies: AssemblyPolicies }>,
  defect?: Defect,
): ContextSourceRegistry<string> {
  const current = new Map<string, Item>()
  const all: Item[] = []
  const decisions = new Map<string, SourceDecision>()
  const keys = new Map<string, Awaited<ReturnType<PrincipalBinding<string>['key']>>>()
  let closed = false
  let minted = 0

  const binding: PrincipalBinding<string> = {
    async key(access: Access<string>) {
      if (defect === 'cache-key-by-principal') {
        const cached = keys.get(access.principal)
        if (cached !== undefined) return cached
        const fresh = await input.trust.principalBinding.key(access)
        keys.set(access.principal, fresh)
        return fresh
      }
      const result = await input.trust.principalBinding.key(access)
      if (defect === 'ignore-binding' && result.kind === 'denied') {
        const fallback = decodePrincipalKey('principal_fallback')
        if ('failure' in fallback) throw new Error('Reference identity')
        return { kind: 'value', value: fallback.ok }
      }
      return result
    },
  }

  async function decide(
    access: Access<string>,
    target: ContextTarget,
    owner: Adoption,
    action: 'register' | 'replace',
    sources: ContextSources<string>,
  ): Promise<SourceDecision> {
    const key = targetKey(target)
    const asked = defect === 'owner-rewrite' ? { ...owner, revision: '1' } : owner
    const decision = await input.trust.registrationAuthority.check({
      access,
      target,
      owner: asked,
      action,
    })
    // A registry that keeps the decision of the registration and ignores a later revocation.
    if (defect === 'stale-decision' && action === 'replace' && decision.kind === 'denied') {
      const kept = decisions.get(key)
      if (kept !== undefined) return kept
    }
    if (decision.kind === 'allowed') decisions.set(key, decision)
    if (defect === 'unknown-as-allowed' && decision.kind === 'unknown') return { kind: 'allowed' }
    // A registry that falls back to the eligibility inside the source set when the authority cannot answer.
    if (defect === 'self-grant' && action === 'register' && decision.kind === 'unavailable') {
      const eligible = await sources.eligibility.check({ access, target, operation: 'assembly' })
      if (eligible.kind === 'allowed') return { kind: 'allowed' }
    }
    return decision
  }

  function mint(
    target: ContextTarget,
    owner: Adoption,
    sources: ContextSources<string>,
  ): RegistrationResult {
    const n = ++minted
    const ref = decodeRegistrationRef(`registration_${n}`)
    const generation = decodeSourceGeneration(`generation_${n}`)
    if ('failure' in ref || 'failure' in generation) throw new Error('Reference identity')
    const item: Item = {
      key: targetKey(target),
      ref: ref.ok,
      target,
      owner,
      sources,
      withdrawn: false,
    }
    current.set(item.key, item)
    all.push(item)
    const handle: ContextRegistration = {
      ref: ref.ok,
      generation: generation.ok,
      withdraw() {
        item.withdrawn = true
        if (defect === 'withdraw-removes-successor' || current.get(item.key) === item)
          current.delete(item.key)
        return { kind: 'withdrawn', settled: Promise.resolve({ kind: 'settled' }) }
      },
    }
    return { kind: 'registered', handle }
  }

  const refuse = (diagnostic: string) => ({
    kind: 'unavailable' as const,
    owner: 'source-registry' as const,
    diagnostic,
  })

  return {
    async register({ access, target, owner, sources }) {
      if (access === null || access === undefined)
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (!tenantEquals(access.tenant, target.tenant)) return { kind: 'denied' }
      if (closed && defect !== 'register-after-close')
        return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      const decision = await decide(access, target, owner, 'register', sources)
      if (decision.kind !== 'allowed') return decision
      if (current.has(targetKey(target))) return { kind: 'conflict' }
      return mint(target, owner, sources)
    },
    async replace({ access, expected, sources }) {
      if (access === null || access === undefined)
        return { kind: 'invalid', field: 'access', reason: 'missing-access' }
      if (closed) return { kind: 'unavailable', diagnostic: 'Registry is closed' }
      const previous = all.find(item => item.ref === expected && !item.withdrawn)
      if (previous === undefined) return { kind: 'conflict' }
      if (defect !== 'replace-cross-tenant' && !tenantEquals(previous.target.tenant, access.tenant))
        return { kind: 'conflict' }
      const decision = await decide(access, previous.target, previous.owner, 'replace', sources)
      if (decision.kind !== 'allowed') return decision
      if (current.get(previous.key) !== previous) return { kind: 'conflict' }
      previous.withdrawn = true
      return mint(previous.target, previous.owner, sources)
    },
    assembly(target: ContextTarget): AssemblyOperations<string> {
      const borrow =
        <A extends { access?: Access<string>; call?: { access: Access<string> } }, R>(
          pick: (operations: AssemblyOperations<string>) => (argument: A) => Promise<R>,
        ) =>
        async (argument: A) => {
          const access = argument?.access ?? argument?.call?.access
          if (access === undefined || !tenantEquals(access.tenant, target.tenant))
            return { kind: 'denied', action: 'assemble', diagnostic: 'Access tenant mismatch' }
          const item = current.get(targetKey(target))
          if (closed || item === undefined || item.withdrawn) return refuse('Not registered')
          const operations = createAssemblyOperations<string>({
            target,
            sources: item.sources,
            principalBinding: binding,
            policies: input.policies,
          })
          return pick(operations)(argument)
        }
      return {
        assemble: borrow(o => o.assemble),
        planCompaction: borrow(o => o.planCompaction),
        deriveStep: borrow(o => o.deriveStep),
        resume: borrow(o => o.resume),
      } as unknown as AssemblyOperations<string>
    },
    async close(): Promise<SourceSettlement> {
      closed = true
      for (const item of all) item.withdrawn = true
      current.clear()
      return { kind: 'settled' }
    },
  }
}
