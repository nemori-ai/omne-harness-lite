// The source registry (RQ-12): one source set per target, generations, borrows, publication.
import { describe, expect, it } from 'vitest'
import { createContextSourceRegistry } from '@omne-harness/request-context'
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
    f.sources.afterSourceRead('tools', () => {
      void registry.replace({
        access: f.call.access,
        expected: first.ref,
        sources: createAssemblyFixture().sources,
      })
    })
    const result = await registry.assembly(f.target).assemble(f.call)
    expect(result).toMatchObject({ kind: 'unavailable', owner: 'source-registry' })
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
