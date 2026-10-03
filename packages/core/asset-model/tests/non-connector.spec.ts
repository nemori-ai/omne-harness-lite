import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  attributeDeclarationsOf,
  BodyProviderUnavailableError,
  createAssetModelJudge,
  parseWorkspaceManifestText,
  referencesOf,
  type NonConnectorBodyContracts,
  type SchemaDefName,
} from '../src/index.ts'
import { bindBodyContracts, isObject } from '../src/judge.ts'
import fixtures from './examples.json' with { type: 'json' }
import { bodies } from './ports.ts'

/** Five W2 protocol doubles; the real five-provider chain belongs to W6. */
const five: NonConnectorBodyContracts = {
  tool: bodies.tool,
  loop_extension: bodies.loop_extension,
  skill: bodies.skill,
  mcp: bodies.mcp,
  slash_command: bodies.slash_command,
}
const judge = createAssetModelJudge(five)
const connector = { category: 'connector', body: {} } as const
const version = { number: 1, content: connector, publishedAt: '2026-09-01T00:00:00Z' }
const record = {
  id: 'a',
  capability: { category: 'connector', name: 'inbound' },
  origin: 'official',
  versions: [],
}
function fixture(id: string): unknown {
  const row = fixtures.find(candidate => candidate.id === id)
  if (row === undefined) throw new Error('missing normative fixture')
  return row.value
}

describe('accepted five-port provider scope', () => {
  it('captures exactly five ports without fabricating Connector behavior', () => {
    const captured = bindBodyContracts(five)
    expect(Object.keys(captured)).toEqual([
      'tool',
      'loop_extension',
      'skill',
      'mcp',
      'slash_command',
    ])
    expect(Object.hasOwn(captured, 'connector')).toBe(false)
    expect(Object.isFrozen(captured)).toBe(true)
    for (const category of ['tool', 'loop_extension', 'skill', 'mcp', 'slash_command'] as const) {
      expect(Object.isFrozen(captured[category])).toBe(true)
      expect(Object.isFrozen(captured[category].schema)).toBe(true)
      expect(captured[category].schema).not.toBe(five[category].schema)
      expect(captured[category].judge).toBe(five[category].judge)
    }
  })
  it('registers the supplied Connector resource only once for full six', () => {
    const complete = createAssetModelJudge(bodies)
    expect(complete.validate('AssetContent', connector)).toEqual({ valid: true })
    expect(complete.judgeAssetValue('AssetContent', connector)).toEqual({ ok: true })
    expect(attributeDeclarationsOf(connector, complete)).toEqual({ underivable: 'connector' })
    expect(referencesOf(connector, bodies)).toEqual({ references: [] })
    expect(Object.hasOwn(bindBodyContracts(bodies), 'connector')).toBe(true)
  })
  it('ships the exact frozen Connector resource and retains the original root resource', () => {
    for (const [topic, packaged] of [
      ['connector', '../schema/resources/connector.schema.json'],
      ['asset-model', '../schema/asset-model.schema.json'],
    ] as const) {
      const frozen = readFileSync(
        new URL(
          `../../../../.meta_harness/design/spec/data/${topic}/v${topic === 'asset-model' ? 3 : 2}/${topic}.schema.json`,
          import.meta.url,
        ),
      )
      const copy = readFileSync(new URL(packaged, import.meta.url))
      expect(copy.equals(frozen)).toBe(true)
      const expected =
        topic === 'connector'
          ? 'd02af56071f37786229142a73e93194529b7e3dad3b5a70c1a69e0fe44196d5d'
          : 'f674f438dfee8fc1d6ad6106113fe72699232092c84699e5b216ca2792137131'
      expect(createHash('sha256').update(copy).digest('hex')).toBe(expected)
    }
  })
  it.each(['5.row3.AssetContent', '5.row4.AssetContent', '5.row5.AssetContent'])(
    'retains original Connector shape semantics from normative %s',
    id => {
      const row = fixtures.find(candidate => candidate.id === id)
      if (row === undefined) throw new Error('missing normative Connector fixture')
      const before = writeJsonLossless(row.value)
      expect(judge.validate('AssetContent', row.value)).toEqual({ valid: row.schema })
      expect(() => judge.judgeAssetValue('AssetContent', row.value)).toThrow(
        BodyProviderUnavailableError,
      )
      expect(writeJsonLossless(row.value)).toBe(before)
    },
  )
  it.each(['tool', 'loop_extension', 'skill', 'mcp', 'slash_command'] as const)(
    'rejects missing non-Connector %s before compiling',
    category => {
      const missing = Object.fromEntries(Object.entries(five).filter(([key]) => key !== category))
      expect(() => Reflect.apply(createAssetModelJudge, undefined, [missing])).toThrow(TypeError)
      expect(() =>
        Reflect.apply(attributeDeclarationsOf, undefined, [
          connector,
          Reflect.apply(createAssetModelJudge, undefined, [missing]),
        ]),
      ).toThrow(TypeError)
      expect(() => Reflect.apply(referencesOf, undefined, [connector, missing])).toThrow(TypeError)
    },
  )
  it.each(['tool', 'loop_extension', 'skill', 'mcp', 'slash_command', 'connector'] as const)(
    'rejects a wrongly discriminated %s port',
    category => {
      const wrong = { ...bodies, [category]: { ...bodies[category], category: 'plugin' } }
      expect(() => Reflect.apply(createAssetModelJudge, undefined, [wrong])).toThrow(TypeError)
    },
  )
  it('rejects own undefined and inherited Connector ports rather than interpreting them as five', () => {
    expect(() =>
      Reflect.apply(createAssetModelJudge, undefined, [{ ...five, connector: undefined }]),
    ).toThrow(TypeError)
    const inherited = Object.assign(Object.create({ connector: bodies.connector }), five)
    expect(() => Reflect.apply(createAssetModelJudge, undefined, [inherited])).toThrow(TypeError)
  })
  it.each([
    '5.row1.AssetContent',
    '5.row2.AssetContent',
    '5.row6.AssetContent',
    '5.row7.AssetContent',
    '5.row9.AssetContent',
    '5.row10.AssetContent',
    '5.row11.AssetContent',
    '5.row12.AssetContent',
    '5.row13.AssetContent',
  ])('retains the other five categories frozen rejection and shape boundary: %s', id => {
    const row = fixtures.find(candidate => candidate.id === id)
    if (row === undefined) throw new Error('missing normative non-Connector fixture')
    expect(judge.validate('AssetContent', row.value)).toEqual({ valid: row.schema })
    expect(judge.judgeAssetValue('AssetContent', row.value)).toEqual(
      row.rejection === null ? { ok: true } : { rejected: row.rejection },
    )
  })
  it.each([
    [undefined, undefined],
    [{ kind: 'not_fetched' }, 'not_fetched'],
    [{ kind: 'fetched', tools: [] }, 'fetched'],
    [{ kind: 'fetched', tools: [{ name: 'lookup' }] }, 'fetched'],
  ] as const)(
    'preserves the four MCP knowledge paths through five-port binding: %j',
    (snapshot, marker) => {
      const result = attributeDeclarationsOf({ category: 'mcp', body: {} }, judge, snapshot)
      expect(Object.hasOwn(result, 'actionSnapshotKind')).toBe(true)
      expect(result.actionSnapshotKind).toBe(marker)
      expect(result.declarations.map(item => item.item)).toEqual(['disabled', 'usableBy'])
    },
  )
})

describe('availability is an explicit body-rule request', () => {
  const paths: readonly (readonly [SchemaDefName, unknown])[] = [
    ['AssetContent', connector],
    ['AssetVersion', version],
    ['AssetDefinition', { ...record, draft: connector }],
    ['AssetDefinition', { ...record, versions: [version] }],
  ]
  it.each(paths)('throws outside the provider scope at contract-owned %s', (definition, value) => {
    expect(judge.validate(definition, value)).toEqual({ valid: true })
    expect(() => judge.judgeAssetValue(definition, value)).toThrow(BodyProviderUnavailableError)
  })
  it('throws for declaration and reference requests without inventing business results', () => {
    for (const invoke of [
      () => attributeDeclarationsOf(connector, judge),
      () => referencesOf(connector, five),
      () => judge.judgeAssetValue('AssetContent', connector),
    ]) {
      try {
        invoke()
        throw new Error('missing provider request unexpectedly returned')
      } catch (error) {
        expect(error).toBeInstanceOf(BodyProviderUnavailableError)
        if (!(error instanceof BodyProviderUnavailableError)) throw error
        expect(error.name).toBe('BodyProviderUnavailableError')
        expect(error.category).toBe('connector')
        expect(Object.hasOwn(error, 'rejected')).toBe(false)
        expect(Object.hasOwn(error, 'underivable')).toBe(false)
      }
    }
  })
  it('preserves malformed when no body value exists to request a body rule', () => {
    expect(judge.judgeAssetValue('AssetContent', { category: 'connector' })).toEqual({
      rejected: 'malformed',
    })
  })
  it('reports an explicit fixed Connector definition dependency without guessing from the item', () => {
    const assignment = {
      item: 'target',
      value: { kind: 'other' },
      immutable: false,
      since: '2026-09-01T00:00:00Z',
    }
    const context = {
      declarations: [
        {
          item: 'target',
          kind: 'setting',
          category: 'placement_identity',
          domain: {
            kind: 'open',
            schema: {
              $ref: `${isObject(bodies.connector.schema) ? bodies.connector.schema.$id : ''}#/$defs/DeliveryTarget`,
            },
          },
        },
      ],
    } as const
    expect(judge.judgeAssetValue('AttributeAssignment', assignment)).toEqual({ ok: true })
    expect(() => judge.judgeAssetValue('AttributeAssignment', assignment, context)).toThrow(
      BodyProviderUnavailableError,
    )
  })
  it('retains Connector capability, holding, empty record and plugin references', () => {
    const capability = { category: 'connector', name: 'inbound' } as const
    expect(judge.judgeAssetValue('CapabilityId', capability)).toEqual({ ok: true })
    expect(judge.judgeAssetValue('AssetDefinition', record)).toEqual({ rejected: 'malformed' })
    const holding = {
      holder: { layer: 'factory' },
      capability,
      asset: 'a',
      basis: { kind: 'official' },
      versionSelection: { kind: 'current' },
      immutable: false,
      assignments: [],
      since: '2026-09-01T00:00:00Z',
    }
    expect(judge.judgeAssetValue('AssetHolding', holding)).toEqual({ ok: true })
    const plugin = { category: 'plugin', members: [capability] } as const
    expect(judge.judgeAssetValue('AssetContent', plugin)).toEqual({ ok: true })
    expect(referencesOf(plugin, five)).toEqual({ references: [capability] })
    expect(attributeDeclarationsOf(plugin, judge)).toEqual({ underivable: 'plugin' })
  })
  it('keeps the complete workspace manifest domain with Connector identifiers and opaque values', () => {
    const capability = { category: 'connector', name: 'inbound' }
    const manifest = {
      format: 1,
      assets: [{ capability, source: 'connectors/inbound' }],
      assignments: [{ capability, item: 'arbitrary', value: { category: 'connector', body: {} } }],
      disabled: [capability],
    }
    expect(judge.judgeAssetValue('WorkspaceCarrierManifest', manifest)).toEqual({ ok: true })
    expect(parseWorkspaceManifestText(writeJsonLossless(manifest), judge)).toEqual({ ok: manifest })
    expect(
      parseWorkspaceManifestText(writeJsonLossless({ ...manifest, format: 2 }), judge),
    ).toEqual({ rejected: 'manifest_format_unsupported' })
  })
  it('does not recursively classify agent opaque JSON, assignment values, defaults or tool input schemas', () => {
    const fakeBody = { category: 'connector', body: {} }
    const agent = { category: 'agent_definition', body: { nested: fakeBody } } as const
    expect(judge.judgeAssetValue('AssetContent', agent)).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue('AttributeAssignment', {
        item: 'x',
        value: fakeBody,
        immutable: false,
        since: '2026-09-01T00:00:00Z',
      }),
    ).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue('AttributeDeclaration', {
        item: 'x',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema: true },
        default: fakeBody,
      }),
    ).toEqual({ ok: true })
    const tool = fixture('4.1')
    if (
      !isObject(tool) ||
      !Array.isArray(tool.versions) ||
      !isObject(tool.versions[0]) ||
      !isObject(tool.versions[0].content) ||
      !isObject(tool.versions[0].content.definition)
    )
      throw new Error('expected normative tool record')
    const content = {
      ...tool.versions[0].content,
      definition: {
        ...tool.versions[0].content.definition,
        input: { type: 'object', properties: {}, default: fakeBody },
      },
    }
    expect(judge.judgeAssetValue('AssetContent', content)).toEqual({ ok: true })
  })
})
