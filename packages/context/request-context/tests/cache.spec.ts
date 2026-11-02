// CX-14 through the real registry: the cache of a generation serves hot calls, never serves another
// principal, tenant or generation, never outlives its generation, and never replaces a call's
// checks of access, measurement or outcome.
import { describe, expect, it } from 'vitest'
import { createContextSourceRegistry } from '@omne-harness/request-context'
import {
  decodeHistorySequence,
  type AssemblyResult,
  type ContextSourceRegistry,
} from '@omne-harness/request-context-contract'
import {
  countingBasis,
  createAssemblyFixture,
  createScriptedInputMeter,
  createTestingPrincipalBinding,
  fixtureBudget,
  type AssemblyFixture,
} from '@omne-harness/request-context-contract/testing'
import { historyRow, tenantOf, userMessage } from './fixtures/messages.ts'

const owner = { owner: 'test', name: 'sources', revision: '1', digest: 'd' }
const rows = (count = 8) => Array.from({ length: count }, (_, i) => historyRow(i, userMessage(i)))

function candidateOf(result: AssemblyResult) {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(`expected a candidate, got ${JSON.stringify(result)}`)
  return result.candidate
}
function registryFor(f: AssemblyFixture): ContextSourceRegistry<string> {
  return createContextSourceRegistry<string>({
    principalBinding: createTestingPrincipalBinding<string>(),
    registrationAuthority: { check: async () => ({ kind: 'allowed' }) },
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
/** What the history port really returned to the registry's operations. */
function counted(f: AssemblyFixture) {
  const counts = { pages: 0, rows: 0 }
  const reader = f.history as unknown as { read: AssemblyFixture['history']['read'] }
  const original = reader.read.bind(f.history)
  reader.read = async input => {
    counts.pages++
    const result = await original(input)
    if (result.kind === 'page') counts.rows += result.page.rows.length
    return result
  }
  return counts
}
function growTo(f: AssemblyFixture, index: number) {
  const seq = decodeHistorySequence(String(index))
  if ('failure' in seq) throw new Error('fixture')
  const history = f.sources.values().history
  f.sources.update('history', {
    ...history,
    evidence: { ...history.evidence, upper: { kind: 'entry', seq: seq.ok } },
  })
}
/** Holds the next read of the tools group until `open`, to keep one call in flight. */
function holdTools(f: AssemblyFixture) {
  let open: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })
  let reached: () => void = () => {}
  const inside = new Promise<void>(resolve => {
    reached = resolve
  })
  const original = f.sources.groups.tools.readSource
  let held = false
  ;(f.sources.groups.tools as { readSource: typeof original }).readSource = async call => {
    const value = await original(call)
    if (!held) {
      held = true
      reached()
      await gate
    }
    return value
  }
  return { inside, open }
}

describe('a hot call gives the content of a cold call', () => {
  it('CX-14 reads no page for a repeated call and only the tail for a longer history', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    growTo(f, 3)
    const cold = candidateOf(await assembly.assemble(f.call))
    expect(counts).toEqual({ pages: 1, rows: 4 })
    const hot = candidateOf(await assembly.assemble(f.call))
    expect(counts).toEqual({ pages: 1, rows: 4 })
    expect(hot.assembled).toEqual(cold.assembled)
    expect(hot.layers).toEqual(cold.layers)
    expect(hot.coverage).toEqual(cold.coverage)
    growTo(f, 5)
    const longer = candidateOf(await assembly.assemble(f.call))
    expect(counts).toEqual({ pages: 2, rows: 6 })
    // A registry without a cache entry derives the same content from the sources.
    const fresh = createAssemblyFixture({ rows: rows() })
    growTo(fresh, 5)
    const alone = candidateOf(await fresh.operations().assemble(fresh.call))
    expect(longer.layers.historyHead).toEqual(alone.layers.historyHead)
    expect(longer.layers.historyBody).toEqual(alone.layers.historyBody)
    expect(longer.preparation.view).toEqual(alone.preparation.view)
  })

  it('CX-14 meters every cache hit and lets the second measurement decide', async () => {
    let measured = 0
    const f = createAssemblyFixture({
      rows: rows(),
      preparation: {
        meter: createScriptedInputMeter(countingBasis, () => ({
          ok: fixtureBudget(measured++ < 2 ? '1' : '5000'),
        })),
      },
    })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    candidateOf(await assembly.assemble(f.call))
    const leases = f.preparation.calls().length
    const second = await assembly.assemble(f.call)
    // The history was not read again, yet the measurement ran again and changed the outcome.
    expect(counts.pages).toBe(1)
    expect(f.preparation.calls().length - leases).toBe(2)
    expect(second.kind).not.toBe('candidate-fixable')
    expect(second.kind).not.toBe('candidate-before-extension')
  })

  it('CX-14 rejects a hot call after the eligibility was withdrawn', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    candidateOf(await assembly.assemble(f.call))
    const eligibility = f.sources.eligibility as unknown as {
      set(decision: 'allowed' | { kind: 'denied' }): void
    }
    eligibility.set({ kind: 'denied' })
    expect(await assembly.assemble(f.call)).toMatchObject({ kind: 'denied' })
    eligibility.set('allowed')
    candidateOf(await assembly.assemble(f.call))
    expect(counts.pages).toBe(1)
  })
})

describe('the cache is partitioned by who asks and by what was registered', () => {
  it('CX-14 reads the history again for another principal of the same tenant', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    candidateOf(await assembly.assemble(f.call))
    const other = { ...f.call, access: { ...f.call.access, principal: 'someone-else' } }
    candidateOf(await assembly.assemble(other))
    expect(counts.pages).toBe(2)
    // Each principal then has its own hot entry.
    candidateOf(await assembly.assemble(f.call))
    candidateOf(await assembly.assemble(other))
    expect(counts.pages).toBe(2)
  })

  it('CX-14 keeps positions and purposes apart', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    candidateOf(await assembly.assemble(f.call))
    candidateOf(await assembly.assemble({ ...f.call, position: 'position:2' as never }))
    candidateOf(await assembly.assemble({ ...f.call, purpose: 'extension' }))
    expect(counts.pages).toBe(3)
  })

  it('CX-14 answers a caller of another tenant before any cache or history read', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    candidateOf(await assembly.assemble(f.call))
    const outsider = { ...f.call, access: { principal: 'p', tenant: tenantOf('9') } }
    expect(await assembly.assemble(outsider)).toMatchObject({ kind: 'denied' })
    expect(counts.pages).toBe(1)
  })
})

describe('the cache lives and dies with its generation', () => {
  it('CX-14 rejects cached publication after replacement', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    const first = await registered(registry, f)
    const assembly = registry.assembly(f.target)
    candidateOf(await assembly.assemble(f.call))
    const hold = holdTools(f)
    growTo(f, 5)
    const running = assembly.assemble(f.call)
    await hold.inside
    // The successor has other sources, and its history is read from the first row.
    const next = createAssemblyFixture({ rows: rows() })
    const counts = counted(next)
    const replaced = await registry.replace({
      access: f.call.access,
      expected: first.ref,
      sources: next.sources,
    })
    expect(replaced.kind).toBe('registered')
    hold.open()
    expect(await running).toMatchObject({ kind: 'unavailable', owner: 'source-registry' })
    candidateOf(await assembly.assemble(next.call))
    expect(counts.rows).toBe(8)
  })

  it('CX-14 starts empty after a withdrawn set is registered again', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    const handle = await registered(registry, f)
    candidateOf(await registry.assembly(f.target).assemble(f.call))
    handle.withdraw()
    expect(await registry.assembly(f.target).assemble(f.call)).toMatchObject({
      kind: 'unavailable',
      owner: 'source-registry',
    })
    const counts = counted(f)
    await registered(registry, f)
    candidateOf(await registry.assembly(f.target).assemble(f.call))
    expect(counts.rows).toBe(8)
  })

  it('CX-14 lets a slower older call return its result without replacing newer material', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    growTo(f, 1)
    const hold = holdTools(f)
    const older = assembly.assemble(f.call)
    await hold.inside
    growTo(f, 5)
    candidateOf(await assembly.assemble(f.call))
    hold.open()
    const late = candidateOf(await older)
    expect(late.preparation.rows).toHaveLength(2)
    const pages = counts.pages
    // The newer material is still the slot content: the same evidence needs no page.
    candidateOf(await assembly.assemble(f.call))
    expect(counts.pages).toBe(pages)
  })

  it('CX-14 keeps nothing from a call that failed', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    const eligibility = f.sources.eligibility as unknown as {
      set(decision: 'allowed' | { kind: 'denied' }): void
    }
    f.sources.afterSourceRead('control', () => eligibility.set({ kind: 'denied' }))
    expect(await assembly.assemble(f.call)).toMatchObject({ kind: 'denied' })
    eligibility.set('allowed')
    candidateOf(await assembly.assemble(f.call))
    // The failed call staged material, but only a published result keeps it.
    expect(counts.rows).toBe(16)
  })

  it('CX-14 bounds the slots of one generation', async () => {
    const f = createAssemblyFixture({ rows: rows() })
    const registry = registryFor(f)
    await registered(registry, f)
    const counts = counted(f)
    const assembly = registry.assembly(f.target)
    for (let i = 0; i < 40; i++)
      candidateOf(await assembly.assemble({ ...f.call, position: `position:${i}` as never }))
    const pages = counts.pages
    // The newest position is still hot, the oldest was evicted.
    candidateOf(await assembly.assemble({ ...f.call, position: 'position:39' as never }))
    expect(counts.pages).toBe(pages)
    candidateOf(await assembly.assemble({ ...f.call, position: 'position:0' as never }))
    expect(counts.pages).toBe(pages + 1)
  })
})
