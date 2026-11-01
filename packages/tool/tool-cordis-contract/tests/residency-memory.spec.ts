// The holder-reference reader double (RD-TOOLHEAD) and the resident-key round-trip suite
// (XC-RESKEY). The double must pass the shared reader suite over several pages, must never turn a
// failure into an empty page, and must read an outer Session-shaped source through the same
// encoding and projection as the real bridge.
import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { residentToolFacts, type ResidentReferencesPage } from '@omne-harness/tool-contract'
import type { ToolBindingKey, ToolShape } from '@omne-harness/tool-contract/provider'
import { testingTenant, testingWorkspace } from '@omne-harness/tool-contract/testing'
import {
  createMemoryToolResidencyReader,
  residentKeyRoundTripConformance,
  toolResidencyReaderConformance,
  type ResidentKeyRoundTripFixture,
  type ResidentReferencesRead,
} from '@omne-harness/tool-cordis-contract/testing'

const tenantA = () =>
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
const tenantB = () =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')

const key = (name: string): ToolBindingKey => ({
  layer: { kind: 'official' },
  asset: { name, adoption: { owner: 'acme', name, revision: '1', digest: `sha256:${name}` } },
})
const shape = (name: string): ToolShape => ({
  name,
  kind: 'function',
  parameters: { kind: 'executor-owned' },
})

function builtInFixture() {
  const double = createMemoryToolResidencyReader({ pageSize: 2 })
  const at = key('read_file')
  // Three holders, so the reads span two pages; the same session text in two tenants.
  const holders = [
    { tenant: tenantA(), session: 'session-1', shape: shape('read_file') },
    { tenant: tenantB(), session: 'session-1', shape: shape('read_file') },
    { tenant: tenantA(), session: 'session-2', shape: shape('read_file') },
  ]
  double.set(at, holders)
  return {
    double,
    fixture: {
      reader: double.reader,
      key: at,
      references: holders.map(({ tenant, session, shape }) => ({ holder: session, tenant, shape })),
      interrupt: () => double.interrupt(),
    },
  }
}

describe('createMemoryToolResidencyReader with the built-in source', () => {
  for (const scenario of toolResidencyReaderConformance())
    it(`passes the reader suite: ${scenario.name}`, async () => {
      await scenario.run(builtInFixture().fixture)
    })

  it('answers unavailable for a cursor of another key and for a forged cursor', async () => {
    const { double, fixture } = builtInFixture()
    double.set(key('other'), [{ tenant: tenantA(), session: 's', shape: shape('other') }])
    const first = await fixture.reader.referencing({
      scope: 'system',
      key: fixture.key,
      after: null,
    })
    if ('failure' in first || first.ok.next === null) throw new Error('expected a next page')
    const foreign = await fixture.reader.referencing({
      scope: 'system',
      key: key('other'),
      after: first.ok.next,
    })
    expect(foreign).toEqual({ failure: { kind: 'unavailable', diagnostic: 'source: cursor' } })
    const forged = await fixture.reader.referencing({
      scope: 'system',
      key: fixture.key,
      after: 'cursor-999',
    })
    expect('failure' in forged).toBe(true)
  })

  it('reads an unknown key as one empty last page, and an unencodable key as unavailable', async () => {
    const double = createMemoryToolResidencyReader()
    expect(
      await double.reader.referencing({ scope: 'system', key: key('none'), after: null }),
    ).toEqual({
      ok: { items: [], next: null },
    })
    const copied: ToolBindingKey = {
      ...key('ws'),
      layer: {
        kind: 'workspace',
        workspace: structuredClone(testingWorkspace('wsp_c0nf0rmance000000000000000')),
      },
    }
    const page = await double.reader.referencing({ scope: 'system', key: copied, after: null })
    expect(page).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'key: layer.workspace identity' },
    })
  })

  it('stays unavailable after interrupt until restore', async () => {
    const { double, fixture } = builtInFixture()
    double.interrupt('holder source down')
    expect(
      await fixture.reader.referencing({ scope: 'system', key: fixture.key, after: null }),
    ).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'holder source down' },
    })
    double.restore()
    const page = await fixture.reader.referencing({
      scope: 'system',
      key: fixture.key,
      after: null,
    })
    expect('ok' in page).toBe(true)
  })

  it('refuses an illegal page size and a set of an unstorable shape', () => {
    expect(() => createMemoryToolResidencyReader({ pageSize: 0 })).toThrow(RangeError)
    expect(() => createMemoryToolResidencyReader({ pageSize: 1.5 })).toThrow(RangeError)
    const double = createMemoryToolResidencyReader()
    expect(() =>
      double.set(key('bad'), [
        { tenant: tenantA(), session: 's', shape: { ...shape('bad'), name: '' } },
      ]),
    ).toThrow(TypeError)
  })

  it('declares durability none', () => {
    expect(createMemoryToolResidencyReader().durability).toBe('none')
  })
})

/** A Session-shaped source: it stores records by key text and pages them with `limit`. */
function sessionLike() {
  const records = new Map<string, ResidentReferencesPage['sessions'][number][]>()
  let failure: string | null = null
  const read: ResidentReferencesRead = async ({ key: text, after, limit }) => {
    if (failure !== null) return fail({ kind: failure })
    const all = records.get(text) ?? []
    const offset = after === null ? 0 : Number(after)
    const next = offset + limit < all.length ? String(offset + limit) : null
    return succeed({ sessions: all.slice(offset, offset + limit), next })
  }
  return {
    read,
    records,
    fail: (kind: string) => {
      failure = kind
    },
    add(text: string, record: ResidentReferencesPage['sessions'][number]) {
      records.set(text, [...(records.get(text) ?? []), record])
    },
  }
}

describe('createMemoryToolResidencyReader with an outer source', () => {
  it('answers unavailable when one record has a bad shape, not a page without it', async () => {
    const source = sessionLike()
    const facts = residentToolFacts(key('read_file'), shape('read_file'))
    if ('failure' in facts) throw new Error('facts')
    source.add(facts.ok.key, {
      tenant: tenantA(),
      session: 's1',
      capability: 'read_file',
      shape: facts.ok.shape,
    })
    source.add(facts.ok.key, {
      tenant: tenantB(),
      session: 's2',
      capability: 'read_file',
      shape: { kind: 'string', value: 'not a shape' },
    })
    const double = createMemoryToolResidencyReader({ source: source.read, pageSize: 10 })
    expect(
      await double.reader.referencing({ scope: 'system', key: key('read_file'), after: null }),
    ).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'shape: sessions[1].shape type' },
    })
  })

  it('answers unavailable on any failure of the source', async () => {
    const source = sessionLike()
    source.fail('invalid')
    const double = createMemoryToolResidencyReader({ source: source.read })
    expect(
      await double.reader.referencing({ scope: 'system', key: key('x'), after: null }),
    ).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'source: invalid' },
    })
    const throwing = createMemoryToolResidencyReader({
      source: () => Promise.reject(new Error('boom')),
    })
    const page = await throwing.reader.referencing({ scope: 'system', key: key('x'), after: null })
    expect('failure' in page && page.failure.kind).toBe('unavailable')
  })

  it('passes the page size to the source as limit and refuses set', async () => {
    const limits: number[] = []
    const double = createMemoryToolResidencyReader({
      pageSize: 7,
      source: async ({ limit }) => {
        limits.push(limit)
        return succeed({ sessions: [], next: null })
      },
    })
    await double.reader.referencing({ scope: 'system', key: key('x'), after: null })
    expect(limits).toEqual([7])
    expect(() => double.set(key('x'), [])).toThrow()
  })
})

/** The round-trip composition before the real bridge: write path through residentToolFacts. */
function roundTripFixture(): ResidentKeyRoundTripFixture {
  const source = sessionLike()
  let sessions = 0
  const record = (
    tenant: TenantId,
    text: string,
    capability: string,
    stored: ResidentReferencesPage['sessions'][number]['shape'],
  ) => {
    sessions += 1
    source.add(text, { tenant, session: `session-${sessions}`, capability, shape: stored })
  }
  return {
    reader: createMemoryToolResidencyReader({ source: source.read }).reader,
    async write({ tenant, key: at, shape: first }) {
      const facts = residentToolFacts(at, first)
      if ('failure' in facts) throw new Error(`write: ${facts.failure.field}`)
      record(tenant, facts.ok.key, facts.ok.capability, facts.ok.shape)
    },
    async writeRaw({ tenant, key: at, shape: raw }) {
      const facts = residentToolFacts(at, shape(at.asset.name))
      if ('failure' in facts) throw new Error(`writeRaw: ${facts.failure.field}`)
      record(tenant, facts.ok.key, facts.ok.capability, raw)
    },
  }
}

describe('residentKeyRoundTripConformance', () => {
  for (const scenario of residentKeyRoundTripConformance())
    it(`passes on the composition with the reader double: ${scenario.name}`, async () => {
      await scenario.run(roundTripFixture())
    })

  it('also passes on the built-in source of the double, written through set', async () => {
    const double = createMemoryToolResidencyReader()
    const written = new Map<
      string,
      { key: ToolBindingKey; holders: { tenant: TenantId; session: string; shape: ToolShape }[] }
    >()
    const fixture: ResidentKeyRoundTripFixture = {
      reader: double.reader,
      async write({ tenant, key: at, shape: first }) {
        const id = JSON.stringify(at.asset.adoption) + at.layer.kind
        const entry = written.get(id) ?? { key: at, holders: [] }
        entry.holders.push({ tenant, session: `s${entry.holders.length}`, shape: first })
        written.set(id, entry)
        double.set(at, entry.holders)
      },
    }
    for (const scenario of residentKeyRoundTripConformance()) {
      if (scenario.name.startsWith('a stored shape')) continue
      await scenario.run(fixture)
    }
  })
})
