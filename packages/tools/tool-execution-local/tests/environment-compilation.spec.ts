import { expect, test, vi } from 'vitest'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import { createToolEnvironmentPlacementSource } from '../src/index.ts'
import { placementFixture, scope } from './placement-fixture.ts'

const compiled = vi.hoisted(() => [] as SchemaDocument[])
vi.mock('@omne-harness-lite/content-blocks/schema-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@omne-harness-lite/content-blocks/schema-runtime')>()
  function observe(runtime: SchemaRuntime): SchemaRuntime {
    return {
      ...runtime,
      compile(schema) {
        compiled.push(schema)
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

test('placement reuses the supplied assembly compiler while reading current inputs each time', async () => {
  const h = placementFixture()
  const evaluator = createAssetEvaluator()
  expect(
    evaluator.evaluate(h.input(), { toolEnvironmentPermission: 'always-allow' }),
  ).toHaveProperty('ok')
  const source = createToolEnvironmentPlacementSource(
    { name: 'owned', factoryPermission: 'always-allow' },
    {
      tools: { acquire: h.acquire },
      currentInputs: { read: h.inputs },
      select: h.select,
      evaluator,
    },
  )
  compiled.length = 0
  expect(await source.read(scope, h.token, h.call)).toHaveProperty('kind', 'placement')
  expect(await source.read(scope, h.token, h.call)).toHaveProperty('kind', 'placement')
  expect(compiled).toHaveLength(0)
  expect(h.inputs).toHaveBeenCalledTimes(2)
  h.setCurrent({ input: { ...h.input(), standing: { standing: 'ineffective' } } })
  expect(await source.read(scope, h.token, h.call)).toHaveProperty('kind', 'rejected')
  expect(compiled).toHaveLength(0)
  expect(h.release).toHaveBeenCalledTimes(3)
})

test('standalone placement owns its compiler for its lifetime', async () => {
  const h = placementFixture()
  expect(await h.query()).toHaveProperty('kind', 'placement')
  compiled.length = 0
  expect(await h.query()).toHaveProperty('kind', 'placement')
  expect(compiled).toHaveLength(0)
  expect(h.inputs).toHaveBeenCalledTimes(2)
})
