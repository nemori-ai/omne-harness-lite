import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  generateOpaqueIdentifier,
  OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS,
  parseTenantId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { LosslessNumber, writeJsonLossless, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import {
  attributeDeclarationsOf,
  referencesOf,
  DISABLED_DECLARATION,
  USABLE_BY_DECLARATION,
  capabilityCanonicalString,
  carrierRecordId,
  contentFingerprint,
  createAssetModelJudge,
  isCapabilityName,
  normalizeWorkspaceDirectory,
  parseCapabilityCanonicalString,
  parseWorkspaceManifestText,
  type BodyContracts,
  type AttributeDeclaration,
} from '../src/index.ts'
import { bodies, json } from './ports.ts'
import { isObject } from '../src/judge.ts'

const judge = createAssetModelJudge(bodies)
describe('S-2/S-3 identity and canonical spelling', () => {
  it.each(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)(
    'rejects shared whitespace U+%s at every position',
    point => {
      const character = String.fromCodePoint(point)
      for (const value of [character + 'x', 'x' + character + 'y', 'x' + character])
        expect(isCapabilityName(value)).toBe(false)
    },
  )
  it('does not normalize, trim, fold or exclude allowed colon/Unicode/control characters', () => {
    for (const name of [
      'omne-official:reload-skill',
      '代码审查',
      'a\u200by',
      'a\u0000b',
      'e\u0301',
      'é',
    ]) {
      const id = { category: 'skill', name } as const
      expect(parseCapabilityCanonicalString(capabilityCanonicalString(id))).toEqual({ ok: id })
    }
    expect(isCapabilityName('a/b')).toBe(false)
    expect(parseCapabilityCanonicalString('tool/a/b')).toEqual({ rejected: 'name_invalid' })
    expect(parseCapabilityCanonicalString('model_call')).toEqual({ rejected: 'malformed' })
    expect(parseCapabilityCanonicalString('Tool/x')).toEqual({ rejected: 'category_unknown' })
    expect(judge.judgeAssetValue('CapabilityId', 'tool/x')).toEqual({ rejected: 'malformed' })
  })
})
describe('S-4/S-17/S-19 deterministic literal algorithms', () => {
  const tenant = unwrap(parseTenantId({ organization: 'org', account: 'account' }))
  it('normalizes absolute literal directories only', () => {
    expect(normalizeWorkspaceDirectory('/a//b/../c/./')).toBe('/a/c')
    expect(normalizeWorkspaceDirectory('/')).toBe('/')
    expect(normalizeWorkspaceDirectory('/A')).toBe('/A')
    expect(() => normalizeWorkspaceDirectory('relative/path')).toThrow(TypeError)
  })
  it('uses the exact injected tuple encoding, is injective for a fixed Cartesian corpus and disjoint from random ids', () => {
    const ids = new Set<string>()
    for (const directory of ['/a', '/a:b', '/中文', '/😀'])
      for (const category of ['tool', 'skill'] as const)
        for (const name of ['x', 'X', 'x:y']) {
          const workspace = { tenant, directory }
          const capability = { category, name }
          const result = carrierRecordId(workspace, capability)
          const oracle =
            'wsc1.' +
            Buffer.from(
              JSON.stringify(['org', 'account', directory, category, name]),
              'utf8',
            ).toString('base64url')
          expect(result).toBe(oracle)
          expect(carrierRecordId(workspace, capability)).toBe(result)
          expect(ids.has(result)).toBe(false)
          ids.add(result)
          expect(generateOpaqueIdentifier()).not.toContain('.')
        }
    expect(() =>
      carrierRecordId({ tenant, directory: '/a/' }, { category: 'tool', name: 'x' }),
    ).toThrow(TypeError)
  })
  it('fingerprints codepoint ordered keys (including integer-like keys), stable nested key order and original numeric spelling', () => {
    const value = json(
      '{"𐀀":1,"":2,"2":3,"10":4,"n":9007199254740993,"a":{"z":1.000000000000000000001,"b":1e400}}',
    )
    const canonical =
      '{"10":4,"2":3,"a":{"b":1e400,"z":1.000000000000000000001},"n":9007199254740993,"":2,"𐀀":1}'
    expect(contentFingerprint(value)).toBe(createHash('sha256').update(canonical).digest('hex'))
    expect(contentFingerprint({ z: 1, a: { b: 2, a: 3 } })).toBe(
      contentFingerprint({ a: { a: 3, b: 2 }, z: 1 }),
    )
    expect(contentFingerprint(new LosslessNumber('1.0'))).not.toBe(contentFingerprint(1))
    expect(contentFingerprint(toOpaqueJson(value))).toBe(contentFingerprint(value))
  })
})
describe('S-12/S-15/S-36 explicit declaration responsibility', () => {
  it('adds exactly the two shared reserved declarations', () => {
    expect(attributeDeclarationsOf({ category: 'tool', definition: {} }, bodies)).toEqual({
      declarations: [DISABLED_DECLARATION, USABLE_BY_DECLARATION],
    })
    expect(Object.isFrozen(DISABLED_DECLARATION.domain)).toBe(true)
    expect(USABLE_BY_DECLARATION).toEqual({
      item: 'usableBy',
      kind: 'permission',
      domain: { kind: 'enum', values: ['superAdministrator', 'member', 'self'] },
      default: 'self',
    })
  })
  it('does not replace accepted underivable results with an empty or partial set', () => {
    expect(
      attributeDeclarationsOf(
        { category: 'agent_definition', body: toOpaqueJson({ hostile: true }) },
        bodies,
      ),
    ).toEqual({ underivable: 'agent_definition' })
    expect(attributeDeclarationsOf({ category: 'plugin', members: [] }, bodies)).toEqual({
      underivable: 'plugin',
    })
    expect(attributeDeclarationsOf({ category: 'connector', body: {} }, bodies)).toEqual({
      underivable: 'connector',
    })
  })
  it.each(['disabled', 'usableBy', 'duplicate'])('throws body rule defects: %s', item => {
    const declarations =
      item === 'duplicate'
        ? [USABLE_BY_DECLARATION, USABLE_BY_DECLARATION].map(d => ({ ...d, item: 'same' }))
        : [{ ...DISABLED_DECLARATION, item }]
    const contracts: BodyContracts = {
      ...bodies,
      tool: { ...bodies.tool, deriveDeclarations: () => ({ declarations }) },
    }
    expect(() => attributeDeclarationsOf({ category: 'tool', definition: {} }, contracts)).toThrow(
      TypeError,
    )
  })
  it('passes the explicit snapshot only to MCP', () => {
    let received: unknown
    const contracts: BodyContracts = {
      ...bodies,
      mcp: {
        ...bodies.mcp,
        deriveDeclarations: (_body, snapshot) => {
          received = snapshot
          return { declarations: [], actionSnapshotKind: 'fetched' }
        },
      },
    }
    const snapshot = json('{"kind":"fetched","actions":[]}')
    attributeDeclarationsOf({ category: 'mcp', body: {} }, contracts, snapshot)
    expect(received).toBe(snapshot)
    expect(() =>
      attributeDeclarationsOf({ category: 'tool', definition: {} }, contracts, snapshot),
    ).toThrow(TypeError)
    expect(() =>
      attributeDeclarationsOf({ category: 'plugin', members: [] }, contracts, snapshot),
    ).toThrow(TypeError)
  })
  it('calls the connector port and treats an invented partial set as a body defect', () => {
    let called = false
    const contracts: BodyContracts = {
      ...bodies,
      connector: {
        ...bodies.connector,
        deriveDeclarations: () => {
          called = true
          return { underivable: 'connector' }
        },
      },
    }
    expect(attributeDeclarationsOf({ category: 'connector', body: {} }, contracts)).toEqual({
      underivable: 'connector',
    })
    expect(called).toBe(true)
    expect(() =>
      attributeDeclarationsOf(
        { category: 'connector', body: {} },
        {
          ...bodies,
          connector: { ...bodies.connector, deriveDeclarations: () => ({ declarations: [] }) },
        },
      ),
    ).toThrow(TypeError)
  })
  it('pins declaration and reference outputs without changing numeric source or values', () => {
    const domain = { type: 'object' }
    const originalDefault = { n: new LosslessNumber('9007199254740993') }
    const declaration: AttributeDeclaration = {
      item: 'x',
      kind: 'setting',
      category: 'preference',
      domain: { kind: 'open', schema: domain },
      default: originalDefault,
    }
    const contracts: BodyContracts = {
      ...bodies,
      tool: { ...bodies.tool, deriveDeclarations: () => ({ declarations: [declaration] }) },
    }
    const result = attributeDeclarationsOf({ category: 'tool', definition: {} }, contracts)
    expect('declarations' in result && result.declarations[0]).toEqual(declaration)
    domain.type = 'string'
    originalDefault.n = new LosslessNumber('1')
    if (!('declarations' in result)) throw new Error('expected derived declarations')
    const first = result.declarations[0]
    if (first === undefined) throw new Error('expected first declaration')
    expect(first.domain).toEqual({ kind: 'open', schema: { type: 'object' } })
    expect(writeJsonLossless(first.default)).toBe('{"n":9007199254740993}')
    const member = { category: 'tool' as const, name: 'before' }
    const references = referencesOf({ category: 'plugin', members: [member] }, bodies)
    member.name = 'after'
    expect(references).toEqual({ references: [{ category: 'tool', name: 'before' }] })
  })
  it('keeps references explicit and does not inspect agent body', () => {
    const member = { category: 'tool', name: 'x' } as const
    expect(referencesOf({ category: 'plugin', members: [member] }, bodies)).toEqual({
      references: [member],
    })
    expect(
      referencesOf({ category: 'agent_definition', body: toOpaqueJson({ tool: member }) }, bodies),
    ).toEqual({ underivable: 'agent_definition' })
  })
  it('detects missing/misclassified ports at construction and preserves their thrown defects', () => {
    expect(() =>
      Reflect.apply(createAssetModelJudge, undefined, [{ ...bodies, skill: undefined }]),
    ).toThrow(TypeError)
    expect(() =>
      Reflect.apply(createAssetModelJudge, undefined, [{ ...bodies, skill: bodies.tool }]),
    ).toThrow(TypeError)
    const defect = new Error('body implementation defect')
    const broken: BodyContracts = {
      ...bodies,
      tool: {
        ...bodies.tool,
        judge: () => {
          throw defect
        },
      },
    }
    expect(() =>
      createAssetModelJudge(broken).judgeAssetValue('AssetContent', {
        category: 'tool',
        definition: {},
      }),
    ).toThrow(defect)
  })
  it('binds fixed Schema and responsibility closures at construction', () => {
    const originalSchema = bodies.tool.schema
    if (typeof originalSchema === 'boolean' || !isObject(originalSchema.$defs))
      throw new Error('expected fixed resource id')
    const mutableSchema = {
      ...originalSchema,
      $defs: {
        ...originalSchema.$defs,
        ToolDefinition: { type: 'object', required: ['sentinel'] },
      },
    }
    const port = {
      ...bodies.tool,
      schema: mutableSchema,
      judge: () => ({ rejected: 'original' }),
    }
    const bound = createAssetModelJudge({ ...bodies, tool: port })
    mutableSchema.$defs.ToolDefinition.required.push('later')
    port.judge = () => ({ rejected: 'changed' })
    expect(bound.judgeAssetValue('AssetContent', { category: 'tool', definition: {} })).toEqual({
      rejected: 'original',
    })
    expect(
      bound.validate('AssetContent', { category: 'tool', definition: { sentinel: true } }),
    ).toEqual({
      valid: true,
    })
  })
})
describe('S-24/S-28 strict text and lossless untouched values', () => {
  it.each([
    '{"format":1,"format":2,"assets":[],"assignments":[],"disabled":[]}',
    '{"format":1,"assets":[],"assignments":[],"disabled":[],"\\u0061ssets":[]}',
    '{"format":1,"assets":[],"assignments":[{"value":{"a":1,"\\u0061":2}}],"disabled":[]}',
  ])('rejects decoded duplicate member text', text =>
    expect(parseWorkspaceManifestText(text, bodies)).toEqual({ rejected: 'malformed' }),
  )
  it('retains long decimals, overflow literals, null and immutable manifest fields without repairs', () => {
    const text =
      '{"format":1,"assets":[],"assignments":[{"capability":{"category":"tool","name":"x"},"item":"n","value":[9007199254740993,1.000000000000000000001,1e400,null],"immutable":true}],"disabled":[]}'
    const result = parseWorkspaceManifestText(text, bodies)
    expect('ok' in result && writeJsonLossless(result.ok)).toBe(text)
    expect(parseWorkspaceManifestText('{"format":1,"assets":[],"assignments":[]}', bodies)).toEqual(
      { rejected: 'malformed' },
    )
  })
  it('exports frozen bytes without modifying the accepted Schema', () =>
    expect(readFileSync(new URL('../schema/asset-model.schema.json', import.meta.url))).toEqual(
      readFileSync(
        new URL(
          '../../../../.meta_harness/design/spec/data/asset-model/v1/asset-model.schema.json',
          import.meta.url,
        ),
      ),
    ))
})
