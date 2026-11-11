import type { JsonLimits } from '@omne-harness/json-text'

export const TOOL_READ_ARGUMENTS: JsonLimits = Object.freeze({
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 32_768,
  maxNumberLength: 64,
})
