import { createRequire } from 'node:module'
import { writeJsonLossless, type JsonValue } from '@omne-harness-lite/content-blocks'
const require = createRequire(new URL('../package.json', import.meta.url))
export function bodyValid(value: JsonValue): boolean {
  const generated = require('./generated/exact.cjs') as {
    AgentDefinitionBody(text: string): { readonly valid: boolean }
  }
  return generated.AgentDefinitionBody(writeJsonLossless(value)).valid
}
