import { expect, it, vi } from 'vitest'
import type { SchemaDocument } from '@omne-harness-lite/content-blocks/schema-runtime'
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

const readings = vi.hoisted(() => ({ runtimes: 0, requests: [] as SchemaDocument[] }))
vi.mock('@omne-harness-lite/content-blocks/schema-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@omne-harness-lite/content-blocks/schema-runtime')>()
  return {
    ...actual,
    createSchemaRuntime(...args: Parameters<typeof actual.createSchemaRuntime>) {
      readings.runtimes++
      const runtime = actual.createSchemaRuntime(...args)
      return {
        ...runtime,
        compile(schema: SchemaDocument) {
          readings.requests.push(schema)
          return runtime.compile(schema)
        },
      }
    },
  }
})

it('reuses the captured owner while each author domain still compiles in its own runtime', () => {
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
  expect(readings.requests.slice(SCHEMA_DEF_NAMES.length)).toEqual([domain, domain])
})

it('still rejects a defective explicit supply at construction', () => {
  const invalid = { ...bodies, tool: { ...bodies.tool, schema: {} } }
  expect(() => createAssetModelJudge(invalid)).toThrow('body Schema needs an id: tool')
})
