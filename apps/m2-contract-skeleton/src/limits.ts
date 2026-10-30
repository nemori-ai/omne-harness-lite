import type { JsonLimits } from '@omne-harness/json-text'

/**
 * The codec limits of the connected path: the governance and session messages it carries through
 * the public codecs. The governance protocol scenarios keep their own limits in `governance.ts`.
 */
export const PATH_CODEC_LIMITS = {
  maxBytes: 16384,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 128,
  maxStringLength: 4096,
  maxNumberLength: 64,
} satisfies JsonLimits
