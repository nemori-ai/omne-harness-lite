import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  createAssetModelJudge,
  type AttributeDeclaration,
  type BodyContracts,
} from '../src/index.ts'
import { bodies, json } from './ports.ts'
const judge = createAssetModelJudge(bodies)
function declaration(schema: string, value: string): unknown {
  return json(
    `{"item":"test","kind":"setting","category":"preference","domain":{"kind":"open","schema":${schema}},"default":${value}}`,
  )
}
describe('exact JSON number Schema constraints on original values', () => {
  it.each([
    ['{"type":"integer"}', '1.0000000000000000000000001', false],
    ['{"type":"integer"}', '1e400', true],
    ['{"type":["integer","null"]}', '1.0000000000000000000000001', false],
    ['{"type":["integer","null"]}', 'null', true],
    ['{"type":"number","minimum":9007199254740993}', '9007199254740992', false],
    ['{"type":"number","minimum":9007199254740993}', '9007199254740993', true],
    ['{"type":"number","exclusiveMinimum":0.1}', '0.1000000000000000000000001', true],
    ['{"type":"number","maximum":-9007199254740993}', '-9007199254740992', false],
    ['{"type":"number","exclusiveMaximum":1e400}', '1e399', true],
    ['{"type":"number","multipleOf":0.1}', '0.3', true],
    ['{"type":"number","multipleOf":0.1}', '0.3000000000000000000000001', false],
    ['{"type":"number","multipleOf":3}', '1e400', false],
    ['{"type":"number","multipleOf":5}', '1e400', true],
    ['{"type":"number","multipleOf":1e-400}', '1e-399', true],
    ['{"type":"number","multipleOf":-1e-400}', '0', false],
    ['{"type":"string","minLength":1.0000000000000000000001}', '"x"', false],
    ['{"type":"string","maxLength":1e400}', '"x"', true],
    ['{"type":"array","minItems":-1e-400}', '[]', false],
    ['{"type":"object","minProperties":0.000000000000000000001}', '{}', false],
    ['{"type":"array","contains":true,"minContains":1.00000000000000000001}', '[1]', false],
    ['{"type":["integer","integer"]}', '1', false],
    ['{"const":9007199254740993}', '9007199254740992', false],
    ['{"enum":[9007199254740993,null]}', '9007199254740992', false],
    ['{"const":1}', '1.00e0', true],
    [
      '{"type":"object","properties":{"x":{"type":"integer"}}}',
      '{"x":1.0000000000000000001}',
      false,
    ],
    ['{"type":"array","uniqueItems":true}', '[9007199254740992,9007199254740993]', true],
    ['{"type":"array","uniqueItems":true}', '[1,1.0]', false],
    ['{"type":"object","propertyNames":{"const":"a"}}', '{"a":1}', true],
    ['{"type":"object","propertyNames":{"const":"a"}}', '{"b":1}', false],
  ] as const)('checks %s with %s using the decimal source', (schema, value, valid) => {
    const input = declaration(schema, value)
    const before = writeJsonLossless(input)
    expect(judge.judgeAssetValue('AttributeDeclaration', input)).toEqual(
      valid ? { ok: true } : { rejected: 'malformed' },
    )
    expect(writeJsonLossless(input)).toBe(before)
  })
  it.each(['1.0000000000000000000001', '0', '-1', '1e-400'])(
    'rejects inexact/nonpositive version number %s before sequence analysis',
    source => {
      expect(
        judge.judgeAssetValue(
          'AssetDefinition',
          json(
            `{"id":"a","capability":{"category":"plugin","name":"x"},"origin":"official","versions":[{"number":${source},"content":{"category":"plugin","members":[]},"publishedAt":"2026-09-01T00:00:00Z"}]}`,
          ),
        ),
      ).toEqual({ rejected: 'malformed' })
    },
  )
  it('supports overflow positive integers and rejects a rounded near-1 manifest format', () => {
    expect(
      judge.judgeAssetValue('CopyLineage', {
        lineage: 'a',
        sourceVersion: new LosslessNumber('1e400'),
        imports: new LosslessNumber('9007199254740993'),
        importedBy: { organization: 'o', account: 'a' },
        importedAt: '2026-09-01T00:00:00Z',
      }),
    ).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue(
        'WorkspaceCarrierManifest',
        json('{"format":1.0000000000000000000001,"assets":[],"assignments":[],"disabled":[]}'),
      ),
    ).toEqual({ rejected: 'manifest_format_unsupported' })
  })
  it('meta-validates domain Schemas and enforces default membership', () => {
    expect(
      judge.judgeAssetValue('AttributeDomain', { kind: 'open', schema: { type: 'imaginary' } }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judge.judgeAssetValue('AttributeDeclaration', {
        item: 'p',
        kind: 'permission',
        domain: { kind: 'enum', values: ['a'] },
        default: 'b',
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(judge.judgeAssetValue('AttributeDeclaration', declaration('false', 'null'))).toEqual({
      rejected: 'malformed',
    })
    expect(judge.judgeAssetValue('AttributeDeclaration', declaration('true', 'null'))).toEqual({
      ok: true,
    })
  })
})
describe('S-27 dependent body responsibilities and deterministic precedence', () => {
  const record = {
    id: 'a',
    capability: { category: 'slash_command', name: 'omne-official:reload-skill' },
    origin: 'customized',
    owner: { kind: 'organization', organization: 'o' },
    author: { organization: 'o', account: 'a' },
    byAgent: false,
    draft: {
      category: 'slash_command',
      body: { description: 'x', binding: { kind: 'command', service: 'reload' } },
    },
    versions: [],
  }
  it('passes actual record origin, including command binding rejection for customized records', () => {
    let received: unknown
    const ports: BodyContracts = {
      ...bodies,
      slash_command: {
        ...bodies.slash_command,
        judge: (body, context) => {
          received = context
          return bodies.slash_command.judge(body, context)
        },
      },
    }
    expect(createAssetModelJudge(ports).judgeAssetValue('AssetDefinition', record)).toEqual({
      rejected: 'name_reserved',
    })
    expect(received).toEqual({ capabilityName: 'omne-official:reload-skill', origin: 'customized' })
    expect(
      createAssetModelJudge(ports).judgeAssetValue('AssetDefinition', {
        ...record,
        origin: 'builtin',
      }),
    ).toEqual({ rejected: 'origin_unknown' })
  })
  it('orders nested shared rejection values at their existing high-priority positions', () => {
    const ports: BodyContracts = {
      ...bodies,
      tool: { ...bodies.tool, judge: () => ({ rejected: 'category_unknown' }) },
    }
    expect(
      createAssetModelJudge(ports).judgeAssetValue('AssetDefinition', {
        ...record,
        origin: 'builtin',
        draft: { category: 'tool', definition: {} },
      }),
    ).toEqual({ rejected: 'category_unknown' })
  })
  it('uses only explicit declarations for dependent setting values, retaining target_unknown', () => {
    const resource = bodies.connector.schema
    if (typeof resource === 'boolean') throw new Error('expected resource object')
    const declaration: AttributeDeclaration = {
      item: 'target',
      kind: 'setting',
      category: 'placement_identity',
      domain: { kind: 'open', schema: { $ref: `${resource.$id}#/$defs/DeliveryTarget` } },
    }
    const input = {
      item: 'target',
      value: { kind: 'organization' },
      immutable: false,
      since: '2026-09-01T00:00:00Z',
    }
    expect(judge.judgeAssetValue('AttributeAssignment', input)).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue('AttributeAssignment', input, { declarations: [declaration] }),
    ).toEqual({ rejected: 'target_unknown' })
  })
  it('never scans opaque bodies, default data or arbitrary assignment values as asset structure', () => {
    expect(
      judge.judgeAssetValue('AssetContent', {
        category: 'agent_definition',
        body: { category: 'unknown', origin: 'builtin', name: 'a/b' },
      }),
    ).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue('AttributeAssignment', {
        item: 'x',
        value: { category: 'unknown', origin: 'builtin', name: 'a/b' },
        immutable: false,
        since: '2026-09-01T00:00:00Z',
      }),
    ).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue(
        'AttributeDeclaration',
        declaration('true', '{"category":"unknown","name":"a/b"}'),
      ),
    ).toEqual({ ok: true })
    expect(
      judge.judgeAssetValue('AttributeDeclaration', {
        item: 'x',
        kind: 'setting',
        category: 'unknown',
        domain: { kind: 'open', schema: true },
        default: null,
      }),
    ).toEqual({ rejected: 'malformed' })
  })
  it('rejects non-JSON values instead of invoking getters or toJSON', () => {
    let invoked = false
    const input = {
      get category() {
        invoked = true
        return 'tool'
      },
      name: 'x',
    }
    expect(judge.judgeAssetValue('CapabilityId', input)).toEqual({ rejected: 'malformed' })
    expect(invoked).toBe(false)
    expect(
      judge.judgeAssetValue('CapabilityId', { category: 'tool', name: 'x', bad: undefined }),
    ).toEqual({ rejected: 'malformed' })
  })
})
