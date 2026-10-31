import { AssertionError } from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { DurableEvidence, SourceLayer } from '@omne-harness/tool-contract'
import {
  planAdoption,
  sameBindingKey,
  sameShape,
  type AdoptionFacts,
  type AdoptionPlan,
  type ToolAuthority,
  type ToolBindingKey,
  type ToolShape,
} from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import type {
  ToolResidencyReader,
  ToolResidencyReference,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createMemoryToolBindingRegistry,
  memoryToolBindingRegistryFixture,
  toolResidencyReaderConformance,
} from '@omne-harness/tool-cordis-contract/testing'

const otherTenant = testingTenant(
  'org_c0nf0rmance000000000000000',
  'acc_c0nf0rmance0ther0000000000',
)

function fixture() {
  const registry = memoryToolBindingRegistryFixture()
  const loaded = registry.loaded(registry.authority, 'first-shape')
  const references: readonly ToolResidencyReference[] = [
    { holder: 'opaque-holder', tenant: registry.access.tenant, shape: loaded.shape },
    {
      holder: 'opaque-holder',
      tenant: otherTenant,
      shape: { ...loaded.shape, name: 'different-first-shape' },
    },
  ]
  let unavailable = false
  const reader: ToolResidencyReader = {
    async referencing({ after }) {
      if (unavailable) return fail({ kind: 'unavailable', diagnostic: 'holder source unavailable' })
      return succeed(
        after === null
          ? { items: references.slice(0, 1), next: 'opaque-next-page' }
          : { items: references.slice(1), next: null },
      )
    },
  }
  return {
    reader,
    key: loaded.key,
    references,
    interrupt: () => {
      unavailable = true
    },
  }
}

describe('residency reader shared contract', () => {
  const names = [
    'all pages preserve every holder tenant and first shape',
    'a page failure stays unavailable and cannot become an empty terminal page',
  ]
  for (const name of names)
    it(name, async () => {
      const cases = toolResidencyReaderConformance()
      expect(cases.map(test => test.name)).toEqual(names)
      expect(cases.map(test => test.clause)).toEqual(['G7', 'G7'])
      const scenario = cases.find(test => test.name === name)
      if (!scenario) throw new Error('missing reader case')
      await scenario.run(fixture())
    })

  it('does not impose a traversal order on the holder source', async () => {
    const source = fixture()
    source.reader = {
      referencing: async () => succeed({ items: [...source.references].reverse(), next: null }),
    }
    await toolResidencyReaderConformance()[0]?.run(source)
  })

  it('detects a reader that merges holders across tenants', async () => {
    const source = fixture()
    source.reader = {
      referencing: async () => succeed({ items: source.references.slice(0, 1), next: null }),
    }
    await expect(toolResidencyReaderConformance()[0]?.run(source)).rejects.toThrow(AssertionError)
  })

  it('detects a reader that turns an interrupted page into an empty page', async () => {
    const source = fixture()
    source.interrupt = () => {
      source.reader.referencing = async () => succeed({ items: [], next: null })
    }
    await expect(toolResidencyReaderConformance()[1]?.run(source)).rejects.toThrow(AssertionError)
  })
})

it('the public registry test boundary refuses missing, unminted and foreign tenants', () => {
  const source = memoryToolBindingRegistryFixture()
  const authority = {
    ...source.authority,
    layer: { kind: 'tenant' as const, tenant: source.access.tenant },
  }
  const registry = createMemoryToolBindingRegistry<string>([
    { authority, registrants: [source.access.tenant] },
  ])
  const input = { ...source.access, authority, loaded: source.loaded(authority, 'tenant-only') }
  expect(registry.register(input)).toHaveProperty('ok')
  expect(registry.snapshot({ ...source.access, tenant: otherTenant })).toEqual({ ok: [] })
  expect(registry.register({ ...input, tenant: otherTenant })).toEqual({
    failure: { kind: 'denied' },
  })
  const missing = { ...source.access }
  Reflect.deleteProperty(missing, 'tenant')
  expect(registry.snapshot(missing)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(
    registry.snapshot({ ...source.access, tenant: structuredClone(source.access.tenant) }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it.each(['shape', 'duplicate', 'cursor'] as const)(
  'detects reader corruption: %s',
  async breach => {
    const source = fixture()
    const first = source.references[0]
    if (!first) throw new Error('missing reference')
    source.reader.referencing = async () =>
      succeed({
        items:
          breach === 'duplicate'
            ? [...source.references, first]
            : source.references.map(item =>
                breach === 'shape' ? { ...item, shape: first.shape } : item,
              ),
        next: breach === 'cursor' ? 'same-cursor' : null,
      })
    const scenario = toolResidencyReaderConformance()[0]
    if (!scenario) throw new Error('missing reader case')
    await expect(scenario.run(source)).rejects.toThrow(AssertionError)
  },
)

// C7 (#675, D015) on the Tool side, per the ruling of
// https://github.com/nemori-ai/omne-harness-lite/issues/675#issuecomment-6480754440: Tool has no
// freeze entry; the freeze judgment is `planAdoption` over the facts of one holder, read for one
// tenant. Two tenants have a holder of the same name with different first shapes: judged on its
// own tenant's facts, one gets `freeze` and the other does not; a missing or unminted tenant is
// refused by the tenant-scoped read; facts taken under the wrong tenant would give another verdict.
describe('C7: same-name holders of two tenants are judged on their own tenant facts only', () => {
  const evidenceOf = (record: string): DurableEvidence => ({
    owner: 'conformance',
    record,
    revision: '1',
    digest: `sha256:${record}`,
  })
  const official = (revision: string): ToolAuthority => ({
    layer: { kind: 'official' as const satisfies SourceLayer['kind'] },
    asset: {
      name: 'read_file',
      adoption: {
        owner: 'conformance',
        name: 'read_file',
        revision,
        digest: `sha256:read_file-${revision}`,
      },
    },
    holding: evidenceOf(`holding-${revision}`),
    publication: evidenceOf(`holding-${revision}-publication`),
  })
  const keyOf = (authority: ToolAuthority): ToolBindingKey => ({
    layer: authority.layer,
    asset: authority.asset,
  })
  const HOLDER = 'same-name'

  /**
   * Two official contributions of `read_file`: v1 (first shape S1) was released; v2 (S2, another
   * parameter contract) is live and is the winner. The holder named `same-name` exists in tenant
   * A with first shape S1 and in tenant B with first shape S2; each one recorded the key it first
   * loaded.
   */
  function world() {
    const source = memoryToolBindingRegistryFixture()
    const tenantA = source.access.tenant
    const tenantB = otherTenant
    const v1 = official('1')
    const v2 = official('2')
    const registry = createMemoryToolBindingRegistry<string>([
      { authority: v1, registrants: null },
      { authority: v2, registrants: null },
    ])
    const loadedV1 = source.loaded(v1, 'digest-1')
    const shape1: ToolShape = loadedV1.shape
    const shape2: ToolShape = {
      ...shape1,
      kind: 'function',
      parameters: {
        kind: 'declared',
        schema: '{"properties":{"path":{"type":"string"}},"type":"object"}',
        vocabulary: { owner: 'conformance', name: 'vocabulary', digest: 'sha256:vocabulary-2' },
      },
    }
    expect(sameShape(shape1, shape2)).toBe(false)
    const first = registry.register({ ...source.access, authority: v1, loaded: loadedV1 })
    if ('failure' in first) throw new Error('v1 registration failed')
    const second = registry.register({
      ...source.access,
      authority: v2,
      loaded: { ...source.loaded(v2, 'digest-2'), shape: shape2 },
    })
    if ('failure' in second) throw new Error('v2 registration failed')
    expect(first.ok.release()).toEqual({ removed: true })
    const references: readonly ToolResidencyReference[] = [
      { holder: HOLDER, tenant: tenantA, shape: shape1 },
      { holder: HOLDER, tenant: tenantB, shape: shape2 },
    ]
    const reader: ToolResidencyReader = {
      referencing: async ({ after }) =>
        succeed(
          after === null
            ? { items: references.slice(0, 1), next: 'page-2' }
            : { items: references.slice(1), next: null },
        ),
    }
    // The recorded key of each holder derives from its adoption basis, kept per tenant (R4).
    const recordedKey = (tenant: TenantId): ToolBindingKey =>
      tenantEquals(tenant, tenantA) ? keyOf(v1) : keyOf(v2)
    const reload = { kind: 'missing' as const, evidence: evidenceOf('reload-missing') }
    return {
      registry,
      reader,
      key: keyOf(v1),
      tenantA,
      tenantB,
      recordedKey,
      reload,
      shape1,
      shape2,
    }
  }

  type World = ReturnType<typeof world>
  type Refusal = { kind: 'denied' } | { kind: 'unavailable'; diagnostic: string }

  /** The first shape of `holder` under `tenant`, read from the Reader; refused without a fact of that tenant. */
  async function firstShapeOf(
    w: World,
    tenant: TenantId,
    holder: string,
  ): Promise<{ ok: ToolShape } | { failure: Refusal }> {
    const matches: ToolShape[] = []
    let after: string | null = null
    do {
      const page = await w.reader.referencing({ scope: 'system', key: w.key, after })
      if ('failure' in page) return { failure: page.failure }
      for (const item of page.ok.items)
        if (item.holder === holder && tenantEquals(item.tenant, tenant)) matches.push(item.shape)
      after = page.ok.next
    } while (after !== null)
    const [shape] = matches
    return shape === undefined || matches.length !== 1
      ? { failure: { kind: 'denied' } }
      : { ok: shape }
  }

  /** The adoption-point facts of `holder` for `tenant`: Reader fact plus the registry read with that tenant's access. */
  async function factsFor(
    w: World,
    tenant: TenantId,
    holder = HOLDER,
  ): Promise<{ ok: AdoptionFacts } | { failure: Refusal }> {
    const snapshot = w.registry.snapshot({ principal: 'coordinator', tenant })
    if ('failure' in snapshot) return { failure: snapshot.failure }
    const shape = await firstShapeOf(w, tenant, holder)
    if ('failure' in shape) return shape
    const recorded = w.recordedKey(tenant)
    const live = snapshot.ok.filter(entry => entry.state === 'live')
    const winner = [...live].sort((l, r) => Number(r.ordinal) - Number(l.ordinal))[0] ?? null
    return {
      ok: {
        recorded: {
          key: recorded,
          shape: shape.ok,
          usable: live.some(entry => sameBindingKey(entry.key, recorded)),
        },
        sameShape: live
          .filter(entry => !sameBindingKey(entry.key, recorded) && sameShape(entry.shape, shape.ok))
          .map(entry => entry.key),
        winner: winner === null ? null : { key: winner.key, shape: winner.shape },
        reload: w.reload,
      },
    }
  }

  it('freezes the holder whose own tenant lost its first shape and advances the other', async () => {
    const w = world()
    const factsA = await factsFor(w, w.tenantA)
    const factsB = await factsFor(w, w.tenantB)
    if ('failure' in factsA || 'failure' in factsB) throw new Error('facts must be readable')
    expect(factsA.ok.recorded.shape).toEqual(w.shape1)
    expect(factsB.ok.recorded.shape).toEqual(w.shape2)
    const planA: AdoptionPlan = planAdoption(factsA.ok)
    const planB: AdoptionPlan = planAdoption(factsB.ok)
    expect(planA).toEqual({
      kind: 'freeze',
      verdict: { cause: 'tool-shape-lost', evidence: w.reload.evidence },
    })
    expect(planB).toEqual({ kind: 'advance', key: keyOf(official('2')) })
  })

  it('would judge differently from the facts of the other tenant: the verdict depends on own-tenant facts only', async () => {
    const w = world()
    const factsA = await factsFor(w, w.tenantA)
    const factsB = await factsFor(w, w.tenantB)
    if ('failure' in factsA || 'failure' in factsB) throw new Error('facts must be readable')
    // A judged on B's first shape would advance instead of freezing; B judged on A's first shape
    // would keep its recorded key instead of advancing: a holder-name lookup that ignored the
    // tenant would change both verdicts.
    const crossed = (own: AdoptionFacts, other: AdoptionFacts): AdoptionFacts => ({
      ...own,
      recorded: { ...own.recorded, shape: other.recorded.shape },
    })
    expect(planAdoption(factsA.ok).kind).toBe('freeze')
    expect(planAdoption(crossed(factsA.ok, factsB.ok)).kind).toBe('advance')
    expect(planAdoption(factsB.ok).kind).toBe('advance')
    expect(planAdoption(crossed(factsB.ok, factsA.ok)).kind).toBe('keep')
  })

  it('refuses the facts when the explicit tenant is missing, unminted or has no holder of that name', async () => {
    const w = world()
    expect(await factsFor(w, undefined as never)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await factsFor(w, structuredClone(w.tenantA))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    const stranger = testingTenant(
      `org_c0nf0rmance0${'3'.repeat(14)}`,
      `acc_c0nf0rmance0${'3'.repeat(14)}`,
    )
    expect(await factsFor(w, stranger)).toEqual({ failure: { kind: 'denied' } })
    expect(await factsFor(w, w.tenantA, 'another-holder')).toEqual({ failure: { kind: 'denied' } })
  })
})
