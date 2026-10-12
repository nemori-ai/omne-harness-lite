import { expectTypeOf } from 'vitest'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import {
  createSchemaRuntime,
  type SchemaDocument,
} from '@omne-harness-lite/content-blocks/schema-runtime'
// @ts-expect-error no public original-value projection for manual pairing
import { projection } from '@omne-harness-lite/content-blocks/schema-runtime'
// @ts-expect-error private exact keyword installation is not a public capability
import { installExactKeywords } from '@omne-harness-lite/content-blocks/schema-runtime'
expectTypeOf<SchemaDocument>().toEqualTypeOf<boolean | JsonObject>()
const runtime = createSchemaRuntime([])
// @ts-expect-error cannot override the protected original-value invocation context
createSchemaRuntime([], { passContext: false })
// @ts-expect-error cannot enable async remote Schema loading
createSchemaRuntime([], { loadSchema: async () => ({}) })
// @ts-expect-error cannot enable format assertions through arbitrary Ajv options
createSchemaRuntime([], { validateFormats: true })
// @ts-expect-error validators require JSON values
runtime.compile(true).validate(undefined)
declare const value: JsonValue
expectTypeOf(runtime.compile(true).validate(value)).toEqualTypeOf<boolean>()
