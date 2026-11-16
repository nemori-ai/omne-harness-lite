import { describe, expect, it } from 'vitest'
import { capabilityId, type CapabilityId, type JsonValue } from '@omne-harness/assets'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  isPackageDigest,
  isSkillName,
  type PackageDigest,
  type SkillName,
  type SourceLayer,
} from '@omne-harness/skill-contract'
import {
  createSkillDecisions,
  publishedCandidate,
  type Eligibility,
  type SkillCandidate,
  type SkillLayerInput,
} from '@omne-harness/skill-host-local'

type Scope = 'tenant-scope'
const scope: Scope = 'tenant-scope'
const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const reader = access<'reader'>('reader', tenant(organization.value, account.value))

function id(name: string): CapabilityId {
  const made = capabilityId('skill', name)
  if (!made.ok) throw new Error('invalid identity')
  return made.id
}
function skillName(text: string): SkillName {
  if (!isSkillName(text)) throw new Error(text)
  return text
}
function digest(fill: string): PackageDigest {
  const text = `sha256:${fill.repeat(64)}`
  if (!isPackageDigest(text)) throw new Error(text)
  return text
}

const report = id('weekly-report')

function candidate(
  asset: string,
  flags: Partial<Pick<SkillCandidate, 'disabled' | 'immutable' | 'replaceLocked'>> = {},
  fill = 'a',
): SkillCandidate {
  return {
    asset,
    version: `${asset}-v1`,
    disabled: flags.disabled ?? false,
    immutable: flags.immutable ?? false,
    replaceLocked: flags.replaceLocked ?? false,
    locator: { kind: 'content-store', digest: digest(fill) },
    digest: digest(fill),
    declared: {
      name: skillName('weekly-report'),
      description: `From ${asset}.`,
      tools: [],
      settings: [],
    },
  }
}

const read = (layer: SourceLayer, ...candidates: SkillCandidate[]): SkillLayerInput => ({
  layer,
  state: 'read',
  candidates,
})

function decisions(
  layers: readonly SkillLayerInput[] | (() => Promise<readonly SkillLayerInput[]>),
  eligible: (candidate: SkillCandidate) => Eligibility = () => 'yes',
) {
  return createSkillDecisions<'reader', Scope>({
    layers: typeof layers === 'function' ? layers : async () => layers,
    eligible: async (_access, _scope, one) => eligible(one),
    identities: async () => ({ ok: [report] }),
    readable: async () => ({ kind: 'granted' }),
  })
}

describe('the translation of the evaluation', () => {
  it('winner 翻成 adopted', async () => {
    const official = candidate('official/weekly-report', {}, 'b')
    const mine = candidate('tenant/weekly-report')
    const { resolution } = decisions([read('official', official), read('tenant', mine)])
    expect(await resolution.resolve(reader, scope, report)).toEqual({
      kind: 'adopted',
      ref: {
        capability: report,
        layer: 'tenant',
        assetVersion: 'tenant/weekly-report-v1',
        locator: { kind: 'content-store', digest: mine.digest, ref: 'tenant/weekly-report' },
        digest: mine.digest,
      },
      declared: mine.declared,
    })
  })

  it('none 而且出局者里有 disabled、主体又有资格知道它：翻成 known-unavailable', async () => {
    const off = candidate('tenant/weekly-report', { disabled: true })
    const { resolution } = decisions([read('tenant', off)])
    expect(await resolution.resolve(reader, scope, report)).toEqual({
      kind: 'known-unavailable',
      capability: report,
      reason: 'This Skill is disabled.',
      name: 'weekly-report',
      description: 'From tenant/weekly-report.',
    })
  })

  it.each([
    ['no candidate', [read('official'), read('tenant')], () => 'yes' as const],
    [
      'a disabled candidate that the principal may not know',
      [read('tenant', candidate('tenant/weekly-report', { disabled: true }))],
      () => 'no' as const,
    ],
    [
      'only candidates without eligibility',
      [read('tenant', candidate('tenant/weekly-report'))],
      () => 'no' as const,
    ],
  ])('none 的其余情形翻成 none: %s', async (_case, layers, eligible) => {
    const { resolution } = decisions(layers, eligible)
    expect(await resolution.resolve(reader, scope, report)).toEqual({ kind: 'none' })
  })

  it.each([
    [
      'a layer that cannot be read',
      [{ layer: 'organization', state: 'unavailable' } as const, read('tenant', candidate('t'))],
      () => 'yes' as const,
    ],
    ['an eligibility that is unknown', [read('tenant', candidate('t'))], () => 'unknown' as const],
  ])('unavailable 翻成 unknown: %s', async (_case, layers, eligible) => {
    const { resolution } = decisions(layers, eligible)
    expect(await resolution.resolve(reader, scope, report)).toEqual({ kind: 'unknown' })
    expect(await resolution.adopted(reader, scope)).toEqual({ failure: 'unknown' })
  })

  it('候选的来源读不到时答 unknown，不当成没有', async () => {
    const { resolution } = decisions(async () => {
      throw new Error('the holdings cannot be read')
    })
    expect(await resolution.resolve(reader, scope, report)).toEqual({ kind: 'unknown' })
    expect(await resolution.adopted(reader, scope)).toEqual({ failure: 'unknown' })
  })

  it('an immutable official candidate keeps the tenant one out', async () => {
    const official = candidate('official/weekly-report', { immutable: true }, 'b')
    const { resolution } = decisions([read('official', official), read('tenant', candidate('t'))])
    expect(await resolution.resolve(reader, scope, report)).toMatchObject({
      kind: 'adopted',
      ref: { layer: 'official', locator: official.locator },
    })
  })
})

describe('the basis and the lawful set', () => {
  it('takes a basis of the winner and refuses one of another version', async () => {
    const mine = candidate('tenant/weekly-report')
    const { resolution } = decisions([read('tenant', mine)])
    const basis = {
      capability: report,
      layer: 'tenant' as const,
      assetVersion: mine.version as never,
      digest: digest('c'),
    }
    expect(await resolution.resolve(reader, scope, report, { basis })).toMatchObject({
      kind: 'adopted',
      ref: { layer: 'tenant', digest: digest('c') },
    })
    expect(
      await resolution.resolve(reader, scope, report, {
        basis: { ...basis, assetVersion: 'older' as never },
      }),
    ).toEqual({ kind: 'basis-not-lawful' })
  })

  it('lists the adopted identities and the stand-ins, and leaves out none', async () => {
    const mine = candidate('tenant/weekly-report')
    const { resolution } = decisions([read('tenant', mine)])
    expect(await resolution.adopted(reader, scope)).toMatchObject({
      ok: [{ kind: 'adopted', ref: { capability: report } }],
    })
    const empty = decisions([read('tenant')])
    expect(await empty.resolution.adopted(reader, scope)).toEqual({ ok: [] })
  })

  it('passes the read check on, and a throw answers unknown', async () => {
    const granted = decisions([])
    expect(await granted.readCheck.check(reader, scope, report)).toEqual({ kind: 'granted' })
    const broken = createSkillDecisions<'reader', Scope>({
      layers: async () => [],
      eligible: async () => 'yes',
      identities: async () => ({ ok: [] }),
      readable: async () => {
        throw new Error('no answer')
      },
    })
    expect(await broken.readCheck.check(reader, scope, report)).toEqual({ kind: 'unknown' })
  })
})

describe('publishedCandidate', () => {
  const text = (value: string): JsonValue => ({ kind: 'string', value })
  const body: JsonValue = {
    kind: 'object',
    entries: [
      { key: 'name', value: text('weekly-report') },
      { key: 'description', value: text('Writes the weekly report.') },
      {
        key: 'tools',
        value: {
          kind: 'array',
          items: [
            {
              kind: 'object',
              entries: [
                { key: 'category', value: text('tool') },
                { key: 'name', value: text('Shell') },
              ],
            },
          ],
        },
      },
      {
        key: 'package',
        value: { kind: 'object', entries: [{ key: 'digest', value: text(digest('d')) }] },
      },
      { key: 'manifest', value: { kind: 'object', entries: [] } },
    ],
  }

  it('reads the declared projection and the content-store locator from a version body', () => {
    expect(
      publishedCandidate({
        asset: 'tenant/weekly-report',
        version: digest('d'),
        body,
        disabled: false,
      }),
    ).toEqual({
      asset: 'tenant/weekly-report',
      version: digest('d'),
      disabled: false,
      immutable: false,
      replaceLocked: false,
      locator: { kind: 'content-store', digest: digest('d') },
      digest: digest('d'),
      declared: {
        name: 'weekly-report',
        description: 'Writes the weekly report.',
        tools: [{ category: 'tool', name: 'Shell' }],
        settings: [],
      },
    })
  })

  it('gives nothing for a body that names no package', () => {
    const plain: JsonValue = {
      kind: 'object',
      entries: [
        { key: 'name', value: text('weekly-report') },
        { key: 'tools', value: { kind: 'array', items: [] } },
      ],
    }
    expect(
      publishedCandidate({ asset: 'a', version: 'v', body: plain, disabled: false }),
    ).toBeUndefined()
  })
})

describe('publishedCandidate: bodies of another shape', () => {
  const text = (value: string): JsonValue => ({ kind: 'string', value })
  const tool = (category: string, name: string): JsonValue => ({
    kind: 'object',
    entries: [
      { key: 'category', value: text(category) },
      { key: 'name', value: text(name) },
    ],
  })
  const setting = (name: string, category: string): JsonValue => ({
    kind: 'object',
    entries: [
      { key: 'name', value: text(name) },
      { key: 'category', value: text(category) },
    ],
  })
  const fields: Record<string, JsonValue> = {
    name: text('weekly-report'),
    description: text('Writes the weekly report.'),
    tools: { kind: 'array', items: [tool('tool', 'Shell')] },
    package: { kind: 'object', entries: [{ key: 'digest', value: text(digest('d')) }] },
  }
  function bodyWith(changes: Record<string, JsonValue | undefined>): JsonValue {
    const merged = { ...fields, ...changes }
    return {
      kind: 'object',
      entries: Object.entries(merged).flatMap(([key, value]) =>
        value === undefined ? [] : [{ key, value }],
      ),
    }
  }
  const candidateOf = (body: JsonValue) =>
    publishedCandidate({
      asset: 'tenant/weekly-report',
      version: digest('d'),
      body,
      disabled: false,
    })

  it('takes the body of a published Skill, and one without a description', () => {
    expect(candidateOf(bodyWith({}))).toMatchObject({
      declared: { name: 'weekly-report', description: 'Writes the weekly report.' },
    })
    expect(candidateOf(bodyWith({ description: undefined }))?.declared).toEqual({
      name: 'weekly-report',
      tools: [{ category: 'tool', name: 'Shell' }],
      settings: [],
    })
  })

  it('takes the settings of a published Skill, a preference and a binding', () => {
    const settings: JsonValue = {
      kind: 'array',
      items: [setting('tone', 'preference'), setting('calendar', 'binding')],
    }
    expect(candidateOf(bodyWith({ settings }))?.declared.settings).toEqual([
      { name: 'tone', category: 'preference' },
      { name: 'calendar', category: 'binding' },
    ])
  })

  it.each([
    ['no name', { name: undefined }],
    ['a name that is no Skill name', { name: text('Weekly Report') }],
    ['a name that is no text', { name: { kind: 'number', lexeme: '1' } as JsonValue }],
    ['tools that are no list', { tools: text('Shell') }],
    ['no tools', { tools: undefined }],
    [
      'a tool with an empty category',
      { tools: { kind: 'array', items: [tool('', 'Shell')] } as JsonValue },
    ],
    ['a tool that is no object', { tools: { kind: 'array', items: [text('Shell')] } as JsonValue }],
    ['an empty description', { description: text('') }],
    ['settings that are no list', { settings: text('tone') }],
    [
      'a setting of a category that is neither a preference nor a binding',
      { settings: { kind: 'array', items: [setting('owner', 'governance')] } as JsonValue },
    ],
    [
      'a setting without a name',
      { settings: { kind: 'array', items: [setting('', 'preference')] } as JsonValue },
    ],
    ['no package', { package: undefined }],
    [
      'a package digest of another form',
      {
        package: {
          kind: 'object',
          entries: [{ key: 'digest', value: text('sha1:00') }],
        } as JsonValue,
      },
    ],
  ])('gives nothing for a body with %s', (_case, changes) => {
    expect(candidateOf(bodyWith(changes))).toBeUndefined()
  })
})

describe('the translation: the branches of the winner and of no winner', () => {
  it('a disabled candidate whose eligibility is unknown makes the answer unknown', async () => {
    const off = candidate('tenant/weekly-report', { disabled: true })
    const { resolution } = decisions([read('tenant', off)], () => 'unknown')
    expect(await resolution.resolve(reader, scope, report)).toEqual({ kind: 'unknown' })
  })

  it('takes a basis without an asset version on the winner layer, and refuses another layer', async () => {
    const mine = candidate('tenant/weekly-report')
    const { resolution } = decisions([read('tenant', mine)])
    const basis = { capability: report, layer: 'tenant' as const, digest: digest('c') }
    expect(await resolution.resolve(reader, scope, report, { basis })).toMatchObject({
      kind: 'adopted',
      ref: { layer: 'tenant', digest: digest('c') },
    })
    expect(
      await resolution.resolve(reader, scope, report, {
        basis: { ...basis, layer: 'official' as const },
      }),
    ).toEqual({ kind: 'basis-not-lawful' })
  })

  it('a directory candidate without a digest and with a version that is no asset version', async () => {
    const official: SkillCandidate = {
      asset: 'official/weekly-report',
      version: 'v\u0007',
      disabled: false,
      immutable: false,
      replaceLocked: false,
      locator: { kind: 'directory', root: '/skills/weekly-report' },
      declared: { name: skillName('weekly-report'), tools: [], settings: [] },
    }
    const { resolution } = decisions([read('official', official)])
    expect(await resolution.resolve(reader, scope, report)).toEqual({
      kind: 'adopted',
      ref: {
        capability: report,
        layer: 'official',
        locator: { kind: 'directory', root: '/skills/weekly-report' },
      },
      declared: official.declared,
    })
  })
})
