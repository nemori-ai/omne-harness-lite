// The testing entry: the scripted trust double and the trust conformance suite, defined here, and
// the memory holder double and the holder sources suite, re-exported from their own files.
// The trust part stays in this file because only the declared entry may import a testing subpath;
// the holder files import no testing subpath. No file imports a provider member: the fixtures hand
// in the registry factory or plug the holder, and the suites drive them through public ports only.
import type {
  Access,
  Adoption,
  AssemblyPolicies,
  ContextRegistration,
  ContextSourceRegistry,
  ContextTarget,
  PrincipalKey,
  RegistrationResult,
  SourceDecision,
  SourceRead,
} from '@omne-harness/request-context-contract'
import { decodePrincipalKey } from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  testingAccess,
} from '@omne-harness/request-context-contract/testing'
import type { RequestContextTrust } from '../trust.js'

/** Every answer is listed; an input that is not listed is answered `unavailable`. */
export type RequestContextTrustScript<P> = Readonly<{
  keys: readonly Readonly<{ access: Access<P>; result: SourceRead<PrincipalKey> }>[]
  grants: readonly Readonly<{
    access: Access<P>
    target: ContextTarget
    owner: Adoption
    action: 'register' | 'replace'
    decision: SourceDecision
  }>[]
}>

/** Structural equality of plain data; a field the script does not state is a difference. */
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const names = Object.keys(a)
  if (names.length !== Object.keys(b).length) return false
  return names.every(name => Object.hasOwn(b, name) && same(a[name], b[name]))
}

const unlisted = (what: string) => ({
  kind: 'unavailable' as const,
  diagnostic: `The scripted trust lists no ${what} for this input`,
})

/** A trust object that answers only what the script lists; success is never a default. */
export function createScriptedRequestContextTrust<P>(
  script: RequestContextTrustScript<P>,
): RequestContextTrust<P> {
  return {
    principalBinding: {
      async key(access) {
        const hit = script.keys.find(entry => same(entry.access, access))
        return hit === undefined ? unlisted('key') : hit.result
      },
    },
    registrationAuthority: {
      async check(input) {
        const hit = script.grants.find(
          entry =>
            same(entry.access, input.access) &&
            same(entry.target, input.target) &&
            same(entry.owner, input.owner) &&
            entry.action === input.action,
        )
        return hit === undefined ? unlisted('grant') : hit.decision
      },
    },
  }
}

export interface RequestContextTrustFixture<P> {
  /**
   * Two different tenants minted by the identity owner. The suite cannot mint tenants itself:
   * a tenant is accepted only when the identity owner minted it.
   */
  readonly tenants: readonly [Tenant, Tenant]
  createRegistry(
    input: Readonly<{ trust: RequestContextTrust<P>; policies: AssemblyPolicies }>,
  ): ContextSourceRegistry<P>
}
export type RequestContextTrustCase = Readonly<{
  name: string
  clause: string
  run(): Promise<void>
}>

type Fixture = ReturnType<typeof createAssemblyFixture>
type Tenant = Fixture['target']['tenant']
const OK: SourceDecision = { kind: 'allowed' }
const SERVED = 'candidate-before-extension'

function expectThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}
function expectKind(actual: { kind: string }, expected: string, what: string): void {
  expectThat(actual.kind === expected, `${what}: expected ${expected}, got ${actual.kind}`)
}
function principalKey(text: string): PrincipalKey {
  const decoded = decodePrincipalKey(text)
  if ('failure' in decoded) throw new Error('Suite principal key')
  return decoded.ok
}
function handleOf(result: RegistrationResult, what: string): ContextRegistration {
  if (result.kind !== 'registered')
    throw new Error(`${what}: expected registered, got ${result.kind}`)
  return result.handle
}
const ownerOf = (revision: string): Adoption => ({
  owner: 'trust-suite',
  name: 'sources',
  revision,
  digest: `digest-${revision}`,
})
const keyed = (f: Fixture) => ({
  access: f.call.access,
  result: { kind: 'value' as const, value: principalKey('principal_a') },
})
const grant = (
  f: Fixture,
  owner: Adoption,
  action: 'register' | 'replace',
  decision: SourceDecision = OK,
  access: Access<string> = f.call.access,
  target = f.target,
) => ({ access, target, owner, action, decision })

function build(
  fixture: RequestContextTrustFixture<string>,
  f: Fixture,
  script: RequestContextTrustScript<string>,
) {
  const registry = fixture.createRegistry({
    trust: createScriptedRequestContextTrust<string>(script),
    policies: f.policies,
  })
  const access = f.call.access
  const register = (owner: Adoption) =>
    registry.register({ access, target: f.target, owner, sources: f.sources })
  const served = (who: Access<string> = access) =>
    registry.assembly(f.target).assemble({ ...f.call, access: who })
  return { registry, access, register, served }
}

const cases = (fixture: RequestContextTrustFixture<string>): readonly RequestContextTrustCase[] => [
  {
    name: 'cross-tenant-keys-stay-apart',
    clause: 'RQ-12 principalBinding: one key means one principal and one acting tenant',
    async run() {
      const a = createAssemblyFixture({ tenant: fixture.tenants[0] })
      const b = createAssemblyFixture({ tenant: fixture.tenants[1] })
      const owner = ownerOf('1')
      const accessB = testingAccess(a.call.access.principal, b.target.tenant)
      // The same principal text acts in two tenants; only the first tenant has a key.
      const registry = fixture.createRegistry({
        trust: createScriptedRequestContextTrust<string>({
          keys: [keyed(a)],
          grants: [grant(a, owner, 'register'), grant(b, owner, 'register', OK, accessB, b.target)],
        }),
        policies: a.policies,
      })
      handleOf(
        await registry.register({
          access: a.call.access,
          target: a.target,
          owner,
          sources: a.sources,
        }),
        'tenant a registration',
      )
      handleOf(
        await registry.register({ access: accessB, target: b.target, owner, sources: b.sources }),
        'tenant b registration',
      )
      expectKind(
        await registry.assembly(a.target).assemble(a.call),
        SERVED,
        'the keyed tenant is served',
      )
      const other = await registry.assembly(b.target).assemble({ ...b.call, access: accessB })
      expectKind(other, 'unavailable', 'the other tenant reuses no key of the first')
    },
  },
  {
    name: 'forged-principal-is-not-keyed',
    clause: 'RQ-12 principalBinding: an unverified principal gets no key',
    async run() {
      const f = createAssemblyFixture()
      const owner = ownerOf('1')
      const forged = testingAccess('forged', f.target.tenant)
      const { register, served } = build(fixture, f, {
        keys: [keyed(f), { access: forged, result: { kind: 'denied' } }],
        grants: [grant(f, owner, 'register')],
      })
      handleOf(await register(owner), 'registration')
      expectKind(await served(), SERVED, 'the verified principal is served')
      expectKind(await served(forged), 'denied', 'a forged principal')
    },
  },
  {
    name: 'foreign-expected-is-not-replaceable',
    clause: 'RQ-12 replace: a registration of another tenant answers as one that does not exist',
    async run() {
      const f = createAssemblyFixture({ tenant: fixture.tenants[0] })
      const g = createAssemblyFixture({ tenant: fixture.tenants[1] })
      const owner = ownerOf('1')
      const foreign = testingAccess('p', g.target.tenant)
      const { register, registry } = build(fixture, f, {
        keys: [],
        grants: [grant(f, owner, 'register'), grant(f, owner, 'replace', OK, foreign, f.target)],
      })
      const handle = handleOf(await register(owner), 'registration')
      const result = await registry.replace({
        access: foreign,
        expected: handle.ref,
        sources: g.sources,
      })
      expectKind(result, 'conflict', 'a foreign expected registration')
    },
  },
  {
    name: 'owner-revision-takes-part',
    clause: 'RQ-12 registration authority: the full owner adoption takes part in the check',
    async run() {
      const f = createAssemblyFixture()
      const owner = ownerOf('2')
      const { register, registry } = build(fixture, f, {
        keys: [keyed(f)],
        grants: [grant(f, owner, 'register'), grant(f, owner, 'replace')],
      })
      const handle = handleOf(await register(owner), 'registration with the listed owner')
      handleOf(
        await registry.replace({ access: f.call.access, expected: handle.ref, sources: f.sources }),
        'replace under the registered owner',
      )
    },
  },
  {
    name: 'authority-answers-are-returned',
    clause:
      'RQ-12 registration authority: denied, unknown and unavailable are returned, nothing is published',
    async run() {
      // A refused or undecided registration publishes nothing.
      for (const decision of [{ kind: 'denied' }, { kind: 'unknown' }] as SourceDecision[]) {
        const f = createAssemblyFixture()
        const owner = ownerOf('1')
        const { register, served } = build(fixture, f, {
          keys: [keyed(f)],
          grants: [grant(f, owner, 'register', decision)],
        })
        expectKind(await register(owner), decision.kind, `authority ${decision.kind}`)
        expectKind(await served(), 'unavailable', `nothing is published after ${decision.kind}`)
      }
      // An authority that cannot answer a replace is returned and the old set keeps serving.
      const f = createAssemblyFixture()
      const owner = ownerOf('1')
      const offline: SourceDecision = { kind: 'unavailable', diagnostic: 'authority offline' }
      const { register, registry, served, access } = build(fixture, f, {
        keys: [keyed(f)],
        grants: [grant(f, owner, 'register'), grant(f, owner, 'replace', offline)],
      })
      const handle = handleOf(await register(owner), 'registration')
      const replaced = await registry.replace({ access, expected: handle.ref, sources: f.sources })
      expectKind(replaced, 'unavailable', 'an authority that cannot answer')
      expectKind(await served(), SERVED, 'the old set keeps serving')
    },
  },
  {
    name: 'source-set-cannot-self-grant',
    clause:
      'RQ-12 registration authority: the eligibility inside the source set grants no registration',
    async run() {
      const f = createAssemblyFixture()
      const { register, served } = build(fixture, f, { keys: [], grants: [] })
      expectKind(await register(ownerOf('1')), 'unavailable', 'an unlisted registration')
      expectKind(await served(), 'unavailable', 'nothing is published')
    },
  },
  {
    name: 'revoked-authority-refuses-replace',
    clause:
      'RQ-12 replace: every replace asks the authority again; a refused replace keeps the old set',
    async run() {
      const f = createAssemblyFixture()
      const owner = ownerOf('1')
      const { register, registry, served, access } = build(fixture, f, {
        keys: [keyed(f)],
        grants: [grant(f, owner, 'register'), grant(f, owner, 'replace', { kind: 'denied' })],
      })
      const handle = handleOf(await register(owner), 'registration')
      const replaced = await registry.replace({ access, expected: handle.ref, sources: f.sources })
      expectKind(replaced, 'denied', 'a replace after the grant was revoked')
      expectKind(await served(), SERVED, 'the old set keeps serving')
    },
  },
  {
    name: 'old-generation-keeps-successor',
    clause: 'RQ-12 replace: a late withdraw of the old handle never removes the successor',
    async run() {
      const f = createAssemblyFixture()
      const owner = ownerOf('1')
      const { register, registry, served, access } = build(fixture, f, {
        keys: [keyed(f)],
        grants: [grant(f, owner, 'register'), grant(f, owner, 'replace')],
      })
      const old = handleOf(await register(owner), 'registration')
      handleOf(await registry.replace({ access, expected: old.ref, sources: f.sources }), 'replace')
      const withdrawn = old.withdraw()
      expectKind(await withdrawn.settled, 'settled', 'the old generation settles')
      expectKind(await served(), SERVED, 'the successor keeps serving')
    },
  },
  {
    name: 'closed-registry-refuses-registration',
    clause: 'RQ-12 close: a closed registry takes no registration and settles what it held',
    async run() {
      const f = createAssemblyFixture()
      const owner = ownerOf('1')
      const { register, registry, served } = build(fixture, f, {
        keys: [keyed(f)],
        grants: [grant(f, owner, 'register')],
      })
      const handle = handleOf(await register(owner), 'registration')
      expectKind(await registry.close(), 'settled', 'close')
      expectKind(await register(owner), 'unavailable', 'a registration after close')
      expectKind(await handle.withdraw().settled, 'settled', 'the old handle settles')
      expectKind(await served(), 'unavailable', 'a closed registry serves nothing')
    },
  },
]

/** The cases of the trust suite; run each one and report it by `name`. */
export function requestContextTrustConformance<P>(
  fixture: RequestContextTrustFixture<P>,
): readonly RequestContextTrustCase[] {
  return cases(fixture as unknown as RequestContextTrustFixture<string>)
}

export { createMemoryContextHolder } from './holder-sources.js'
export type { MemoryContextHolder, MemoryContextHolderOptions } from './holder-sources.js'
export { contextHolderSourcesConformance } from './holder-sources-conformance.js'
export type {
  ContextHolderPartCall,
  ContextHolderSourcesCase,
  ContextHolderSourcesFixture,
  ContextHolderUnderTest,
} from './holder-sources-conformance.js'
