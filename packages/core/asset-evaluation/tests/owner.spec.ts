import { expect, it, vi } from 'vitest'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { createAssetEvaluator, evaluate } from '../src/index.ts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import loopSchemaV3 from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import { assignment, definition, simple, shell, workspace } from './fixtures.ts'

const readings = vi.hoisted(() => ({ compiled: [] as SchemaDocument[] }))
vi.mock('@omne-harness-lite/content-blocks/schema-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@omne-harness-lite/content-blocks/schema-runtime')>()
  function observe(runtime: SchemaRuntime): SchemaRuntime {
    return {
      ...runtime,
      compile(schema) {
        readings.compiled.push(schema)
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
      const create = actual.createSchemaRuntimeFactory(...args)
      return () => observe(create())
    },
  }
})

it('constructs new owners from published snapshots after upstream schema mutation', () => {
  const originalId = loopSchemaV3.$id
  try {
    loopSchemaV3.$id = 'urn:changed'
    expect(createAssetEvaluator().evaluate(simple())).toHaveProperty('ok')
  } finally {
    loopSchemaV3.$id = originalId
  }
})

it('reuses compiled schemas across evaluation, selection, result and carrier reads', () => {
  const owner = createAssetEvaluator()
  const input = {
    ...simple(),
    session: [{ capability: shell, assignment: assignment('timeout', 'PT5S') }],
  }
  readings.compiled.length = 0
  const first = owner.evaluate(input, { toolEnvironmentPermission: 'always-allow' })
  expect(first).toHaveProperty('ok')
  if (!('ok' in first)) throw new Error('fixture rejected')
  expect(readings.compiled.length).toBeGreaterThan(0)
  const compiled = readings.compiled.length
  expect(owner.evaluate(input, { toolEnvironmentPermission: 'always-allow' })).toEqual(first)
  expect(
    owner.selectEvaluationRootSource({ ...input, rootDefinition: input.root.definition }),
  ).toEqual({ ok: input.root.source })
  expect(owner.judgeEffectiveAssembly(first.ok)).toBe(true)
  const manifest = { format: 1 as const, assets: [], assignments: [], disabled: [] }
  expect(owner.readWorkspaceCarrier(manifest, workspace)).toHaveProperty('ok')
  expect(readings.compiled).toHaveLength(compiled)
  expect(
    owner.evaluate({
      ...input,
      session: [{ capability: shell, assignment: assignment('timeout', 'invalid') }],
    }),
  ).toHaveProperty('invalidInput')
  expect(readings.compiled).toHaveLength(compiled)
})

it('keeps the convenience evaluator free of an author compilation cache', () => {
  const input = simple()
  expect(evaluate(input)).toHaveProperty('ok')
  readings.compiled.length = 0
  expect(evaluate(input)).toHaveProperty('ok')
  expect(readings.compiled.length).toBeGreaterThan(0)
})

it.each([
  { input: { type: 'imaginary' }, timeout: 'PT1S' },
  { input: { type: 'object', properties: {} }, timeout: 'invalid' },
])('retains rejection results for invalid schemas and defaults after warmup: %j', fields => {
  const owner = createAssetEvaluator()
  expect(owner.evaluate(simple())).toHaveProperty('ok')
  const base = simple()
  const invalid = {
    ...base,
    definitions: base.definitions.map(value =>
      value.id === 'ast_value'
        ? definition('ast_value', shell, {
            category: 'tool',
            definition: {
              name: 'shell',
              description: 'test',
              paradigm: 'single',
              origin: { kind: 'authored' },
              input: fields.input,
              permissions: { execute: { default: 'ask' } },
              settings: { timeout: { category: 'preference', default: fields.timeout } },
            },
          })
        : value,
    ),
  }
  const rejected = owner.evaluate(invalid)
  expect(rejected).toHaveProperty('invalidInput')
  expect(rejected).toEqual(evaluate(invalid))
})

it('keeps changed tool schemas independent across assembly owners and validates every call', () => {
  function tool(kind: 'integer' | 'string'): ToolDefinition {
    return {
      name: 'shell',
      description: 'test',
      paradigm: 'single',
      origin: { kind: 'authored' },
      input: {
        type: 'object',
        properties: { value: { type: kind, description: 'value' } },
        required: ['value'],
      },
      permissions: { execute: { default: 'ask' } },
      settings: {
        targetEnvironment: {
          category: 'placement_identity',
          default: {
            bindingLayer: 'host_machine',
            facilities: ['command'],
          },
        },
      },
    }
  }
  function input(tool: ToolDefinition) {
    const copied = copyJsonValue(tool)
    if ('failed' in copied) throw new Error('invalid fixture')
    const base = simple()
    return {
      ...base,
      definitions: base.definitions.map(value =>
        value.id === 'ast_value'
          ? definition('ast_value', shell, { category: 'tool', definition: copied.ok })
          : value,
      ),
    }
  }
  const integer = tool('integer')
  const string = tool('string')
  const first = createAssetEvaluator()
  const second = createAssetEvaluator()
  expect(first.evaluate(input(integer))).toHaveProperty('ok')
  expect(second.evaluate(input(string))).toHaveProperty('ok')
  readings.compiled.length = 0
  expect(first.parameters.judgeCallArguments(integer, { value: 1 })).toHaveProperty('ok')
  expect(first.parameters.judgeCallArguments(integer, { value: 'x' })).toHaveProperty('invalid')
  expect(second.parameters.judgeCallArguments(string, { value: 'x' })).toHaveProperty('ok')
  expect(second.parameters.judgeCallArguments(string, { value: 1 })).toHaveProperty('invalid')
  expect(first.evaluate(input(integer))).toHaveProperty('ok')
  const changedPermission = first.evaluate(input(integer), {
    toolEnvironmentPermission: 'never-allow',
  })
  if (!('ok' in changedPermission)) throw new Error('valid permission rejected')
  expect(
    changedPermission.ok.values.find(value => value.item === 'executionEnvironment')?.value,
  ).toEqual({ allowed: ['never-allow'] })
  expect(readings.compiled).toHaveLength(0)
})
