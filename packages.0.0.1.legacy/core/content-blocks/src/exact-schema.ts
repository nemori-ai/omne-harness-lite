import { createRequire } from 'node:module'
import { writeJsonLossless, type JsonValue } from './json.ts'
import type { ExactValidation } from './code-runtime.ts'
export { exactSchema } from './exact-transform.ts'
export { installExactKeywords } from './schema-compiler.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
/** Fixed dialect is built once; native CJS owns the receiver/keyword identity. */
export function createExactMetaValidator(): (schema: JsonValue, projected: JsonValue) => boolean {
  const generated = require('./generated/meta.cjs') as {
    readonly Meta: (text: string) => ExactValidation
  }
  return (schema, _projected) => generated.Meta(writeJsonLossless(schema)).valid
}
