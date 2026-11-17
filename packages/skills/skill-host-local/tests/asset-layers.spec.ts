import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  type AssetEntry,
  type AssetLayer,
  type AssetLayerListing,
  type AssetLayerSource,
  type AssetListInvalid,
  type AssetListRequest,
  type CapabilityId,
  type Candidate,
  type JsonValue,
  type LayerInput,
} from '@omne-harness/assets'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { isPackageDigest, type PackageDigest } from '@omne-harness/skill-contract'
import { skillInputsFromAssets } from '@omne-harness/skill-host-local'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const reader = access<'reader'>('reader', tenant(organization.value, account.value))
const scope = 'tenant-scope'

function id(name: string): CapabilityId {
  const made = capabilityId('skill', name)
  if (!made.ok) throw new Error('invalid identity')
  return made.id
}
function digest(fill: string): PackageDigest {
  const text = `sha256:${fill.repeat(64)}`
  if (!isPackageDigest(text)) throw new Error(text)
  return text
}

const report = id('weekly-report')
const text = (value: string): JsonValue => ({ kind: 'string', value })
const published: JsonValue = {
  kind: 'object',
  entries: [
    { key: 'name', value: text('weekly-report') },
    { key: 'description', value: text('Writes the weekly report.') },
    { key: 'tools', value: { kind: 'array', items: [] } },
    {
      key: 'package',
      value: { kind: 'object', entries: [{ key: 'digest', value: text(digest('d')) }] },
    },
  ],
}
const notASkill: JsonValue = { kind: 'object', entries: [{ key: 'name', value: text('x') }] }

function candidate(flags: Partial<Omit<Candidate, 'asset' | 'version'>> = {}): Candidate {
  return {
    asset: 'tenant/weekly-report',
    version: digest('d'),
    disabled: flags.disabled ?? false,
    immutable: flags.immutable ?? false,
    replaceLocked: flags.replaceLocked ?? false,
  }
}

function entry(layer: AssetLayer, name: string): AssetEntry {
  return {
    capability: id(name),
    layer,
    asset: `${layer}/${name}`,
    version: digest('d'),
    selection: 'follow',
    enabled: true,
  }
}

function source(
  layer: AssetLayer,
  behaviour: {
    candidates?: LayerInput
    list?: (request: AssetListRequest) => AssetLayerListing | AssetListInvalid
  },
): AssetLayerSource & { requests: AssetListRequest[] } {
  const requests: AssetListRequest[] = []
  return {
    layer,
    requests,
    async list(request) {
      requests.push(request)
      if (behaviour.list === undefined) throw new Error('list was not expected')
      return behaviour.list(request)
    },
    async candidates() {
      if (behaviour.candidates === undefined) throw new Error('candidates was not expected')
      return behaviour.candidates
    },
  }
}

function paged(
  layer: AssetLayer,
  entries: readonly AssetEntry[],
  completeness: 'complete' | 'partial' = 'complete',
) {
  return source(layer, {
    list(request) {
      const start = request.after === null ? 0 : Number(request.after)
      const end = start + request.limit
      return {
        layer,
        state: 'read',
        page: {
          items: entries.slice(start, end),
          next: end < entries.length ? String(end) : null,
          completeness,
        },
      }
    },
  })
}

function inputs(
  sources: readonly AssetLayerSource[],
  body: (one: Candidate) => JsonValue | undefined = () => published,
) {
  const asked: Candidate[] = []
  const made = skillInputsFromAssets<'reader', typeof scope>({
    sources,
    async body(one) {
      asked.push(one)
      return body(one)
    },
  })
  return { ...made, asked }
}

describe('skillInputsFromAssets: layers, the layer answer by the candidate translation', () => {
  it('a read candidate whose body is a published Skill becomes a Skill candidate', async () => {
    const one = candidate()
    const made = inputs([
      source('tenant', { candidates: { layer: 'tenant', state: 'read', candidates: [one] } }),
    ])
    expect(await made.layers(reader, scope, report)).toEqual([
      {
        layer: 'tenant',
        state: 'read',
        candidates: [
          {
            ...one,
            locator: { kind: 'content-store', digest: digest('d') },
            digest: digest('d'),
            declared: {
              name: 'weekly-report',
              description: 'Writes the weekly report.',
              tools: [],
              settings: [],
            },
          },
        ],
      },
    ])
    expect(made.asked).toEqual([one])
  })

  it('carries disabled, immutable and replace-locked over to the Skill candidate', async () => {
    const one = candidate({ disabled: true, immutable: true, replaceLocked: true })
    const made = inputs([
      source('tenant', { candidates: { layer: 'tenant', state: 'read', candidates: [one] } }),
    ])
    expect(await made.layers(reader, scope, report)).toMatchObject([
      { state: 'read', candidates: [{ disabled: true, immutable: true, replaceLocked: true }] },
    ])
  })

  it('a layer that does not apply or cannot be read is carried as it is, in layer order', async () => {
    const made = inputs([
      source('tenant', { candidates: { layer: 'tenant', state: 'unavailable' } }),
      source('official', { candidates: { layer: 'official', state: 'not-applicable' } }),
      source('workspace', { candidates: { layer: 'workspace', state: 'read', candidates: [] } }),
    ])
    expect(await made.layers(reader, scope, report)).toEqual([
      { layer: 'official', state: 'not-applicable' },
      { layer: 'tenant', state: 'unavailable' },
      { layer: 'workspace', state: 'read', candidates: [] },
    ])
    expect(made.asked).toEqual([])
  })

  it('a candidate whose body cannot be read makes its layer unavailable', async () => {
    const made = inputs(
      [
        source('tenant', {
          candidates: { layer: 'tenant', state: 'read', candidates: [candidate()] },
        }),
      ],
      () => undefined,
    )
    expect(await made.layers(reader, scope, report)).toEqual([
      { layer: 'tenant', state: 'unavailable' },
    ])
  })

  it('a candidate whose body is not a published Skill makes its layer unavailable', async () => {
    const made = inputs(
      [
        source('tenant', {
          candidates: { layer: 'tenant', state: 'read', candidates: [candidate()] },
        }),
      ],
      () => notASkill,
    )
    expect(await made.layers(reader, scope, report)).toEqual([
      { layer: 'tenant', state: 'unavailable' },
    ])
  })
})

describe('skillInputsFromAssets: identities, the page answer by the page position', () => {
  it('pages the skill category to the end and names every identity once', async () => {
    const tenantNames = Array.from(
      { length: 150 },
      (_, index) => `skill-${String(index).padStart(3, '0')}`,
    )
    const tenantSource = paged(
      'tenant',
      tenantNames.map(name => entry('tenant', name)),
    )
    const officialSource = paged('official', [
      entry('official', 'skill-000'),
      entry('official', 'shared'),
    ])
    const answer = await inputs([tenantSource, officialSource]).identities(reader, scope)
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    expect(answer.ok).toEqual(['skill-000', 'shared', ...tenantNames.slice(1)].map(id))
    expect(officialSource.requests).toEqual([{ category: 'skill', after: null, limit: 100 }])
    expect(tenantSource.requests).toEqual([
      { category: 'skill', after: null, limit: 98 },
      { category: 'skill', after: '98', limit: 100 },
    ])
  })

  it('no Skills in any layer name no identities', async () => {
    const answer = await inputs([paged('tenant', [])]).identities(reader, scope)
    expect(answer).toEqual({ ok: [] })
  })

  it.each([
    ['cannot be read', { layer: 'tenant', state: 'unavailable' } as const],
    ['is invalid', { state: 'invalid' } as const],
  ])('a page that %s answers unknown', async (_what, listing) => {
    const answer = await inputs([source('tenant', { list: () => listing })]).identities(
      reader,
      scope,
    )
    expect(answer).toEqual({ failure: 'unknown' })
  })

  it('a partial page answers unknown, not half a list', async () => {
    const answer = await inputs([paged('tenant', [entry('tenant', 'one')], 'partial')]).identities(
      reader,
      scope,
    )
    expect(answer).toEqual({ failure: 'unknown' })
  })

  it('a later page that cannot be read answers unknown after a good first page', async () => {
    const entries = Array.from({ length: 101 }, (_, index) => entry('tenant', `skill-${index}`))
    const flaky = source('tenant', {
      list: request =>
        request.after === null
          ? {
              layer: 'tenant',
              state: 'read',
              page: { items: entries.slice(0, 100), next: '100', completeness: 'complete' },
            }
          : { layer: 'tenant', state: 'unavailable' },
    })
    expect(await inputs([flaky]).identities(reader, scope)).toEqual({ failure: 'unknown' })
  })
})
