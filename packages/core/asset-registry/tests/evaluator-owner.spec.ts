// @module-tag slow
// Full asset evaluation and real Schema compilation exercise repeated table preparation.
import { expect, test, vi } from 'vitest'
import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { buildTableContents, REGISTERED_CATEGORIES, selectBody } from '../src/index.ts'
import { fixture, tool } from './support.ts'

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

test('table preparation and full body selection retain the supplied evaluator without recompiling tool schemas', () => {
  const f = fixture()
  const evaluator = createAssetEvaluator()
  readings.compiled.length = 0
  const built = buildTableContents(
    f.evaluation,
    f.order,
    f.definitions,
    REGISTERED_CATEGORIES,
    evaluator,
  )
  expect(built).toHaveProperty('plans')
  const compiled = readings.compiled.length
  expect(compiled).toBeGreaterThan(0)
  expect(
    buildTableContents(f.evaluation, f.order, f.definitions, REGISTERED_CATEGORIES, evaluator),
  ).toEqual(built)
  const effective = f.evaluation.assets.find(asset => asset.capability.name === tool.name)
  if (!effective) throw new Error('tool fixture absent')
  expect(selectBody(f.definitions, effective, evaluator)).toBeDefined()
  expect(readings.compiled).toHaveLength(compiled)
  const changed = f.definitions.map(definition =>
    definition.capability.name === tool.name
      ? {
          ...definition,
          versions: [
            {
              number: 1,
              publishedAt: '2026-09-27T00:00:00Z',
              content: {
                category: 'tool',
                definition: {
                  name: tool.name,
                  paradigm: 'single',
                  description: 'invalid',
                  origin: { kind: 'authored' },
                  input: { type: 'not-a-type' },
                  permissions: { execute: { default: 'auto' } },
                },
              },
            },
          ],
        }
      : definition,
  )
  expect(
    buildTableContents(f.evaluation, f.order, changed, REGISTERED_CATEGORIES, evaluator),
  ).toEqual({ failure: 'unavailable' })
  expect(
    buildTableContents(f.evaluation, f.order, f.definitions, REGISTERED_CATEGORIES, evaluator),
  ).toEqual(built)
})
