import { expect, it, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import {
  attributeDeclarationsOf,
  createAssetModelJudge,
  parseWorkspaceManifestText,
  schemaId,
  SCHEMA_DEF_NAMES,
  type AttributeDeclaration,
  type BodyContracts,
} from '../src/index.ts'
import { bodies } from './ports.ts'

const readings = vi.hoisted(() => ({ factories: 0, runtimes: 0, requests: [] as SchemaDocument[] }))
vi.mock('@omne-harness-lite/content-blocks/schema-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@omne-harness-lite/content-blocks/schema-runtime')>()
  function observe(runtime: SchemaRuntime): SchemaRuntime {
    readings.runtimes++
    return {
      ...runtime,
      compile(schema: SchemaDocument) {
        readings.requests.push(schema)
        return runtime.compile(schema)
      },
    }
  }
  return {
    ...actual,
    createSchemaRuntime(...args: Parameters<typeof actual.createSchemaRuntime>) {
      return observe(actual.createSchemaRuntime(...args))
    },
    createSchemaRuntimeFactory(...args: Parameters<typeof actual.createSchemaRuntimeFactory>) {
      readings.factories++
      const createRuntime = actual.createSchemaRuntimeFactory(...args)
      return () => observe(createRuntime())
    },
  }
})

it('reuses the captured owner while each author domain still compiles in its own runtime', () => {
  readings.factories = 0
  readings.runtimes = 0
  readings.requests.length = 0
  const domain = { $ref: `${schemaId}#/$defs/CapabilityName` }
  const declaration: AttributeDeclaration = {
    item: 'targetName',
    kind: 'setting',
    category: 'preference',
    domain: { kind: 'open', schema: domain },
    default: 'target',
  }
  const supply: BodyContracts = {
    ...bodies,
    tool: { ...bodies.tool, deriveDeclarations: () => ({ declarations: [declaration] }) },
  }
  const owner = createAssetModelJudge(supply)
  expect(Object.isFrozen(owner)).toBe(true)
  expect(readings.runtimes).toBe(1)
  expect(readings.requests).toEqual(
    SCHEMA_DEF_NAMES.map(name => ({ $ref: `${schemaId}#/$defs/${name}` })),
  )
  const defect = new Error('replacement provider must not be consulted')
  Object.assign(supply, {
    tool: {
      ...supply.tool,
      deriveDeclarations() {
        throw defect
      },
    },
  })
  const content = { category: 'tool' as const, definition: {} }
  const first = attributeDeclarationsOf(content, owner)
  const second = owner.attributeDeclarationsOf(content)
  expect(second).toEqual(first)
  if (!('declarations' in first)) throw new Error('fixture declarations must be derivable')
  expect(first.declarations.map(item => item.item)).toEqual(['targetName', 'disabled', 'usableBy'])
  const manifest = { format: 1, assets: [], assignments: [], disabled: [] }
  expect(parseWorkspaceManifestText(JSON.stringify(manifest), owner)).toEqual({ ok: manifest })
  expect(readings.runtimes).toBe(3)
  expect(readings.factories).toBe(1)
  expect(readings.requests.slice(SCHEMA_DEF_NAMES.length)).toEqual([domain, domain])
})

it('still rejects a defective explicit supply at construction', () => {
  const invalid = { ...bodies, tool: { ...bodies.tool, schema: {} } }
  expect(() => createAssetModelJudge(invalid)).toThrow('body Schema needs an id: tool')
})

it('meta-validates no-default domains without creating runtimes or compiling author schemas', () => {
  const owner = createAssetModelJudge(bodies)
  readings.runtimes = 0
  readings.requests.length = 0
  for (const schema of [
    true,
    { type: 'string' },
    { $ref: 'https://example.test/unresolved' },
    { type: 'imaginary' },
  ]) {
    const domain = { kind: 'open', schema }
    const expected =
      typeof schema === 'object' && schema.type === 'imaginary'
        ? { rejected: 'malformed' }
        : { ok: true }
    expect(owner.judgeAssetValue('AttributeDomain', domain)).toEqual(expected)
    expect(
      owner.judgeAssetValue('AttributeDeclaration', {
        item: 'target',
        kind: 'setting',
        category: 'placement_identity',
        domain,
      }),
    ).toEqual(expected)
  }
  expect(readings.runtimes).toBe(0)
  expect(readings.requests).toEqual([])
})

it('isolates repeated author ids and default compilation from the owner schemas', () => {
  const owner = createAssetModelJudge(bodies)
  readings.runtimes = 0
  readings.requests.length = 0
  const authorId = 'https://example.test/author-domain'
  for (const schema of [
    { $id: authorId, type: 'string' },
    { $id: authorId, type: 'null' },
    { $id: schemaId, type: 'null' },
  ]) {
    expect(owner.judgeAssetValue('AttributeDomain', { kind: 'open', schema })).toEqual({ ok: true })
  }
  for (const [schema, value, valid] of [
    [{ $id: authorId, type: 'string' }, 'target', true],
    [{ $id: authorId, type: 'null' }, null, true],
    [{ $id: authorId, type: 'null' }, 'target', false],
    [{ $ref: `${schemaId}#/$defs/CapabilityName` }, 'target', true],
    [{ $ref: `${schemaId}#/$defs/CapabilityName` }, null, false],
    [{ $ref: 'https://example.test/unresolved' }, null, false],
  ] as const) {
    expect(
      owner.judgeAssetValue('AttributeDeclaration', {
        item: 'target',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema },
        default: value,
      }),
    ).toEqual(valid ? { ok: true } : { rejected: 'malformed' })
  }
  expect(owner.judgeAssetValue('CapabilityName', 'target')).toEqual({ ok: true })
  expect(owner.judgeAssetValue('CapabilityName', null)).toEqual({ rejected: 'malformed' })
  expect(readings.runtimes).toBe(6)
  expect(readings.requests).toHaveLength(6)
})

it('optionally reuses full exact schemas while isolating colliding author ids', () => {
  const owner = createAssetModelJudge(bodies, { reuseDomainValidators: true })
  const fresh = createAssetModelJudge(bodies, { reuseDomainValidators: true })
  readings.runtimes = 0
  readings.requests.length = 0
  const id = 'https://example.test/same-id'
  const numeric = { $id: id, type: 'number', minimum: new LosslessNumber('9007199254740993') }
  const nullable = { $id: id, type: 'null' }
  function check(schema: SchemaDocument, value: unknown, valid: boolean) {
    expect(
      owner.judgeAssetValue('AttributeDeclaration', {
        item: 'target',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema },
        default: value,
      }),
    ).toEqual(valid ? { ok: true } : { rejected: 'malformed' })
  }
  check(numeric, new LosslessNumber('9007199254740993'), true)
  check(nullable, null, true)
  check(numeric, new LosslessNumber('9007199254740992'), false)
  check(nullable, 'invalid', false)
  expect(readings.runtimes).toBe(2)
  expect(readings.requests).toHaveLength(2)
  numeric.minimum = new LosslessNumber('9007199254740994')
  check(numeric, new LosslessNumber('9007199254740993'), false)
  expect(readings.requests).toHaveLength(3)
  expect(
    fresh.judgeAssetValue('AttributeDeclaration', {
      item: 'target',
      kind: 'setting',
      category: 'preference',
      domain: { kind: 'open', schema: nullable },
      default: null,
    }),
  ).toEqual({ ok: true })
  expect(readings.requests).toHaveLength(4)
})
