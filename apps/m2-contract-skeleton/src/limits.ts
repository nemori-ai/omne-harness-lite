import type { JsonLimits } from '@omne-harness/json-text'

export const PATH_CODEC_LIMITS = {
  maxBytes: 16384,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 128,
  maxStringLength: 4096,
  maxNumberLength: 64,
} satisfies JsonLimits
