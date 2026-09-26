import { expectTypeOf } from 'vitest'
import type {
  BodyContract,
  BodyContracts,
  CapabilityId,
  AssetDefinition,
  AttributeDeclaration,
} from '../src/index.ts'
import type { CapabilityId as SharedCapabilityId } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import { createSchemaRuntime } from '../src/schema-runtime.ts'
// @ts-expect-error private projection cannot be imported from the protected entry
import { projection } from '../src/schema-runtime.ts'
declare const tool: BodyContract<'tool'>
declare const ports: BodyContracts
declare const tenant: TenantId
const schemaRuntime = createSchemaRuntime([])
// @ts-expect-error callers cannot override original-value invocation protection
createSchemaRuntime([], { passContext: false })
// @ts-expect-error callers cannot add a remote loader
createSchemaRuntime([], { loadSchema: async () => ({}) })
// @ts-expect-error compiled validators only accept public JSON values
schemaRuntime.compile(true).validate(undefined)
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
// @ts-expect-error official records forbid even a valid tenant author
const forbiddenOfficial: AssetDefinition = { ...official, origin: 'official', author: tenant }
// @ts-expect-error preference settings require an author default
const missingDefault: AttributeDeclaration = {
  item: 'x',
  kind: 'setting',
  category: 'preference',
  domain: { kind: 'open', schema: true },
}
expectTypeOf(wrong).toEqualTypeOf<BodyContracts>()
expectTypeOf(declaration).toEqualTypeOf<AttributeDeclaration>()
expectTypeOf(official).toEqualTypeOf<AssetDefinition>()
expectTypeOf(forbiddenOfficial).toEqualTypeOf<AssetDefinition>()
expectTypeOf(missingDefault).toEqualTypeOf<AttributeDeclaration>()
