// @module-tag slow
// Real SQLite, account setup and Schema compilation exercise the reader lifetime.
import { expect, test, vi } from 'vitest'
import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { createEvaluationInputReader } from '../src/index.ts'
import { publishLocalInputs, captureSessionRecipe } from '../src/publication.ts'
import { boot, asset, body, holding, ROOT } from './support.ts'

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

test('a SQLite input reader shares its supplied evaluator through publication, definition parsing and every read', async () => {
  const tool = { category: 'tool', name: 'example:read' } as const
  const h = await boot(undefined, [
    { capability: ROOT, meta: false },
    { capability: tool, meta: false },
  ])
  const evaluator = createAssetEvaluator()
  const deps = { ...h.deps, evaluator }
  const reader = createEvaluationInputReader(deps)
  try {
    const { tenant } = await h.identity('owner')
    const base = body()
    const root = asset([{ ...base, references: [{ capability: tool }] }])
    const toolAsset = {
      id: 'ast_read',
      capability: tool,
      origin: 'official',
      versions: [
        {
          number: 1,
          publishedAt: '2026-09-27T00:00:00Z',
          content: {
            category: 'tool',
            definition: {
              name: tool.name,
              paradigm: 'single',
              description: 'Read text',
              origin: { kind: 'authored' },
              input: {
                type: 'object',
                properties: { path: { type: 'string', description: 'Path' } },
                required: ['path'],
                additionalProperties: false,
              },
              permissions: { execute: { default: 'auto' } },
            },
          },
        },
      ],
    }
    const publication = {
      expectedRevision: null,
      definitions: [root, toolAsset],
      scopes: [
        {
          holder: { layer: 'factory' },
          holdings: [
            holding({ layer: 'factory' }),
            { ...holding({ layer: 'factory' }), capability: tool, asset: toolAsset.id },
          ],
        },
        { holder: { layer: 'organization', organization: tenant.organization }, holdings: [] },
        { holder: { layer: 'tenant', tenant }, holdings: [] },
      ],
    }
    expect(await publishLocalInputs(deps, publication)).toEqual({ revision: '1' })
    await h.mapSession('session_owner', tenant)
    expect(
      await captureSessionRecipe(deps, { session: 'session_owner', tenant, rootDefinition: ROOT }),
    ).toHaveProperty('captured')
    readings.compiled.length = 0
    const first = await reader.read('session_owner', tenant)
    expect(first).toHaveProperty('input')
    const compiled = readings.compiled.length
    expect(compiled).toBe(0)
    expect(await reader.read('session_owner', tenant)).toEqual(first)
    expect(readings.compiled).toHaveLength(compiled)
    expect(
      await publishLocalInputs(deps, {
        ...publication,
        expectedRevision: '1',
        scopes: [],
        definitions: [
          {
            ...toolAsset,
            versions: [
              {
                ...toolAsset.versions[0],
                content: {
                  category: 'tool',
                  definition: {
                    ...toolAsset.versions[0]?.content.definition,
                    input: { type: 'not-a-type' },
                  },
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({ failure: 'invalidInput' })
    expect(await reader.read('session_owner', tenant)).toEqual(first)
    const reassembled = createEvaluationInputReader({ ...deps, evaluator: createAssetEvaluator() })
    try {
      const before = readings.compiled.length
      expect(await reassembled.read('session_owner', tenant)).toEqual(first)
      expect(readings.compiled.length).toBeGreaterThan(before)
    } finally {
      await reassembled.close()
    }
  } finally {
    await reader.close()
    await h.close()
  }
}, 30000)
