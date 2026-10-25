// The source registry (RQ-12): one source set per target, generations, borrows, publication.
import { describe, expect, it } from 'vitest'
import { createContextSourceRegistry } from '@omne-harness/request-context'
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  Adoption,
  AssemblyResult,
  ContextSourceRegistry,
  SourceDecision,
  SourceRegistrationAuthority,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createTestingPrincipalBinding,
  requestContextConformance,
  runConformanceCase,
  type AssemblyFixture,
  type ConformanceSubject,
} from '@omne-harness/request-context-contract/testing'

function tenantOf(account: string) {
  const parsed = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!parsed.ok) throw new Error('Tenant fixture')
  return parsed.value
}
const owner: Adoption = { owner: 'test', name: 'sources', revision: '1', digest: 'd' }

function authority(
  decide: () => SourceDecision | Promise<SourceDecision> = () => ({ kind: 'allowed' }),
) {
  const calls: string[] = []
  const value: SourceRegistrationAuthority<string> = {
    async check(input) {
      calls.push(input.action)
      return decide()
    },
  }
  return { value, calls }
}
function registryFor(f: AssemblyFixture, auth = authority().value): ContextSourceRegistry<string> {
  return createContextSourceRegistry<string>({
    principalBinding: createTestingPrincipalBinding<string>(),
    registrationAuthority: auth,
    policies: f.policies,
  })
}
async function registered(registry: ContextSourceRegistry<string>, f: AssemblyFixture) {
  const result = await registry.register({
    access: f.call.access,
    target: f.target,
    owner,
    sources: f.sources,
  })
  if (result.kind !== 'registered') throw new Error(result.kind)
  return result.handle
}
function deferred() {
  let open: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })
  return { gate, open }
}

describe('registration', () => {
  it('a second registration of the same target is a conflict; the first keeps serving', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    await registered(registry, f)
    const second = await registry.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: createAssemblyFixture().sources,
    })
    expect(second).toEqual({ kind: 'conflict' })
    expect((await registry.assembly(f.target).assemble(f.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
  it.each([
    [{ kind: 'denied' as const }],
    [{ kind: 'unknown' as const }],
    [{ kind: 'unavailable' as const, diagnostic: 'authority offline' }],
  ])('an authority decision %j is returned and nothing is published', async decision => {
    const f = createAssemblyFixture()
    const registry = registryFor(f, authority(() => decision).value)
    expect(
      await registry.register({
        access: f.call.access,
        target: f.target,
        owner,
        sources: f.sources,
      }),
    ).toEqual(decision)
    expect(await registry.assembly(f.target).assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'source-registry',
    })
  })
  it('a registration without access is invalid and asks no authority', async () => {
    const f = createAssemblyFixture()
    const auth = authority()
    const registry = registryFor(f, auth.value)
    expect(
      await registry.register({
        access: null as never,
        target: f.target,
        owner,
        sources: f.sources,
      }),
    ).toMatchObject({ kind: 'invalid', field: 'access' })
    expect(auth.calls).toEqual([])
  })
  it('generations are never reused across register and replace', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const first = await registered(registry, f)
    const next = await registry.replace({
      access: f.call.access,
      expected: first.ref,
      sources: createAssemblyFixture().sources,
    })
    if (next.kind !== 'registered') throw new Error(next.kind)
    expect(next.handle.generation).not.toBe(first.generation)
    expect(next.handle.ref).not.toBe(first.ref)
  })
})

describe('replace and withdraw', () => {
  it('replace with a stale expected ref is a conflict', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const first = await registered(registry, f)
    const next = await registry.replace({
      access: f.call.access,
      expected: first.ref,
      sources: f.sources,
    })
    expect(next.kind).toBe('registered')
    expect(
      await registry.replace({ access: f.call.access, expected: first.ref, sources: f.sources }),
    ).toEqual({ kind: 'conflict' })
  })
  it('withdrawing the old handle after replace does not remove its successor', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const first = await registered(registry, f)
    const next = await registry.replace({
      access: f.call.access,
      expected: first.ref,
      sources: f.sources,
    })
    if (next.kind !== 'registered') throw new Error(next.kind)
    first.withdraw()
    expect((await registry.assembly(f.target).assemble(f.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
  it('withdraw returns the same receipt each time and stops new borrows', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const handle = await registered(registry, f)
    const a = handle.withdraw()
    expect(handle.withdraw()).toBe(a)
    await expect(a.settled).resolves.toEqual({ kind: 'settled' })
    expect(await registry.assembly(f.target).assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'source-registry',
    })
  })
  it('settled waits for an operation in flight, and that operation does not publish', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const handle = await registered(registry, f)
    const hold = deferred()
    let reached: () => void = () => {}
    const inside = new Promise<void>(resolve => {
      reached = resolve
    })
    f.sources.afterSourceRead('tools', () => {
      reached()
    })
    const original = f.sources.groups.tools.readSource
    ;(f.sources.groups.tools as { readSource: typeof original }).readSource = async call => {
      const value = await original(call)
      await hold.gate
      return value
    }
    const running = registry.assembly(f.target).assemble(f.call)
    await inside
    const receipt = handle.withdraw()
    let settled = false
    void receipt.settled.then(() => {
      settled = true
    })
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    hold.open()
    const result: AssemblyResult = await running
    expect(result).toMatchObject({ kind: 'unavailable', owner: 'source-registry' })
    await expect(receipt.settled).resolves.toEqual({ kind: 'settled' })
  })
  it('a result computed against a replaced generation is not published', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const first = await registered(registry, f)
    const original = f.sources.groups.tools.readSource
    let replaced: Awaited<ReturnType<typeof registry.replace>> | null = null
    ;(f.sources.groups.tools as { readSource: typeof original }).readSource = async call => {
      const value = await original(call)
      replaced ??= await registry.replace({
        access: f.call.access,
        expected: first.ref,
        sources: createAssemblyFixture().sources,
      })
      return value
    }
    const result = await registry.assembly(f.target).assemble(f.call)
    expect(replaced).toMatchObject({ kind: 'registered' })
    expect(result).toMatchObject({ kind: 'unavailable', owner: 'source-registry' })
    // The successor serves the next operation.
    expect((await registry.assembly(f.target).assemble(f.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
})

describe('the prepared key names the source generation', () => {
  it('a hosted candidate carries the generation of the borrowed set; a standalone one carries null', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const handle = await registered(registry, f)
    const hosted = await registry.assembly(f.target).assemble(f.call)
    const standalone = await f.operations().assemble(f.call)
    if (
      hosted.kind !== 'candidate-before-extension' ||
      standalone.kind !== 'candidate-before-extension'
    )
      throw new Error('Expected candidates')
    expect(hosted.candidate.preparation.key.generation).toBe(handle.generation)
    expect(standalone.candidate.preparation.key.generation).toBeNull()
  })
})

describe('close', () => {
  it('refuses new registrations and borrows and settles every generation', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    await registered(registry, f)
    await expect(registry.close()).resolves.toEqual({ kind: 'settled' })
    expect(
      await registry.register({
        access: f.call.access,
        target: f.target,
        owner,
        sources: f.sources,
      }),
    ).toMatchObject({ kind: 'unavailable' })
    expect(await registry.assembly(f.target).assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'source-registry',
    })
  })
  it('names the owner of a source set whose preparation lease was not given back', async () => {
    const f = createAssemblyFixture({
      preparation: {
        release: () => ({
          failure: { kind: 'unavailable', dependency: 'lease', diagnostic: 'stuck' },
        }),
      },
    })
    const registry = registryFor(f)
    await registered(registry, f)
    const leaked = await registry.assembly(f.target).assemble(f.call)
    expect(leaked).toMatchObject({ owner: 'preparation' })
    await expect(registry.close()).resolves.toEqual({ kind: 'unavailable', outstanding: [owner] })
  })
})

describe('the registry assembly passes the operation conformance suite', () => {
  const subject: ConformanceSubject = {
    async operations(f) {
      const registry = registryFor(f)
      await registered(registry, f)
      return registry.assembly(f.target)
    },
  }
  for (const item of requestContextConformance())
    it(item.name, async () => {
      await expect(runConformanceCase(item, subject)).resolves.toEqual({ kind: 'passed' })
    })
})

const stuck = () => ({
  failure: { kind: 'unavailable' as const, dependency: 'lease', diagnostic: 'stuck' },
})
const planFails = () => ({
  failure: { kind: 'unavailable' as const, dependency: 'rules', diagnostic: 'no plan' },
})

describe('leases are recorded per generation (RQ-05, RQ-12)', () => {
  it('a failed operation whose lease also fails to come back keeps both failures', async () => {
    const f = createAssemblyFixture({ preparation: { plan: planFails as never, release: stuck } })
    const registry = registryFor(f)
    await registered(registry, f)
    // The main failure is returned; the give-back failure is not dropped.
    expect(await registry.assembly(f.target).assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'meter',
    })
    await expect(registry.close()).resolves.toEqual({ kind: 'unavailable', outstanding: [owner] })
  })
  it('a generation that leaked and settled before close is still reported by close', async () => {
    let leak = true
    const f = createAssemblyFixture({ preparation: { release: () => (leak ? stuck() : {}) } })
    const registry = registryFor(f)
    const first = await registered(registry, f)
    await registry.assembly(f.target).assemble(f.call)
    leak = false
    const next = await registry.replace({
      access: f.call.access,
      expected: first.ref,
      sources: f.sources,
    })
    expect(next.kind).toBe('registered')
    await expect(first.withdraw().settled).resolves.toEqual({
      kind: 'unavailable',
      outstanding: [owner],
    })
    await expect(registry.close()).resolves.toEqual({ kind: 'unavailable', outstanding: [owner] })
  })
  it('lists an owner once although several of its generations leaked; a clean set settles', async () => {
    const f = createAssemblyFixture({ preparation: { release: stuck } })
    const registry = registryFor(f)
    const first = await registered(registry, f)
    await registry.assembly(f.target).assemble(f.call)
    const next = await registry.replace({
      access: f.call.access,
      expected: first.ref,
      sources: f.sources,
    })
    if (next.kind !== 'registered') throw new Error(next.kind)
    await registry.assembly(f.target).assemble(f.call)
    await expect(registry.close()).resolves.toEqual({ kind: 'unavailable', outstanding: [owner] })
    const clean = createAssemblyFixture()
    const other = registryFor(clean)
    const handle = await registered(other, clean)
    await other.assembly(clean.target).assemble(clean.call)
    await expect(handle.withdraw().settled).resolves.toEqual({ kind: 'settled' })
    await expect(other.close()).resolves.toEqual({ kind: 'settled' })
  })
})

describe('a caller of another tenant learns nothing about registrations', () => {
  const stranger = { principal: 'p', tenant: tenantOf('9') }
  it('register from another tenant is denied whether or not the target is registered', async () => {
    const f = createAssemblyFixture()
    const auth = authority()
    const registry = registryFor(f, auth.value)
    const before = await registry.register({
      access: stranger,
      target: f.target,
      owner,
      sources: f.sources,
    })
    await registered(registry, f)
    const after = await registry.register({
      access: stranger,
      target: f.target,
      owner,
      sources: f.sources,
    })
    expect(before).toEqual({ kind: 'denied' })
    expect(after).toEqual(before)
    expect(auth.calls).toEqual(['register'])
  })
  it('replace with a reference of another tenant answers as an unknown reference', async () => {
    const f = createAssemblyFixture()
    const auth = authority()
    const registry = registryFor(f, auth.value)
    const handle = await registered(registry, f)
    const foreign = await registry.replace({
      access: stranger,
      expected: handle.ref,
      sources: f.sources,
    })
    handle.withdraw()
    const unknown = await registry.replace({
      access: stranger,
      expected: handle.ref,
      sources: f.sources,
    })
    expect(foreign).toEqual({ kind: 'conflict' })
    expect(unknown).toEqual(foreign)
    expect(auth.calls).toEqual(['register'])
  })
  it.each(['assemble', 'planCompaction', 'resume'] as const)(
    '%s from another tenant is denied whether or not the target is registered',
    async operation => {
      const f = createAssemblyFixture()
      const registry = registryFor(f)
      const call = { ...f.call, access: stranger }
      const before = await registry.assembly(f.target)[operation](call)
      await registered(registry, f)
      const after = await registry.assembly(f.target)[operation](call)
      expect(before).toMatchObject({ kind: 'denied' })
      expect(after).toEqual(before)
      expect(f.sources.sourceReads('control')).toBe(0)
    },
  )
  it('deriveStep from another tenant is denied before the registration is looked up', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const input = { call: { ...f.call, access: stranger } } as never
    expect(await registry.assembly(f.target).deriveStep(input)).toMatchObject({ kind: 'denied' })
  })
  it('an operation without access is invalid, not an answer about the registration', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    expect(
      await registry.assembly(f.target).assemble({ ...f.call, access: null as never }),
    ).toMatchObject({ kind: 'invalid', field: 'access', reason: 'missing-access' })
  })
})

describe('the decision is the last await before the registration changes', () => {
  function gated() {
    let open: (d: SourceDecision) => void = () => {}
    const calls: string[] = []
    const value: SourceRegistrationAuthority<string> = {
      check: input => {
        calls.push(input.action)
        return new Promise(resolve => {
          open = resolve
        })
      },
    }
    return { value, calls, open: (d: SourceDecision = { kind: 'allowed' }) => open(d) }
  }
  it('two registrations that both pass the authority: the second is a conflict', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const a = registry.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: f.sources,
    })
    const b = registry.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: f.sources,
    })
    expect((await a).kind).toBe('registered')
    expect(await b).toEqual({ kind: 'conflict' })
  })
  it('a registry closed while the authority decides refuses the registration', async () => {
    const f = createAssemblyFixture()
    const auth = gated()
    const registry = registryFor(f, auth.value)
    const pending = registry.register({
      access: f.call.access,
      target: f.target,
      owner,
      sources: f.sources,
    })
    await Promise.resolve()
    await registry.close()
    auth.open()
    expect(await pending).toMatchObject({ kind: 'unavailable' })
  })
  it('replace: a refused decision is returned; the current set keeps serving', async () => {
    const f = createAssemblyFixture()
    let answer: SourceDecision = { kind: 'allowed' }
    const registry = registryFor(f, authority(() => answer).value)
    const handle = await registered(registry, f)
    answer = { kind: 'denied' }
    expect(
      await registry.replace({ access: f.call.access, expected: handle.ref, sources: f.sources }),
    ).toEqual({ kind: 'denied' })
    expect((await registry.assembly(f.target).assemble(f.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
  it('replace: a set replaced or a registry closed during the decision is refused', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const handle = await registered(registry, f)
    const a = registry.replace({ access: f.call.access, expected: handle.ref, sources: f.sources })
    const b = registry.replace({ access: f.call.access, expected: handle.ref, sources: f.sources })
    expect((await a).kind).toBe('registered')
    expect(await b).toEqual({ kind: 'conflict' })
    const g = createAssemblyFixture()
    const auth = gated()
    const closing = registryFor(g, auth.value)
    const pendingRegister = closing.register({
      access: g.call.access,
      target: g.target,
      owner,
      sources: g.sources,
    })
    auth.open()
    const registeredHandle = await pendingRegister
    if (registeredHandle.kind !== 'registered') throw new Error(registeredHandle.kind)
    const pendingReplace = closing.replace({
      access: g.call.access,
      expected: registeredHandle.handle.ref,
      sources: g.sources,
    })
    await Promise.resolve()
    await closing.close()
    auth.open()
    expect(await pendingReplace).toMatchObject({ kind: 'unavailable' })
  })
  it('replace retires the old generation: its settlement completes', async () => {
    const f = createAssemblyFixture()
    const registry = registryFor(f)
    const handle = await registered(registry, f)
    await registry.replace({ access: f.call.access, expected: handle.ref, sources: f.sources })
    await expect(handle.withdraw().settled).resolves.toEqual({ kind: 'settled' })
  })
  it('replace without access is invalid and asks no authority', async () => {
    const f = createAssemblyFixture()
    const auth = authority()
    const registry = registryFor(f, auth.value)
    const handle = await registered(registry, f)
    expect(
      await registry.replace({ access: null as never, expected: handle.ref, sources: f.sources }),
    ).toMatchObject({ kind: 'invalid', field: 'access' })
    expect(auth.calls).toEqual(['register'])
  })
})
