import { expectTypeOf } from 'vitest'
import type {
  BodyContract,
  BodyContracts,
  CapabilityId,
  AssetDefinition,
  AttributeDeclaration,
} from '../src/index.ts'
import type { CapabilityId as SharedCapabilityId } from '@omne-harness-lite/content-blocks'
declare const tool: BodyContract<'tool'>
declare const ports: BodyContracts
expectTypeOf<CapabilityId>().toEqualTypeOf<SharedCapabilityId>()
// @ts-expect-error M51 a tool contract cannot implement the skill slot
const wrong: BodyContracts = { ...ports, skill: tool }
// @ts-expect-error snapshot input is exclusive to MCP
tool.deriveDeclarations({}, {})
const declaration: AttributeDeclaration = {
  item: 'x',
  kind: 'permission',
  // @ts-expect-error a permission declaration cannot have a setting category
  category: 'binding',
  domain: { kind: 'enum', values: ['a'] },
  default: 'a',
}
const official: AssetDefinition = {
  id: 'a',
  capability: { category: 'tool', name: 'x' },
  origin: 'official',
  // @ts-expect-error authors must be actual tenant identities
  author: {},
  versions: [],
}
expectTypeOf(wrong).toEqualTypeOf<BodyContracts>()
expectTypeOf(declaration).toEqualTypeOf<AttributeDeclaration>()
expectTypeOf(official).toEqualTypeOf<AssetDefinition>()
